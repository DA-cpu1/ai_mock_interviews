import {z} from "zod";

import {FEEDBACK_DIMENSION_IDS} from "../../types/feedback.ts";
import type {
    FeedbackCategoryScore,
    FeedbackContent,
    FeedbackDimensionId,
} from "@/types/feedback";

export const FEEDBACK_DIMENSION_LABELS: Record<FeedbackDimensionId, string> = {
    communication: "沟通表达",
    technical: "技术能力",
    problemSolving: "问题解决",
    relevance: "岗位相关性",
    clarity: "清晰度",
};

export const FEEDBACK_TEXT_LIMITS = {
    comment: 1000,
    listItem: 500,
    finalAssessment: 2000,
} as const;

export const feedbackDimensionIdSchema = z.enum(FEEDBACK_DIMENSION_IDS);

const boundedText = (max: number) => z.string().trim().min(1).max(max);

const feedbackCategoryScoreSchema = z.object({
    id: feedbackDimensionIdSchema,
    score: z.number().int().min(0).max(100),
    comment: boundedText(FEEDBACK_TEXT_LIMITS.comment),
}).strict();

export const feedbackContentSchema: z.ZodType<FeedbackContent> = z.object({
    categoryScores: z.array(feedbackCategoryScoreSchema).length(5).superRefine(
        (scores, context) => {
            if (new Set(scores.map(({id}) => id)).size !== scores.length) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "反馈维度不能重复。",
                });
            }
        },
    ),
    strengths: z.array(boundedText(FEEDBACK_TEXT_LIMITS.listItem)).min(1).max(5),
    areasForImprovement: z.array(boundedText(FEEDBACK_TEXT_LIMITS.listItem)).min(1).max(5),
    finalAssessment: boundedText(FEEDBACK_TEXT_LIMITS.finalAssessment),
}).strict();

/**
 * 五个维度固定等权，总分只由服务端根据维度分计算，不能采用模型自报总分。
 */
export const calculateFeedbackTotalScore = (
    categoryScores: ReadonlyArray<Pick<FeedbackCategoryScore, "score">>,
): number => Math.round(
    categoryScores.reduce((sum, category) => sum + category.score, 0)
    / 5,
);
