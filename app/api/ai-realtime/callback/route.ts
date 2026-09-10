import {after} from "next/server";

import {
    CallbackHandlerError,
    CallbackPersistenceError,
    handleAliyunCallback,
} from "@/lib/ai-realtime/callback-handler.server";
import {
    AliyunCallbackConfigError,
    getAliyunCallbackConfig,
} from "@/lib/aliyun/callback-config.server";
import {
    isValidCallbackAuthorization,
    parseAliyunCallbackPayload,
    readAliyunCallbackBody,
} from "@/lib/aliyun/callback-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 响应后保存仍受平台执行时限约束。
export const maxDuration = 60;

const NO_STORE_HEADERS = {"Cache-Control": "no-store"};

const jsonError = (status: number, code: string, message: string) => Response.json(
    {error: {code, message}},
    {status, headers: NO_STORE_HEADERS},
);

// Aliyun may probe the configured callback URL before sending POST events.
export function GET() {
    return new Response(null, {status: 200, headers: NO_STORE_HEADERS});
}

export function HEAD() {
    return new Response(null, {status: 200, headers: NO_STORE_HEADERS});
}

// 回调来自阿里云服务，不具备用户的 Firebase Cookie；这里使用独立专用 Token，
// 持久化层再根据 sessionId、agentId 和 instanceId 在数据库边界校验归属。
export async function POST(request: Request) {
    let config;
    try {
        config = getAliyunCallbackConfig();
    } catch (error) {
        console.error(
            "[ai-realtime] invalid callback configuration",
            error instanceof AliyunCallbackConfigError ? error.name : "UnknownError",
        );
        return jsonError(503, "CALLBACK_CONFIG_INVALID", "回调服务配置不正确。");
    }

    if (!config.enabled) {
        return jsonError(503, "CALLBACK_DISABLED", "回调服务尚未启用。");
    }
    if (!isValidCallbackAuthorization(
        request.headers.get("authorization") ?? undefined,
        config.token,
    )) {
        return jsonError(401, "UNAUTHORIZED_CALLBACK", "回调鉴权失败。");
    }

    const bodyResult = await readAliyunCallbackBody(request);
    if (bodyResult.kind === "too_large") {
        return jsonError(413, "PAYLOAD_TOO_LARGE", "回调请求体过大。");
    }
    if (bodyResult.kind !== "ok") {
        return jsonError(400, "INVALID_CALLBACK_REQUEST", "回调请求格式不正确。");
    }

    const parseResult = parseAliyunCallbackPayload(bodyResult.body);
    if (parseResult.kind === "invalid") {
        return jsonError(400, parseResult.code, "回调数据格式不正确。");
    }
    if (parseResult.kind === "ignored") {
        return new Response(null, {status: 200, headers: NO_STORE_HEADERS});
    }

    const callback = parseResult.callback;
    const diagnostic = {event: callback.event, sessionId: callback.sessionId};
    // 阿里云可能串行投递：不能让 Firestore 延迟阻塞后续 chat_record。
    // after 在响应发送后执行，并由 Next.js/Vercel 管理任务生命周期。
    after(async () => {
        const startedAt = Date.now();
        try {
            const result = await handleAliyunCallback(callback);
            console.info("[ai-realtime] callback persisted", {
                ...diagnostic, ...result, durationMs: Date.now() - startedAt,
            });
        } catch (error) {
            // 已返回 200，不能再通过 HTTP 触发重试；保留可关联的脱敏失败日志。
            console.error("[ai-realtime] callback persistence after response failed", {
                ...diagnostic,
                category: error instanceof CallbackPersistenceError || error instanceof CallbackHandlerError
                    ? error.code : "CALLBACK_PERSISTENCE_FAILED",
                durationMs: Date.now() - startedAt,
            });
        }
    });
    console.info("[ai-realtime] callback accepted", diagnostic);
    // Aliyun treats only HTTP 200 as a successful callback acknowledgement.
    return new Response(null, {status: 200, headers: NO_STORE_HEADERS});
}
