import "server-only";

import {randomUUID} from "node:crypto";
import {db} from "@/firebase/admin";
import type {AiRealtimeSessionRecord} from "@/types/ai-realtime";
import type {FeedbackContent, FeedbackRecord} from "@/types/feedback";
import {decideGenerationLease, type FinalizeLeaseDecision} from "./finalize-policy";

const LEASE_MS = 60_000;
export class FeedbackStoreError extends Error { constructor(readonly code: "NOT_FOUND" | "FORBIDDEN" | "ATTEMPT_LOST") { super(code); } }

export const readFeedback = async (sessionId: string): Promise<FeedbackRecord | null> => {
    const snapshot = await db.collection("feedbacks").doc(sessionId).get();
    return snapshot.exists ? snapshot.data() as FeedbackRecord : null;
};

export const markTranscriptStatus = async (sessionId: string, userId: string, status: AiRealtimeSessionRecord["transcriptStatus"]) => {
    const ref = db.collection("interviewSessions").doc(sessionId);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new FeedbackStoreError("NOT_FOUND");
        // 状态更新也要重新核验用户，避免只凭页面已经登录就写入任意 Session。
        if ((snapshot.data() as AiRealtimeSessionRecord).userId !== userId) throw new FeedbackStoreError("FORBIDDEN");
        transaction.update(ref, {transcriptStatus: status});
    });
};

export const claimFeedbackGeneration = async (sessionId: string, userId: string, now = new Date()): Promise<FinalizeLeaseDecision> => {
    const sessionRef = db.collection("interviewSessions").doc(sessionId);
    const nowMs = now.getTime();
    const attemptId = randomUUID();
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(sessionRef);
        if (!snapshot.exists) throw new FeedbackStoreError("NOT_FOUND");
        const session = snapshot.data() as AiRealtimeSessionRecord;
        if (session.userId !== userId) throw new FeedbackStoreError("FORBIDDEN");
        const existing = await transaction.get(db.collection("feedbacks").doc(sessionId));
        if (existing.exists) return {kind: "ready"};
        const decision = decideGenerationLease(session, nowMs, attemptId, LEASE_MS);
        if (decision.kind === "claim") transaction.update(sessionRef, {
            feedbackStatus: "generating", generationAttemptId: decision.attemptId,
            generationLeaseExpiresAt: decision.leaseExpiresAt, feedbackErrorCode: null,
        });
        return decision;
    });
};

export const saveGeneratedFeedback = async (input: {
    sessionId: string; userId: string; interviewId: string; transcriptHash: string;
    content: FeedbackContent; model: string; promptVersion: string; attemptId: string;
    transcriptSource?: "aliyun_callback" | "browser_subtitles"; transcriptTruncated?: boolean;
    createdAt?: string;
}): Promise<FeedbackRecord> => {
    const sessionRef = db.collection("interviewSessions").doc(input.sessionId);
    const feedbackRef = db.collection("feedbacks").doc(input.sessionId);
    return db.runTransaction(async (transaction) => {
        const sessionSnapshot = await transaction.get(sessionRef);
        if (!sessionSnapshot.exists) throw new FeedbackStoreError("NOT_FOUND");
        const session = sessionSnapshot.data() as AiRealtimeSessionRecord;
        if (session.userId !== input.userId) throw new FeedbackStoreError("FORBIDDEN");
        if (session.generationAttemptId !== input.attemptId) throw new FeedbackStoreError("ATTEMPT_LOST");
        const existing = await transaction.get(feedbackRef);
        if (existing.exists) return existing.data() as FeedbackRecord;
        const totalScore = Math.round(input.content.categoryScores.reduce((sum, item) => sum + item.score, 0) / input.content.categoryScores.length);
        const feedback: FeedbackRecord = {id: input.sessionId, sessionId: input.sessionId, interviewId: input.interviewId, userId: input.userId, totalScore, ...input.content, model: input.model, promptVersion: input.promptVersion, transcriptHash: input.transcriptHash, createdAt: input.createdAt ?? new Date().toISOString()};
        feedback.transcriptSource = input.transcriptSource ?? "aliyun_callback";
        feedback.transcriptTruncated = input.transcriptTruncated ?? false;
        transaction.create(feedbackRef, feedback);
        transaction.update(sessionRef, {feedbackId: feedback.id, feedbackStatus: "ready", generationLeaseExpiresAt: null, feedbackErrorCode: null});
        return feedback;
    });
};

export const markFeedbackFailed = async (sessionId: string, userId: string, attemptId: string, code: string) => {
    const ref = db.collection("interviewSessions").doc(sessionId);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new FeedbackStoreError("NOT_FOUND");
        const session = snapshot.data() as AiRealtimeSessionRecord;
        if (session.userId !== userId) throw new FeedbackStoreError("FORBIDDEN");
        if (session.generationAttemptId !== attemptId) return;
        transaction.update(ref, {feedbackStatus: "failed", feedbackErrorCode: code, generationLeaseExpiresAt: null});
    });
};
