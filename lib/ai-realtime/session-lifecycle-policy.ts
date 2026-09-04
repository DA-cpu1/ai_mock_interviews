import type {
    AiRealtimeSessionEndRequest,
    AiRealtimeSessionRecord,
    AiRealtimeUserSessionState,
} from "@/types/ai-realtime";

const ACTIVE_GRACE_MS = 2 * 60 * 1000;

export type SessionStartPlan =
    | {kind: "start"; leaseExpiresAt: string}
    | {kind: "already-active"}
    | {kind: "expired"}
    | {kind: "invalid"};

export interface SessionEndPlan {
    status: "completed" | "failed";
    endOutcome: AiRealtimeSessionEndRequest["outcome"];
    endedAt: string;
    leaseExpiresAt: string;
    errorCode: string | null;
}

// 这里只做判断，不读数据库也不看真实时间，所以测试可以稳定复现每种情况。
export const getSessionStartPlan = (
    session: AiRealtimeSessionRecord,
    state: AiRealtimeUserSessionState | undefined,
    nowMs: number,
    maxSessionMinutes: number,
): SessionStartPlan => {
    const ownsValidLock = state?.activeSessionId === session.id
        && Boolean(state.leaseExpiresAt)
        && Date.parse(state.leaseExpiresAt ?? "") > nowMs;

    if (session.status === "active") {
        return ownsValidLock ? {kind: "already-active"} : {kind: "expired"};
    }
    if (session.status !== "created") return {kind: "invalid"};
    if (Date.parse(session.tokenExpiresAt) <= nowMs || !ownsValidLock) {
        return {kind: "expired"};
    }

    return {
        kind: "start",
        leaseExpiresAt: new Date(
            nowMs + maxSessionMinutes * 60_000 + ACTIVE_GRACE_MS,
        ).toISOString(),
    };
};

export const getSessionEndPlan = (
    session: AiRealtimeSessionRecord,
    request: AiRealtimeSessionEndRequest,
    nowIso: string,
): SessionEndPlan => {
    // 首次结束结果是权威结果。后续 end 可能来自 SDK callEnd、页面卸载或重试，
    // 只能再次释放租约，不能把原来的失败改成完成或重写首次结束时间。
    if (session.status === "completed" || session.status === "failed" || session.endedAt) {
        return {
            status: session.status === "failed" ? "failed" : "completed",
            endOutcome: session.endOutcome
                ?? (session.status === "failed" ? "failed" : "completed"),
            endedAt: session.endedAt ?? nowIso,
            leaseExpiresAt: nowIso,
            errorCode: session.errorCode ?? null,
        };
    }

    if (request.outcome === "failed") {
        return {
            status: "failed",
            endOutcome: request.outcome,
            endedAt: nowIso,
            leaseExpiresAt: nowIso,
            errorCode: request.errorCode,
        };
    }

    return {
        status: "completed",
        endOutcome: request.outcome,
        endedAt: nowIso,
        leaseExpiresAt: nowIso,
        errorCode: null,
    };
};
