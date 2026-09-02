import "server-only";

import {db} from "@/firebase/admin";
import type {
    AiRealtimeSessionErrorCode,
    AiRealtimeSessionRecord,
    AiRealtimeUserSessionState,
} from "@/types/ai-realtime";
const ACTIVE_GRACE_MS = 2 * 60 * 1000;
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
    now?: Date;
}
// 在同一个事务里更新会话和用户锁，避免一个成功、另一个失败。
export const updateSessionLifecycle = async ({
    sessionId,
    userId,
    action,
    maxSessionMinutes,
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
            const ownsValidLock = state?.activeSessionId === sessionId
                && Boolean(state.leaseExpiresAt)
                && Date.parse(state.leaseExpiresAt ?? "") > now.getTime();
            // SDK 可能重复通知接通；只有锁仍有效时才能直接当作成功。
            if (session.status === "active" && ownsValidLock) return null;
            if (session.status === "active") {
                throw new SessionLifecycleError("SESSION_EXPIRED");
            }
            if (session.status !== "created") {
                throw new SessionLifecycleError("INVALID_SESSION_STATE");
            }

            const tokenExpired = Date.parse(session.tokenExpiresAt) <= now.getTime();
            const lockLost = !ownsValidLock;
            if (tokenExpired || lockLost) {
                transaction.update(sessionRef, {
                    status: "failed",
                    errorCode: "SESSION_EXPIRED",
                    leaseExpiresAt: nowIso,
                });
                if (!lockLost) {
                    transaction.update(stateRef, {activeSessionId: null, leaseExpiresAt: null});
                }
                return "SESSION_EXPIRED" as const;
            }

            // 接通后把占用时间延长到最长通话时间，并多留两分钟做清理。
            const leaseExpiresAt = new Date(
                now.getTime() + maxSessionMinutes * 60_000 + ACTIVE_GRACE_MS,
            ).toISOString();
            transaction.update(sessionRef, {status: "active", startedAt: nowIso, leaseExpiresAt});
            transaction.update(stateRef, {leaseExpiresAt});
            return null;
        }

        // 结束操作可以重复调用；只有仍指向本会话的锁才会被释放。
        transaction.update(sessionRef, {
            status: session.status === "failed" ? "failed" : "completed",
            endedAt: session.endedAt ?? nowIso,
            leaseExpiresAt: nowIso,
        });
        if (state?.activeSessionId === sessionId) {
            transaction.update(stateRef, {activeSessionId: null, leaseExpiresAt: null});
        }
        return null;
    });

    // 过期状态需要先写回数据库，再在事务完成后返回给接口。
    if (result === "SESSION_EXPIRED") throw new SessionLifecycleError(result);
};
