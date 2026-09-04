import "server-only";

import {z} from "zod";

import {getCurrentUser} from "@/lib/action/auth.action";
import {AliyunConfigError, getAliyunRealtimeConfig} from "@/lib/aliyun/config.server";
import type {
    AiRealtimeSessionEndRequest,
    AiRealtimeSessionErrorCode,
} from "@/types/ai-realtime";

import {SessionLifecycleError, updateSessionLifecycle} from "./session-lifecycle.server";

type LifecycleAction = "start" | "end";
const emptyBodySchema = z.object({}).strict();
const endBodySchema = z.discriminatedUnion("outcome", [
    z.object({outcome: z.literal("completed")}).strict(),
    z.object({outcome: z.literal("user_cancelled")}).strict(),
    z.object({
        outcome: z.literal("failed"),
        errorCode: z.enum([
            "AGENT_START_FAILED",
            "RTC_CONNECTION_FAILED",
            "RTC_TOKEN_EXPIRED",
            "SESSION_REPLACED",
            "MICROPHONE_UNAVAILABLE",
            "AGENT_CONFIG_INVALID",
            "SESSION_START_FAILED",
            "SDK_ERROR",
        ]),
    }).strict(),
]);
const sessionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

const jsonError = (status: number, code: AiRealtimeSessionErrorCode, message: string) =>
    Response.json(
        {error: {code, message}},
        {status, headers: {"Cache-Control": "no-store"}},
    );

// start 只接受空对象；end 只接受稳定 outcome，技术失败还必须带稳定错误码。
const parseBody = async (
    request: Request,
    action: LifecycleAction,
): Promise<true | AiRealtimeSessionEndRequest | null> => {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) return null;

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 2048) return null;

    try {
        const body: unknown = await request.json();
        if (action === "start") return emptyBodySchema.safeParse(body).success || null;

        const result = endBodySchema.safeParse(body);
        return result.success ? result.data : null;
    } catch {
        return null;
    }
};

// 两个接口共用这里，避免认证、校验和错误提示出现两套不同写法。
export const handleSessionLifecycle = async (
    request: Request,
    sessionId: string,
    action: LifecycleAction,
): Promise<Response> => {
    const currentUserPromise = getCurrentUser();
    const body = await parseBody(request, action);
    if (!body || !sessionIdPattern.test(sessionId)) {
        return jsonError(400, "INVALID_REQUEST", "请求格式不正确。");
    }

    const currentUser = await currentUserPromise;
    if (!currentUser) {
        return jsonError(401, "UNAUTHENTICATED", "请先登录后再操作面试会话。");
    }

    let maxSessionMinutes = 0;
    if (action === "start") {
        try {
            maxSessionMinutes = getAliyunRealtimeConfig().maxSessionMinutes;
        } catch (error) {
            const errorName = error instanceof AliyunConfigError ? error.name : "UnknownError";
            console.error("[ai-realtime] failed to read session duration", errorName);
            return jsonError(500, "SERVER_CONFIG_INVALID", "服务端通话时长配置不正确。");
        }
    }

    try {
        await updateSessionLifecycle({
            sessionId,
            userId: currentUser.id,
            action,
            maxSessionMinutes,
            endRequest: action === "end" && body !== true ? body : undefined,
        });
    } catch (error) {
        if (error instanceof SessionLifecycleError) {
            if (error.code === "SESSION_NOT_FOUND") {
                return jsonError(404, error.code, "找不到这个面试会话。");
            }
            if (error.code === "SESSION_EXPIRED") {
                return jsonError(410, error.code, "会话已经过期，请重新开始。");
            }
            if (error.code === "INVALID_SESSION_STATE") {
                return jsonError(409, error.code, "当前会话状态不允许这样操作。");
            }
        }

        console.error(
            "[ai-realtime] failed to update session",
            error instanceof Error ? error.name : "UnknownError",
        );
        return jsonError(500, "SESSION_UPDATE_FAILED", "更新面试会话失败，请稍后重试。");
    }

    return Response.json(
        {success: true, sessionId},
        {headers: {"Cache-Control": "no-store"}},
    );
};
