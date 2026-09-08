import type {AiRealtimeSessionRecord} from "../../types/ai-realtime.ts";
import type {FinalizeState} from "./finalize-policy.ts";

export const isFeedbackId = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export const ownsFeedbackSession = (
    session: Pick<AiRealtimeSessionRecord, "userId" | "interviewId">,
    userId: string,
    interviewId: string,
) => session.userId === userId && session.interviewId === interviewId;

export type FeedbackPageState = Exclude<FinalizeState, "ready"> | "call_failed";

// 技术失败不自动评分；失败记录刷新后仍等待用户显式重试。
export const getFeedbackPageState = (session: Pick<AiRealtimeSessionRecord,
    "status" | "endOutcome" | "feedbackStatus" | "transcriptStatus"
>): FeedbackPageState => {
    if (session.status === "failed" || session.endOutcome === "failed") return "call_failed";
    if (session.feedbackStatus === "failed" || session.transcriptStatus === "failed") return "provider_failed";
    if (session.feedbackStatus === "generating") return "generating";
    if (session.transcriptStatus === "insufficient") return "insufficient_transcript";
    return "transcript_pending";
};
