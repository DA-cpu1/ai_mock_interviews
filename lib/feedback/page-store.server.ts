import "server-only";
import {db} from "@/firebase/admin";
import type {AiRealtimeSessionRecord} from "@/types/ai-realtime";
import {readFeedback} from "./feedback-store.server";
import {getFeedbackPageState, isFeedbackId, ownsFeedbackSession} from "./page-policy";

export const readFeedbackPage = async (sessionId: unknown, interviewId: string, userId: string) => {
    if (!isFeedbackId(sessionId) || !isFeedbackId(interviewId)) return null;
    const snapshot = await db.collection("interviewSessions").doc(sessionId).get();
    if (!snapshot.exists) return null;
    const session = snapshot.data() as AiRealtimeSessionRecord;
    // 两个 URL 参数都不可信，读取反馈前必须同时核验会话归属与所属面试。
    if (!ownsFeedbackSession(session, userId, interviewId)) return null;
    const feedback = await readFeedback(sessionId);
    if (feedback && (feedback.userId !== userId || feedback.interviewId !== interviewId
        || feedback.sessionId !== sessionId)) return null;
    return {sessionId, feedback, state: getFeedbackPageState(session)};
};
