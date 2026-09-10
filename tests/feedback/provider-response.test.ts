import assert from "node:assert/strict";
import test from "node:test";

import {
    generateFeedback,
    type GenerateFeedbackInput,
} from "../../lib/feedback/generate.server.ts";
import {getFeedbackConfig} from "../../lib/feedback/config.server.ts";
import {requestFeedbackModel} from "../../lib/feedback/provider.server.ts";
import type {FeedbackServerConfig} from "../../lib/feedback/config.server.ts";

const config: FeedbackServerConfig = {
    enabled: true,
    apiKey: "test-key-that-is-never-logged",
    baseUrl: "https://example.test/v1",
    model: "qwen-test",
    timeoutMs: 1_000,
};

const input: GenerateFeedbackInput = {
    interview: {
        role: "前端工程师",
        level: "中级",
        type: "Technical",
        techstack: ["React", "TypeScript"],
    },
    transcript: "assistant: 请说明一次性能优化。\nuser: 我通过缓存降低了接口延迟。",
};

const validContent = {
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

const responseWithContent = (content: string): Response => new Response(
    JSON.stringify({choices: [{message: {content}}]}),
    {status: 200, headers: {"Content-Type": "application/json"}},
);

const createFetchMock = (contents: string[], requests: unknown[] = []) => {
    let callCount = 0;
    const fetchImpl = async (inputValue: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void inputValue;
        callCount += 1;
        requests.push(JSON.parse(String(init?.body)));
        return responseWithContent(contents[Math.min(callCount - 1, contents.length - 1)] ?? "");
    };
    return {fetchImpl, getCallCount: () => callCount};
};

test("keeps feedback safely disabled without server credentials", () => {
    const names = [
        "AI_FEEDBACK_ENABLED",
        "ALIYUN_BAILIAN_API_KEY",
        "ALIYUN_BAILIAN_BASE_URL",
        "ALIYUN_BAILIAN_MODEL",
        "AI_FEEDBACK_TIMEOUT_MS",
    ] as const;
    const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

    try {
        for (const name of names) delete process.env[name];
        assert.deepEqual(getFeedbackConfig(), {
            enabled: false,
            apiKey: "",
            baseUrl: "",
            model: "",
            timeoutMs: 15_000,
        });
    } finally {
        for (const name of names) {
            if (original[name] === undefined) delete process.env[name];
            else process.env[name] = original[name];
        }
    }
});

test("accepts fixed JSON fixture and sends strict schema request", async () => {
    const requests: unknown[] = [];
    const mock = createFetchMock([JSON.stringify(validContent)], requests);
    const result = await generateFeedback(input, {config, fetchImpl: mock.fetchImpl});

    assert.deepEqual(result.content, validContent);
    assert.equal(result.model, config.model);
    assert.equal(result.promptVersion, "feedback-v3");
    const request = requests[0] as Record<string, unknown>;
    assert.equal(request.model, config.model);
    assert.equal(request.temperature, 0);
    assert.equal("max_tokens" in request, false);
    assert.deepEqual((request.response_format as Record<string, unknown>).type, "json_schema");
});

test("does not call the provider when feedback is disabled", async () => {
    const mock = createFetchMock([JSON.stringify(validContent)]);

    await assert.rejects(
        generateFeedback(input, {config: {...config, enabled: false}, fetchImpl: mock.fetchImpl}),
        {name: "FeedbackGenerationError", code: "FEEDBACK_DISABLED"},
    );
    assert.equal(mock.getCallCount(), 0);
});

const assertGenerationError = async (
    content: string,
    code: "FEEDBACK_INVALID_JSON" | "FEEDBACK_SCHEMA_INVALID",
) => {
    const mock = createFetchMock([content, content]);
    await assert.rejects(
        generateFeedback(input, {config, fetchImpl: mock.fetchImpl}),
        (error: unknown) => error instanceof Error
            && "code" in error
            && error.code === code,
    );
    assert.equal(mock.getCallCount(), 2);
};

test("repairs one code-block response and never retries it more than once", async () => {
    const codeBlock = `\`\`\`json\n${JSON.stringify(validContent)}\n\`\`\``;
    const mock = createFetchMock([codeBlock, JSON.stringify(validContent)]);
    const result = await generateFeedback(input, {config, fetchImpl: mock.fetchImpl});

    assert.deepEqual(result.content, validContent);
    assert.equal(mock.getCallCount(), 2);
});

test("returns a stable JSON error when the repair response is still a code block", async () => {
    await assertGenerationError(
        `\`\`\`json\n${JSON.stringify(validContent)}\n\`\`\``,
        "FEEDBACK_INVALID_JSON",
    );
});

test("returns a stable schema error for missing fields and out-of-range scores", async () => {
    await assertGenerationError(
        JSON.stringify({...validContent, strengths: []}),
        "FEEDBACK_SCHEMA_INVALID",
    );
    await assertGenerationError(
        JSON.stringify({
            ...validContent,
            categoryScores: validContent.categoryScores.map((score, index) => (
                index === 0 ? {...score, score: 101} : score
            )),
        }),
        "FEEDBACK_SCHEMA_INVALID",
    );
});

test("maps an empty model message to a stable error without retrying", async () => {
    const mock = createFetchMock([""]);
    await assert.rejects(
        generateFeedback(input, {config, fetchImpl: mock.fetchImpl}),
        {name: "FeedbackProviderError", code: "FEEDBACK_EMPTY_RESPONSE"},
    );
    assert.equal(mock.getCallCount(), 1);
});

test("maps an aborted request to a stable timeout error", async () => {
    const hangingFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            {once: true},
        );
    });

    await assert.rejects(
        requestFeedbackModel([], {config: {...config, timeoutMs: 5}, fetchImpl: hangingFetch}),
        {name: "FeedbackProviderError", code: "FEEDBACK_TIMEOUT"},
    );
});
