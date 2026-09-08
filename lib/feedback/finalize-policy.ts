import type {AiRealtimeFeedbackStatus, AiRealtimeSessionRecord} from "@/types/ai-realtime";

export type FinalizeState =
    | "ready"
    | "generating"
    | "transcript_pending"
    | "insufficient_transcript"
    | "provider_failed";

export interface FinalizeLeaseDecision {
    kind: "ready" | "generating" | "claim";
    attemptId?: string;
    leaseExpiresAt?: string;
}

/** 只依据 Session 的持久化字段判断是否可以再次取得生成租约。 */
export const decideGenerationLease = (
    session: Pick<AiRealtimeSessionRecord, "feedbackId" | "feedbackStatus" | "generationAttemptId" | "generationLeaseExpiresAt">,
    nowMs: number,
    attemptId: string,
    leaseMs: number,
): FinalizeLeaseDecision => {
    if (session.feedbackId || session.feedbackStatus === "ready") return {kind: "ready"};
    const leaseExpiresMs = Date.parse(session.generationLeaseExpiresAt ?? "");
    if (session.feedbackStatus === "generating"
        && session.generationAttemptId
        && Number.isFinite(leaseExpiresMs)
        && leaseExpiresMs > nowMs) {
        return {kind: "generating", leaseExpiresAt: session.generationLeaseExpiresAt};
    }
    return {
        kind: "claim",
        attemptId,
        leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
    };
};

export const mapFinalizeStatus = (
    transcriptStatus: "pending" | "ready" | "insufficient" | "failed",
    feedbackStatus: AiRealtimeFeedbackStatus,
): FinalizeState => {
    if (feedbackStatus === "ready") return "ready";
    if (feedbackStatus === "generating") return "generating";
    if (transcriptStatus === "pending") return "transcript_pending";
    if (transcriptStatus === "insufficient") return "insufficient_transcript";
    return "provider_failed";
};
