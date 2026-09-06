import type {
    NormalizedAliyunCallback,
} from "@/lib/aliyun/callback-protocol";
import type {AiRealtimeSessionRecord} from "@/types/ai-realtime";

export type CallbackSessionRejectCode = "SESSION_INSTANCE_MISMATCH";

export interface CallbackSessionUpdate {
    status?: "active" | "completed" | "failed";
    agentInstanceId?: string;
    startedAt?: string;
    providerStoppedAt?: string;
    errorCode?: "SDK_ERROR";
}

export type CallbackSessionPlan =
    | {kind: "update"; updates: CallbackSessionUpdate}
    | {kind: "reject"; code: CallbackSessionRejectCode};

// Provider events may arrive out of order, but terminal session states never move back.
export const getCallbackSessionPlan = (
    session: AiRealtimeSessionRecord,
    callback: NormalizedAliyunCallback,
): CallbackSessionPlan => {
    if (session.agentInstanceId && session.agentInstanceId !== callback.instanceId) {
        return {kind: "reject", code: "SESSION_INSTANCE_MISMATCH"};
    }

    const updates: CallbackSessionUpdate = session.agentInstanceId
        ? {}
        : {agentInstanceId: callback.instanceId};

    if (callback.event === "agent_start" || callback.event === "session_start") {
        if (session.status === "created") {
            updates.status = "active";
            if (!session.startedAt) updates.startedAt = callback.occurredAt;
        }
    } else if (callback.event === "agent_stop") {
        if (!session.providerStoppedAt) updates.providerStoppedAt = callback.occurredAt;
        if (session.status === "created" || session.status === "active") {
            updates.status = "completed";
        }
    } else if (callback.event === "error") {
        if (session.status === "created" || session.status === "active") {
            updates.status = "failed";
            updates.errorCode = "SDK_ERROR";
        }
    }

    return {kind: "update", updates};
};
