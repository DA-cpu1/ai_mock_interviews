import assert from "node:assert/strict";
import test from "node:test";

import {getAliyunCallbackConfig} from "../../lib/aliyun/callback-config.server.ts";
import {
    isValidCallbackAuthorization,
    parseAliyunCallbackPayload,
    readAliyunCallbackBody,
} from "../../lib/aliyun/callback-protocol.ts";

test("accepts only the exact configured callback authorization value", () => {
    const configuredToken = "test-callback-token-with-at-least-32-characters";

    assert.equal(isValidCallbackAuthorization(configuredToken, configuredToken), true);
    assert.equal(isValidCallbackAuthorization(undefined, configuredToken), false);
    assert.equal(isValidCallbackAuthorization("forged-token", configuredToken), false);
    assert.equal(isValidCallbackAuthorization(`${configuredToken}-extra`, configuredToken), false);
});

test("keeps the callback safely disabled when no token is configured", () => {
    const originalToken = process.env.ALIYUN_AI_CALLBACK_TOKEN;
    delete process.env.ALIYUN_AI_CALLBACK_TOKEN;

    try {
        assert.deepEqual(getAliyunCallbackConfig(), {enabled: false, token: ""});
    } finally {
        if (originalToken === undefined) delete process.env.ALIYUN_AI_CALLBACK_TOKEN;
        else process.env.ALIYUN_AI_CALLBACK_TOKEN = originalToken;
    }
});

test("rejects a configured callback token that is too short", () => {
    const originalToken = process.env.ALIYUN_AI_CALLBACK_TOKEN;
    process.env.ALIYUN_AI_CALLBACK_TOKEN = "short-token";

    try {
        assert.throws(() => getAliyunCallbackConfig(), {
            name: "AliyunCallbackConfigError",
        });
    } finally {
        if (originalToken === undefined) delete process.env.ALIYUN_AI_CALLBACK_TOKEN;
        else process.env.ALIYUN_AI_CALLBACK_TOKEN = originalToken;
    }
});

test("normalizes a direct user chat record without retaining reasoning text", () => {
    const result = parseAliyunCallbackPayload({
        aiAgentId: "agent-1",
        instanceId: "instance-1",
        event: "chat_record",
        code: "Success",
        message: "Success",
        timestamp: "2026-09-04T10:00:00.000Z",
        userData: JSON.stringify({sessionId: "session_1", source: "interview"}),
        data: {
            role: "user",
            type: "normal",
            text: "  我负责了服务端缓存改造。  ",
            sentence_id: 7,
            reasoningText: "不应进入规范化结果",
            vendorExtension: true,
        },
        extendData: {unused: true},
    });

    assert.deepEqual(result, {
        kind: "accepted",
        callback: {
            event: "chat_record",
            aiAgentId: "agent-1",
            instanceId: "instance-1",
            sessionId: "session_1",
            occurredAt: "2026-09-04T10:00:00.000Z",
            messages: [{
                role: "user",
                text: "我负责了服务端缓存改造。",
                sentenceId: 7,
                occurredAt: "2026-09-04T10:00:00.000Z",
            }],
        },
    });
});

test("normalizes an official dialogues batch and maps agent to assistant", () => {
    const result = parseAliyunCallbackPayload({
        aiAgentId: "agent-1",
        instanceId: "instance-1",
        event: "chat_record",
        code: "Success",
        message: "Success",
        timestamp: "2026-09-04T10:00:03.000Z",
        userData: JSON.stringify({sessionId: "session_1"}),
        data: {
            requestId: "request-1",
            dialogues: [{
                roundId: "round-1",
                producer: "agent",
                text: "可以进一步说明你的具体贡献吗？",
                reasoningText: "不保存模型思考过程",
                time: 1788516002000,
                dialogueId: "dialogue-1",
                source: "chat",
                type: "normal",
            }],
        },
    });

    assert.deepEqual(result, {
        kind: "accepted",
        callback: {
            event: "chat_record",
            aiAgentId: "agent-1",
            instanceId: "instance-1",
            sessionId: "session_1",
            occurredAt: "2026-09-04T10:00:03.000Z",
            messages: [{
                role: "assistant",
                text: "可以进一步说明你的具体贡献吗？",
                dialogueId: "dialogue-1",
                roundId: "round-1",
                occurredAt: "2026-09-04T10:00:02.000Z",
            }],
        },
    });
});

