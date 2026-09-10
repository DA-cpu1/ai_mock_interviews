import "server-only";

import {z} from "zod";

import {INTERVIEW_TYPES} from "@/constants/interviews";
import {db} from "@/firebase/admin";
import type {InterviewPromptContext} from "@/lib/ai-realtime/interview-prompt";
import type {FeedbackRecord} from "@/types/feedback";

const interviewPromptContextSchema = z.object({
    role: z.string().trim().min(1).max(80),
    level: z.string().trim().min(1).max(40),
    type: z.enum(INTERVIEW_TYPES),
    techstack: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
});

const interviewSummarySchema = interviewPromptContextSchema.extend({
    createdAt: z.string().trim().min(1).max(40),
});

export interface InterviewSummary extends InterviewPromptContext {
    id: string;
    createdAt: string;
}

export interface InterviewFeedbackSummary {
    sessionId: string;
    status: "processing" | "failed" | "ready";
    totalScore?: number;
    finalAssessment?: string;
    createdAt: string;
}

export const getOwnedInterviewPromptContext = async (
    interviewId: string,
    userId: string,
): Promise<InterviewPromptContext | null> => {
    const snapshot = await db.collection("interviews").doc(interviewId).get();

    if (!snapshot.exists || snapshot.get("userId") !== userId) return null;

    const result = interviewPromptContextSchema.safeParse(snapshot.data());
    return result.success ? result.data : null;
};

export const listUserInterviews = async (
    userId: string,
    limit = 6,
): Promise<InterviewSummary[]> => {
    try {
        const snapshot = await db.collection("interviews")
            .where("userId", "==", userId)
            .get();
        const interviews = snapshot.docs.flatMap((document) => {
            const result = interviewSummarySchema.safeParse(document.data());
            return result.success ? [{id: document.id, ...result.data}] : [];
        });

        return interviews
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, Math.min(Math.max(limit, 1), 12));
    } catch (error) {
        console.error(
            "[interviews] failed to list user interviews",
            error instanceof Error ? error.name : "UnknownError",
        );
        return [];
    }
};

export const listLatestFeedbackSummaries = async (
    userId: string,
    interviewIds: string[],
): Promise<Record<string, InterviewFeedbackSummary>> => {
    if (interviewIds.length === 0) return {};
    try {
        const sessions = await db.collection("interviewSessions")
            .where("userId", "==", userId).where("interviewId", "in", interviewIds.slice(0, 30)).get();
        const latest = new Map<string, FirebaseFirestore.DocumentSnapshot>();
        for (const session of sessions.docs) {
            const current = latest.get(session.get("interviewId"));
            if (!current || String(session.get("createdAt")) > String(current.get("createdAt"))) latest.set(session.get("interviewId"), session);
        }
        const feedbacks = await Promise.all([...latest.values()].map((session) => db.collection("feedbacks").doc(session.id).get()));
        return Object.fromEntries([...latest.entries()].map(([interviewId, session], index) => {
            const feedback = feedbacks[index].exists ? feedbacks[index].data() as FeedbackRecord : undefined;
            const status = feedback ? "ready" : session.get("feedbackStatus") === "failed" ? "failed" : "processing";
            return [interviewId, {sessionId: session.id, status, ...(feedback ? {totalScore: feedback.totalScore, finalAssessment: feedback.finalAssessment} : {}), createdAt: String(feedback?.createdAt ?? session.get("createdAt"))}];
        }));
    } catch (error) {
        console.error("[interviews] failed to list feedback summaries", error instanceof Error ? error.name : "UnknownError");
        return {};
    }
};
