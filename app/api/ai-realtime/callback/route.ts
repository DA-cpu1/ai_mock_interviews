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

const NO_STORE_HEADERS = {"Cache-Control": "no-store"};

const jsonError = (status: number, code: string, message: string) => Response.json(
    {error: {code, message}},
    {status, headers: NO_STORE_HEADERS},
);

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

    try {
        await handleAliyunCallback(parseResult.callback);
    } catch (error) {
        if (error instanceof CallbackPersistenceError) {
            if (error.code === "SESSION_NOT_FOUND") {
                return jsonError(404, error.code, "回调关联的面试会话不存在。");
            }
            return jsonError(409, error.code, "回调与面试会话的服务实例不匹配。");
        }
        if (error instanceof CallbackHandlerError) {
            return jsonError(503, error.code, "回调暂时无法保存，请稍后重试。");
        }
        return jsonError(503, "CALLBACK_PERSISTENCE_FAILED", "回调暂时无法保存，请稍后重试。");
    }

    // Aliyun treats only HTTP 200 as a successful callback acknowledgement.
    return new Response(null, {status: 200, headers: NO_STORE_HEADERS});
}
