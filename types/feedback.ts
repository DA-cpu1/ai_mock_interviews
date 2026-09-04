export const FEEDBACK_DIMENSION_IDS = [
    "communication",
    "technical",
    "problemSolving",
    "relevance",
    "clarity",
] as const;

export type FeedbackDimensionId = typeof FEEDBACK_DIMENSION_IDS[number];

export interface FeedbackCategoryScore {
    id: FeedbackDimensionId;
    score: number;
    comment: string;
}

export interface FeedbackContent {
    categoryScores: FeedbackCategoryScore[];
    strengths: string[];
    areasForImprovement: string[];
    finalAssessment: string;
}

// Interview 是可复用配置，一个 Interview 可对应多次 Session；每次 Session
// 最多生成一份 Feedback，并用相同 sessionId 作为确定性文档 ID。
export interface FeedbackRecord extends FeedbackContent {
    id: string;
    sessionId: string;
    interviewId: string;
    userId: string;
    totalScore: number;
    model: string;
    promptVersion: string;
    transcriptHash: string;
    createdAt: string;
}
