import type {
    AiRealtimeSessionRecord,
    AiRealtimeUserSessionState,
} from "@/types/ai-realtime";

const ACTIVE_GRACE_MS = 2 * 60 * 1000;

export type SessionStartPlan =
    | {kind: "start"; leaseExpiresAt: string}
    | {kind: "already-active"}
    | {kind: "expired"}
    | {kind: "invalid"};

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
