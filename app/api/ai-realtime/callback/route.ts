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
// 后续 M3 仍会根据 sessionId、agentId 和 instanceId 在数据库边界重新校验归属。
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

    // M2 只完成安全接入与协议规范化；控制台必须等 M3 持久化接入后再启用。
    return new Response(null, {status: 204, headers: NO_STORE_HEADERS});
}