test("normalizes a known status event without retaining its data", () => {
    const result = parseAliyunCallbackPayload({
        aiAgentId: "agent-1",
        instanceId: "instance-1",
        event: "agent_stop",
        code: "1003",
        message: "Agent stopped",
        timestamp: "2026-09-04T10:30:00.000Z",
        userData: JSON.stringify({sessionId: "session_1"}),
        data: {privateVendorDetail: "ignored"},
    });

    assert.deepEqual(result, {
        kind: "accepted",
        callback: {
            event: "agent_stop",
            aiAgentId: "agent-1",
            instanceId: "instance-1",
            sessionId: "session_1",
            occurredAt: "2026-09-04T10:30:00.000Z",
        },
    });
});

test("accepts the official error event without retaining its message data", () => {
    const result = parseAliyunCallbackPayload({
        aiAgentId: "agent-1",
        instanceId: "instance-1",
        event: "error",
        code: "InternalError",
        message: "private provider detail",
        timestamp: "2026-09-04T10:30:00.000Z",
        userData: JSON.stringify({sessionId: "session_1"}),
    });

    assert.equal(result.kind, "accepted");
    if (result.kind === "accepted") assert.equal(result.callback.event, "error");
    assert.equal(JSON.stringify(result).includes("private provider detail"), false);
});

test("rejects a payload missing an official required envelope field", () => {
    const result = parseAliyunCallbackPayload({
        aiAgentId: "agent-1",
        instanceId: "instance-1",
        event: "agent_start",
        message: "Agent started",
        timestamp: "2026-09-04T10:00:00.000Z",
        userData: JSON.stringify({sessionId: "session_1"}),
    });

    assert.deepEqual(result, {kind: "invalid", code: "INVALID_PAYLOAD"});
});

test("rejects an oversized declared body before parsing JSON", async () => {
    const request = new Request("https://example.com/callback", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": String(256 * 1024 + 1),
        },
        body: "{}",
    });

    assert.deepEqual(await readAliyunCallbackBody(request), {kind: "too_large"});
});

test("rejects a known event with an invalid session id", () => {
    const result = parseAliyunCallbackPayload({
        aiAgentId: "agent-1",
        instanceId: "instance-1",
        event: "agent_start",
        code: "1001",
        message: "Agent started",
        timestamp: "2026-09-04T10:00:00.000Z",
        userData: JSON.stringify({sessionId: "invalid/session"}),
    });

    assert.deepEqual(result, {kind: "invalid", code: "INVALID_USER_DATA"});
});

test("ignores an unknown event without exposing its data", () => {
    const result = parseAliyunCallbackPayload({
        aiAgentId: "agent-1",
        instanceId: "instance-1",
        event: "future_event",
        code: "Success",
        message: "Success",
        timestamp: "2026-09-04T10:00:00.000Z",
        data: {text: "must not be returned"},
    });

    assert.deepEqual(result, {kind: "ignored", event: "future_event"});
});

test("rejects malformed JSON and a non-JSON content type", async () => {
    const malformed = new Request("https://example.com/callback", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: "{not-json}",
    });
    const wrongType = new Request("https://example.com/callback", {
        method: "POST",
        headers: {"Content-Type": "text/plain"},
        body: "{}",
    });

    assert.deepEqual(await readAliyunCallbackBody(malformed), {kind: "invalid_json"});
    assert.deepEqual(await readAliyunCallbackBody(wrongType), {kind: "invalid_content_type"});
});

test("limits the actual streamed body when Content-Length is absent", async () => {
    const request = new Request("https://example.com/callback", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: `{"value":"${"x".repeat(256 * 1024)}"}`,
    });

    assert.equal(request.headers.has("content-length"), false);
    assert.deepEqual(await readAliyunCallbackBody(request), {kind: "too_large"});
});
