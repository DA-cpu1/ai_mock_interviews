import {randomUUID} from "node:crypto";

import {z} from "zod";

import {getCurrentUser} from "@/lib/action/auth.action";
import {AliyunConfigError, getAliyunRealtimeConfig} from "@/lib/aliyun/config.server";
import {createArtcToken, createRtcUserId} from "@/lib/aliyun/rtc-token.server";

// 这是用户点击“开始语音面试”时调用的准备接口。
// 它负责验证用户、读取服务端配置并生成短期通话 Token；真正的 RTC 通话
// 会在浏览器拿到下面的配置后，再交给 AICallKit 建立。
// 阿里云 App Key 只在服务器参与 Token 计算，不会返回给浏览器。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionRequestSchema = z.object({}).strict();

const jsonError = (status: number, code: string, message: string) =>
    Response.json(
        {error: {code, message}},
        {
            status,
            headers: {"Cache-Control": "no-store"},
        },
    );

// 当前接口不需要业务参数，所以只接受空 JSON 对象 `{}`，并拒绝明显过大的请求。
const parseRequestBody = async (request: Request): Promise<boolean> => {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("application/json")) {
        return false;
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > 2048) {
        return false;
    }

    try {
        const body: unknown = await request.json();
        return sessionRequestSchema.safeParse(body).success;
    } catch {
        return false;
    }
};

// POST /api/ai-realtime/sessions：为一次新的 AI 语音面试准备连接信息。
export async function POST(request: Request) {
    // 先启动登录检查，再解析请求体，减少无意义的等待。
    const currentUserPromise = getCurrentUser();
    const validBody = await parseRequestBody(request);

    if (!validBody) {
        return jsonError(400, "INVALID_REQUEST", "请求必须是空 JSON 对象。" );
    }

    const currentUser = await currentUserPromise;

    // 未登录用户不能申请 RTC 通话凭证。
    if (!currentUser) {
        return jsonError(401, "UNAUTHENTICATED", "请先登录后再发起语音面试。" );
    }

    let config;

    try {
        // 配置模块只读取服务端环境变量；缺失配置时不把密钥等细节暴露给客户端。
        config = getAliyunRealtimeConfig();
    } catch (error) {
        if (error instanceof AliyunConfigError) {
            console.error("[ai-realtime] invalid server configuration", error.message);
        } else {
            console.error("[ai-realtime] failed to load server configuration", error);
        }

        return jsonError(500, "SERVER_CONFIG_INVALID", "阿里云实时互动服务尚未完成服务端配置。" );
    }

    // 这是一个可以快速关闭新通话的回滚开关。
    if (!config.enabled) {
        return jsonError(503, "REALTIME_DISABLED", "阿里云实时互动功能当前未开启。" );
    }

    // 每次请求都使用新的随机会话和频道；频道 ID 会被写入 Token，供 RTC 校验。
    const sessionId = randomUUID();
    const channelId = `prep_${sessionId.replaceAll("-", "")}`;

    // 不直接把 Firebase 用户 ID 暴露给 RTC，而是生成稳定的匿名用户 ID。
    const userId = createRtcUserId(currentUser.id);

    // App Key 只在服务端生成短期 Token，浏览器拿到的只是 Token 本身。
    const token = createArtcToken({
        appId: config.appId,
        appKey: config.appKey,
        channelId,
        userId,
        expiresInSeconds: config.tokenTtlSeconds,
    });

    // 返回浏览器建立 AICallKit 通话所需的最小配置；禁止缓存，避免复用过期 Token。
    return Response.json(
        {
            sessionId,
            userId,
            agentId: config.agentId,
            region: config.region,
            userJoinToken: token.base64Token,
            expiresAt: token.expiresAt,
            agentConfig: {
                // AICallKit 使用秒，这里把环境变量中的分钟数转换成秒。
                agentMaxIdleTime: config.maxSessionMinutes * 60,
                enableIntelligentSegment: true,
                agentGracefulShutdown: true,
            },
        },
        {
            headers: {"Cache-Control": "no-store"},
        },
    );
}
