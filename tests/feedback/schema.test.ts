import assert from "node:assert/strict";
import test from "node:test";

import {
    calculateFeedbackTotalScore,
    FEEDBACK_DIMENSION_LABELS,
    feedbackContentSchema,
} from "../../lib/feedback/schema.ts";

const validFeedbackContent = {
    categoryScores: [
        {id: "communication", score: 91, comment: "表达有清晰的结构。"},
        {id: "technical", score: 82, comment: "技术基础比较扎实。"},
        {id: "problemSolving", score: 77, comment: "能说明主要分析过程。"},
        {id: "relevance", score: 86, comment: "回答紧扣岗位要求。"},
        {id: "clarity", score: 79, comment: "结论明确但可以更精炼。"},
    ],
    strengths: ["能够用具体经历支持结论。"],
    areasForImprovement: ["进一步量化项目最终结果。"],
    finalAssessment: "整体表现稳定，建议继续加强复杂问题的拆解深度。",
};

test("calculates the total score as the rounded equal-weight average", () => {
    const categoryScores = [
        {id: "communication" as const, score: 91},
        {id: "technical" as const, score: 82},
        {id: "problemSolving" as const, score: 77},
        {id: "relevance" as const, score: 86},
        {id: "clarity" as const, score: 79},
    ];

    assert.equal(calculateFeedbackTotalScore(categoryScores), 83);
});

test("accepts feedback content with all five stable dimensions", () => {
    const result = feedbackContentSchema.parse(validFeedbackContent);

    assert.deepEqual(result, validFeedbackContent);
    assert.equal("totalScore" in result, false);
});

test("rejects duplicate dimensions even when five scores are present", () => {
    const duplicateDimensions = {
        ...validFeedbackContent,
        categoryScores: validFeedbackContent.categoryScores.map((category, index) => (
            index === 4 ? {...category, id: "communication"} : category
        )),
    };

    assert.equal(feedbackContentSchema.safeParse(duplicateDimensions).success, false);
});

test("maps stable dimension ids to their Chinese display labels", () => {
    assert.deepEqual(FEEDBACK_DIMENSION_LABELS, {
        communication: "沟通表达",
        technical: "技术能力",
        problemSolving: "问题解决",
        relevance: "岗位相关性",
        clarity: "清晰度",
    });
});

test("rejects scores outside the integer range from zero to one hundred", () => {
    for (const score of [-1, 50.5, 101]) {
        const invalidScore = {
            ...validFeedbackContent,
            categoryScores: validFeedbackContent.categoryScores.map((category, index) => (
                index === 0 ? {...category, score} : category
            )),
        };
        assert.equal(feedbackContentSchema.safeParse(invalidScore).success, false);
    }
});

test("rejects feedback with a missing dimension", () => {
    assert.equal(feedbackContentSchema.safeParse({
        ...validFeedbackContent,
        categoryScores: validFeedbackContent.categoryScores.slice(0, 4),
    }).success, false);
});

test("rejects text beyond each documented limit", () => {
    const invalidContents = [
        {
            ...validFeedbackContent,
            categoryScores: validFeedbackContent.categoryScores.map((category, index) => (
                index === 0 ? {...category, comment: "评".repeat(1001)} : category
            )),
        },
        {...validFeedbackContent, strengths: ["优".repeat(501)]},
        {...validFeedbackContent, finalAssessment: "总".repeat(2001)},
    ];

    for (const content of invalidContents) {
        assert.equal(feedbackContentSchema.safeParse(content).success, false);
    }
});

test("requires between one and five strengths and improvements", () => {
    const invalidContents = [
        {...validFeedbackContent, strengths: []},
        {...validFeedbackContent, strengths: Array(6).fill("优点")},
        {...validFeedbackContent, areasForImprovement: []},
        {...validFeedbackContent, areasForImprovement: Array(6).fill("改进项")},
    ];

    for (const content of invalidContents) {
        assert.equal(feedbackContentSchema.safeParse(content).success, false);
    }
});

test("rejects unknown fields at the top level and inside scores", () => {
    const topLevelExtra = {...validFeedbackContent, unexpected: true};
    const nestedExtra = {
        ...validFeedbackContent,
        categoryScores: validFeedbackContent.categoryScores.map((category, index) => (
            index === 0 ? {...category, name: "Communication Skills"} : category
        )),
    };

    assert.equal(feedbackContentSchema.safeParse(topLevelExtra).success, false);
    assert.equal(feedbackContentSchema.safeParse(nestedExtra).success, false);
});

test("rejects a model-supplied total score", () => {
    assert.equal(feedbackContentSchema.safeParse({
        ...validFeedbackContent,
        totalScore: 100,
    }).success, false);
});
