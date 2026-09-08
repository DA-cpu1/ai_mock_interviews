import "server-only";

import {getOwnedInterviewPromptContext} from "@/lib/interviews/interview-store.server";
import {readTranscriptForFeedback} from "@/lib/ai-realtime/transcript-store.server";
import {generateFeedback, FeedbackGenerationError} from "./generate.server";
import type {FinalizeState} from "./finalize-policy";
import {claimFeedbackGeneration, markFeedbackFailed, markTranscriptStatus, readFeedback, saveGeneratedFeedback, FeedbackStoreError} from "./feedback-store.server";

export interface FinalizeResult { status: FinalizeState; feedbackId?: string; retryAfterMs?: number; errorCode?: string; }

/** 编排边界先做所有权校验，再读取 transcript；模型调用永远发生在事务之外。 */
export const finalizeFeedback = async (sessionId: string, userId: string, options: {now?: Date} = {}): Promise<FinalizeResult> => {
    const existing = await readFeedback(sessionId);
    if (existing) return {status: "ready", feedbackId: existing.id};
    const transcriptResult = await readTranscriptForFeedback(sessionId, options);
    if (!transcriptResult || transcriptResult.session.userId !== userId) throw new FeedbackStoreError(transcriptResult ? "FORBIDDEN" : "NOT_FOUND");
    const readiness = transcriptResult.readiness;
    if (readiness.status === "pending") return {status: "transcript_pending", retryAfterMs: readiness.retryAfterMs};
    if (readiness.status === "insufficient") {
        await markTranscriptStatus(sessionId, userId, "insufficient");
        return {status: "insufficient_transcript"};
    }
    if (readiness.status === "failed") {
        await markTranscriptStatus(sessionId, userId, "failed");
        return {status: "provider_failed", errorCode: readiness.code};
    }
    await markTranscriptStatus(sessionId, userId, "ready");
    const context = await getOwnedInterviewPromptContext(transcriptResult.session.interviewId, userId);
    if (!context) throw new FeedbackStoreError("FORBIDDEN");
    const decision = await claimFeedbackGeneration(sessionId, userId, options.now);
    if (decision.kind === "ready") return {status: "ready", feedbackId: sessionId};
    if (decision.kind === "generating") return {status: "generating", retryAfterMs: 2_000};
    try {
        const generated = await generateFeedback({interview: context, transcript: readiness.transcript});
        const feedback = await saveGeneratedFeedback({sessionId, userId, interviewId: transcriptResult.session.interviewId, transcriptHash: readiness.transcriptHash, content: generated.content, model: generated.model, promptVersion: generated.promptVersion, attemptId: decision.attemptId!});
        return {status: "ready", feedbackId: feedback.id};
    } catch (error) {
        const code = error instanceof FeedbackGenerationError ? error.code : "FEEDBACK_PERSISTENCE_FAILED";
        await markFeedbackFailed(sessionId, userId, decision.attemptId!, code);
        return {status: "provider_failed", errorCode: code};
    }
};
