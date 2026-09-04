import "server-only";

import {z} from "zod";

import {INTERVIEW_TYPES} from "@/constants/interviews";
import {db} from "@/firebase/admin";
import type {InterviewPromptContext} from "@/lib/ai-realtime/interview-prompt";

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
