import "server-only";

import {db} from "@/firebase/admin";
import type {
    AiRealtimeSessionEndRequest,
    AiRealtimeSessionErrorCode,
    AiRealtimeSessionRecord,
    AiRealtimeUserSessionState,
} from "@/types/ai-realtime";

import {getSessionEndPlan, getSessionStartPlan} from "./session-lifecycle-policy";

type LifecycleAction = "start" | "end";

export class SessionLifecycleError extends Error {
    readonly code: AiRealtimeSessionErrorCode;
    constructor(code: AiRealtimeSessionErrorCode) {
        super(code);
        this.name = "SessionLifecycleError";
        this.code = code;
    }
}

interface UpdateSessionInput {
    sessionId: string;
    userId: string;
    action: LifecycleAction;
    maxSessionMinutes: number;
    endRequest?: AiRealtimeSessionEndRequest;
    now?: Date;
}
// 在同一个事务里更新会话和用户锁，避免一个成功、另一个失败。
export const updateSessionLifecycle = async ({
    sessionId,
    userId,
    action,
    maxSessionMinutes,
    endRequest,
    now = new Date(),
}: UpdateSessionInput): Promise<void> => {
    const sessionRef = db.collection("interviewSessions").doc(sessionId);
    const stateRef = db.collection("aiRealtimeUserStates").doc(userId);
    const nowIso = now.toISOString();
    const result = await db.runTransaction(async (transaction) => {
        const [sessionSnapshot, stateSnapshot] = await transaction.getAll(sessionRef, stateRef);

        // 不告诉调用方会话属于谁，避免别人通过 ID 猜测用户数据。
        if (!sessionSnapshot.exists || sessionSnapshot.get("userId") !== userId) {
            throw new SessionLifecycleError("SESSION_NOT_FOUND");
        }

        const session = sessionSnapshot.data() as AiRealtimeSessionRecord;
        const state = stateSnapshot.exists
            ? stateSnapshot.data() as AiRealtimeUserSessionState
            : undefined;

        if (action === "start") {
            const plan = getSessionStartPlan(session, state, now.getTime(), maxSessionMinutes);
            if (plan.kind === "already-active") return null;
            if (plan.kind === "invalid") {
                throw new SessionLifecycleError("INVALID_SESSION_STATE");
            }
            if (plan.kind === "expired") {
                transaction.update(sessionRef, {
                    status: "failed",
                    errorCode: "SESSION_EXPIRED",
                    leaseExpiresAt: nowIso,
                });
                if (state?.activeSessionId === sessionId) {
                    transaction.update(stateRef, {activeSessionId: null, leaseExpiresAt: null});
                }
                return "SESSION_EXPIRED" as const;
            }

            transaction.update(sessionRef, {
                status: "active",
                startedAt: nowIso,
                leaseExpiresAt: plan.leaseExpiresAt,
            });
            transaction.update(stateRef, {leaseExpiresAt: plan.leaseExpiresAt});
            return null;
        }

        if (!endRequest) throw new SessionLifecycleError("INVALID_SESSION_STATE");

        const endPlan = getSessionEndPlan(session, endRequest, nowIso);
        transaction.update(sessionRef, endPlan);
        if (state?.activeSessionId === sessionId) {
            transaction.update(stateRef, {activeSessionId: null, leaseExpiresAt: null});
        }
        return null;
    });

    // 过期状态需要先写回数据库，再在事务完成后返回给接口。
    if (result === "SESSION_EXPIRED") throw new SessionLifecycleError(result);
};
