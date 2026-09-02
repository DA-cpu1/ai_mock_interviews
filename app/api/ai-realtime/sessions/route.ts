import {randomUUID} from "node:crypto";

import {z} from "zod";

import {getCurrentUser} from "@/lib/action/auth.action";
import {SessionCreationError} from "@/lib/ai-realtime/session-policy";
import {createSessionWithActiveLock} from "@/lib/ai-realtime/session-store.server";
import {AliyunConfigError, getAliyunRealtimeConfig} from "@/lib/aliyun/config.server";
import {createArtcToken, createRtcUserId} from "@/lib/aliyun/rtc-token.server";
import type {
    AiRealtimeSessionErrorCode,
    AiRealtimeSessionRequest,
    AiRealtimeSessionRecord,
} from "@/types/ai-realtime";

// 这是用户点击“开始语音面试”时调用的准备接口。
// 它负责验证用户、读取服务端配置并生成短期通话 Token；真正的 RTC 通话
// 会在浏览器拿到下面的配置后，再交给 AICallKit 建立。
// 阿里云 App Key 只在服务器参与 Token 计算，不会返回给浏览器。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionRequestSchema = z.object({
    // Firestore 自动生成的 ID 只包含字母和数字；同时兼容项目常用的 _ 和 -。
    interviewId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

const jsonError = (status: number, code: AiRealtimeSessionErrorCode, message: string) =>
    Response.json(
        {error: {code, message}},
        {
            status,
            headers: {"Cache-Control": "no-store"},
        },
    );

// 这里只接收面试 ID，并提前挡住错误格式和明显过大的请求。
const parseRequestBody = async (request: Request): Promise<AiRealtimeSessionRequest | null> => {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

    if (!contentType.includes("application/json")) {
        return null;
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > 2048) {
        return null;
    }

    try {
        const body: unknown = await request.json();
        const result = sessionRequestSchema.safeParse(body);
        return result.success ? result.data : null;
    } catch {
        return null;
    }
};

// POST /api/ai-realtime/sessions：为一次新的 AI 语音面试准备连接信息。
export async function POST(request: Request) {
    // 先启动登录检查，再解析请求体，减少无意义的等待。
    const currentUserPromise = getCurrentUser();
    const body = await parseRequestBody(request);

    if (!body) {
        return jsonError(400, "INVALID_REQUEST", "请提供正确的面试 ID。");
    }

    const currentUser = await currentUserPromise;

    // 未登录用户不能申请 RTC 通话凭证。
    if (!currentUser) {
        return jsonError(401, "UNAUTHENTICATED", "请先登录后再发起语音面试。");
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

        return jsonError(500, "SERVER_CONFIG_INVALID", "阿里云实时互动服务尚未完成服务端配置。");
    }

    // 这是一个可以快速关闭新通话的回滚开关。
    if (!config.enabled) {
        return jsonError(503, "REALTIME_DISABLED", "阿里云实时互动功能当前未开启。");
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

    const createdAt = new Date().toISOString();
    const sessionRecord: AiRealtimeSessionRecord = {
        id: sessionId,
        interviewId: body.interviewId,
        userId: currentUser.id,
        rtcUserId: userId,
        channelId,
        agentId: config.agentId,
        region: config.region,
        status: "created",
        conversationMode: "semantic",
        modelConfigVersion: "voice-v1",
        tokenExpiresAt: token.expiresAt,
        // 尚未接通时，Token 过期就自动释放占用，避免失败请求一直卡住用户。
        leaseExpiresAt: token.expiresAt,
        createdAt,
    };

    try {
        await createSessionWithActiveLock(sessionRecord);
    } catch (error) {
        if (error instanceof SessionCreationError) {
            if (error.code === "INTERVIEW_NOT_FOUND") {
                return jsonError(404, error.code, "找不到这场面试。");
            }
            if (error.code === "ACTIVE_SESSION_EXISTS") {
                return jsonError(409, error.code, "你已经有一场正在进行的面试。");
            }
            if (error.code === "RATE_LIMITED") {
                return jsonError(429, error.code, "操作太快，请稍后再试。");
            }
        }

        // 只在服务端记录错误类型，不把数据库细节或凭证返回浏览器。
        console.error(
            "[ai-realtime] failed to create session",
            error instanceof Error ? error.name : "UnknownError",
        );
        return jsonError(500, "SESSION_CREATE_FAILED", "创建面试会话失败，请稍后重试。");
    }

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
