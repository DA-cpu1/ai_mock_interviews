import assert from "node:assert/strict";
import test from "node:test";

import {
    getTranscriptReadiness,
    MAX_TRANSCRIPT_MESSAGE_CHARACTERS,
    MAX_TRANSCRIPT_MESSAGES,
    MAX_TRANSCRIPT_TOTAL_CHARACTERS,
} from "../../lib/ai-realtime/transcript-readiness.ts";
import type {TranscriptMessage} from "../../types/ai-realtime.ts";

// 所有测试都使用固定的“当前时间”，这样 5 秒静默窗口不会随测试运行时间漂移。
const NOW = Date.parse("2026-09-06T10:00:00.000Z");
const STOPPED_AT = "2026-09-06T09:59:00.000Z";

// fixture 模拟 M3 写入的最终回调消息，不包含浏览器临时字幕。
const message = (
    role: TranscriptMessage["role"],
    text: string,
    occurredAt = "2026-09-06T09:58:00.000Z",
    eventKey = `${role}-${occurredAt}-${text.slice(0, 8)}`,
): TranscriptMessage => ({
    eventKey,
    role,
    text,
    source: "aliyun_callback",
    occurredAt,
    receivedAt: "2026-09-06T09:59:01.000Z",
});

// 故意把回答放在问题前面，验证读取层不会依赖回调到达顺序。
const readyMessages = (): TranscriptMessage[] => [
    message("user", "我负责过缓存架构改造，并通过监控验证了效果。", "2026-09-06T09:58:02.000Z", "user-2"),
    message("assistant", "请介绍一次你解决复杂技术问题的经历。", "2026-09-06T09:58:01.000Z", "assistant-1"),
];

test("waits for provider stop before evaluating the transcript", () => {
    assert.deepEqual(
        getTranscriptReadiness({messages: readyMessages(), nowMs: NOW}),
        {status: "pending", retryAfterMs: 1_000},
    );
});

test("returns ready for one complete question and answer", () => {
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        lastTranscriptAt: "2026-09-06T09:58:02.000Z",
        messages: readyMessages(),
        nowMs: NOW,
    });

    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.deepEqual(result.messages.map(({role, text}) => ({role, text})), [
        {role: "assistant", text: "请介绍一次你解决复杂技术问题的经历。"},
        {role: "user", text: "我负责过缓存架构改造，并通过监控验证了效果。"},
    ]);
    assert.equal(result.userCharacters, 22);
    assert.match(result.transcriptHash, /^[a-f0-9]{64}$/);
});

test("waits five seconds after the latest late message", () => {
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        lastTranscriptAt: "2026-09-06T09:59:58.000Z",
        messages: readyMessages(),
        nowMs: NOW,
    });

    assert.deepEqual(result, {status: "pending", retryAfterMs: 3_000});
});

test("uses the latest stored message when session metadata is stale", () => {
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        lastTranscriptAt: STOPPED_AT,
        messages: [message("user", "这条迟到消息应该延长静默等待。", "2026-09-06T09:59:58.000Z")],
        nowMs: NOW,
    });

    assert.deepEqual(result, {status: "pending", retryAfterMs: 3_000});
});

test("marks an empty call insufficient after the quiet window", () => {
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages: [],
        nowMs: NOW,
    });

    assert.equal(result.status, "insufficient");
    if (result.status === "insufficient") assert.equal(result.transcript, "");
});

test("does not treat a welcome message as a completed answer", () => {
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages: [message("assistant", "你好，欢迎参加今天的面试。")],
        nowMs: NOW,
    });

    assert.equal(result.status, "insufficient");
});

test("sorts messages with the event key when timestamps match", () => {
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages: [
            message("user", "这是一个超过二十个字符的有效回答内容示例。", "2026-09-06T09:58:00.000Z", "b"),
            message("assistant", "请说明你的处理思路。", "2026-09-06T09:58:00.000Z", "a"),
        ],
        nowMs: NOW,
    });

    assert.equal(result.status, "ready");
    if (result.status === "ready") {
        assert.deepEqual(result.messages.map((item) => item.eventKey), ["a", "b"]);
        assert.equal(result.transcript.startsWith("assistant: "), true);
    }
});

test("normalizes text before building the transcript hash", () => {
    const first = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages: [
            message("assistant", "  请介绍一次你解决复杂技术问题的经历。\n"),
            message("user", " 我负责过缓存架构改造，并通过监控验证了效果。 "),
        ],
        nowMs: NOW,
    });
    const second = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages: [
            message("assistant", "请介绍一次你解决复杂技术问题的经历。"),
            message("user", "我负责过缓存架构改造，并通过监控验证了效果。"),
        ],
        nowMs: NOW,
    });

    assert.equal(first.status, "ready");
    assert.equal(second.status, "ready");
    if (first.status === "ready" && second.status === "ready") {
        assert.equal(first.transcript, "assistant: 请介绍一次你解决复杂技术问题的经历。\nuser: 我负责过缓存架构改造，并通过监控验证了效果。");
        assert.equal(first.transcriptHash, second.transcriptHash);
    }
});

test("fails when a single message exceeds the bound", () => {
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages: [message("user", "x".repeat(MAX_TRANSCRIPT_MESSAGE_CHARACTERS + 1))],
        nowMs: NOW,
    });

    assert.deepEqual(result, {status: "failed", code: "MESSAGE_TOO_LONG"});
});

test("fails when the message count exceeds the bound", () => {
    const messages = Array.from({length: MAX_TRANSCRIPT_MESSAGES + 1}, (_, index) =>
        message("assistant", "问题", "2026-09-06T09:58:00.000Z", `event-${index}`));
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages,
        nowMs: NOW,
    });

    assert.deepEqual(result, {status: "failed", code: "MESSAGE_LIMIT_EXCEEDED"});
});

test("fails when total transcript characters exceed the bound", () => {
    const messages = Array.from({length: 16}, (_, index) =>
        message(
            index % 2 === 0 ? "assistant" : "user",
            "x".repeat(MAX_TRANSCRIPT_MESSAGE_CHARACTERS),
            "2026-09-06T09:58:00.000Z",
            `event-${index}`,
        ));
    const result = getTranscriptReadiness({
        providerStoppedAt: STOPPED_AT,
        messages,
        nowMs: NOW,
    });

    assert.equal(MAX_TRANSCRIPT_MESSAGE_CHARACTERS * messages.length > MAX_TRANSCRIPT_TOTAL_CHARACTERS, true);
    assert.deepEqual(result, {status: "failed", code: "TRANSCRIPT_TOO_LONG"});
});
