import "server-only";

import {getFeedbackConfig, type FeedbackServerConfig} from "./config.server.ts";
import {FEEDBACK_DIMENSION_IDS} from "../../types/feedback.ts";

export interface FeedbackChatMessage {
    role: "system" | "user";
    content: string;
}

export type FeedbackProviderErrorCode =
    | "FEEDBACK_DISABLED"
    | "FEEDBACK_TIMEOUT"
    | "FEEDBACK_NETWORK_ERROR"
    | "FEEDBACK_HTTP_ERROR"
    | "FEEDBACK_RESPONSE_INVALID"
    | "FEEDBACK_EMPTY_RESPONSE";

export class FeedbackProviderError extends Error {
    readonly code: FeedbackProviderErrorCode;

    constructor(code: FeedbackProviderErrorCode) {
        super(code);
        this.name = "FeedbackProviderError";
        this.code = code;
    }
}

export interface FeedbackProviderOptions {
    config?: FeedbackServerConfig;
    fetchImpl?: typeof fetch;
}

const feedbackScoreSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        id: {type: "string", enum: [...FEEDBACK_DIMENSION_IDS]},
        score: {type: "integer", minimum: 0, maximum: 100},
        comment: {type: "string", minLength: 1, maxLength: 1000},
    },
    required: ["id", "score", "comment"],
} as const;

/** 发给百炼的 schema 不包含 totalScore，避免模型绕过服务端评分规则。 */
export const FEEDBACK_RESPONSE_JSON_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        categoryScores: {
            type: "array",
            minItems: 5,
            maxItems: 5,
            items: feedbackScoreSchema,
        },
        strengths: {type: "array", minItems: 1, maxItems: 5, items: {type: "string", minLength: 1, maxLength: 500}},
        areasForImprovement: {type: "array", minItems: 1, maxItems: 5, items: {type: "string", minLength: 1, maxLength: 500}},
        finalAssessment: {type: "string", minLength: 1, maxLength: 2000},
    },
    required: ["categoryScores", "strengths", "areasForImprovement", "finalAssessment"],
} as const;

export const buildFeedbackRequestBody = (
    config: FeedbackServerConfig,
    messages: readonly FeedbackChatMessage[],
) => ({
    model: config.model,
    messages,
    temperature: 0,
    response_format: {
        type: "json_schema",
        json_schema: {
            name: "interview_feedback",
            strict: true,
            schema: FEEDBACK_RESPONSE_JSON_SCHEMA,
        },
    },
});

const MAX_MODEL_RESPONSE_CHARACTERS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const readModelContent = (payload: unknown): string | null => {
    if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) return null;
    const firstChoice = payload.choices[0];
    if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;
    return typeof firstChoice.message.content === "string" ? firstChoice.message.content : null;
};

/** 调用兼容 OpenAI 协议的百炼端点；错误只返回稳定分类，不携带响应正文或密钥。 */
export const requestFeedbackModel = async (
    messages: readonly FeedbackChatMessage[],
    options: FeedbackProviderOptions = {},
): Promise<string> => {
    const config = options.config ?? getFeedbackConfig();
    if (!config.enabled) throw new FeedbackProviderError("FEEDBACK_DISABLED");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const endpoint = `${config.baseUrl}/chat/completions`;
    let response: Response;

    try {
        response = await (options.fetchImpl ?? fetch)(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(buildFeedbackRequestBody(config, messages)),
            signal: controller.signal,
        });
    } catch {
        if (controller.signal.aborted) throw new FeedbackProviderError("FEEDBACK_TIMEOUT");
        throw new FeedbackProviderError("FEEDBACK_NETWORK_ERROR");
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) throw new FeedbackProviderError("FEEDBACK_HTTP_ERROR");

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new FeedbackProviderError("FEEDBACK_RESPONSE_INVALID");
    }

    const content = readModelContent(payload);
    if (content === null) throw new FeedbackProviderError("FEEDBACK_RESPONSE_INVALID");
    if (!content.trim()) throw new FeedbackProviderError("FEEDBACK_EMPTY_RESPONSE");
    if (Array.from(content).length > MAX_MODEL_RESPONSE_CHARACTERS) {
        throw new FeedbackProviderError("FEEDBACK_RESPONSE_INVALID");
    }
    return content;
};
