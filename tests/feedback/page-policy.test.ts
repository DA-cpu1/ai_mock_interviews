import test from "node:test";
import assert from "node:assert/strict";
import {getFeedbackPageState, isFeedbackId, ownsFeedbackSession} from "../../lib/feedback/page-policy.ts";
import {nextPollDelay, pollFeedback} from "../../lib/feedback/poll-feedback.ts";

test("rejects malformed and repeated URL identifiers", () => {
    for (const id of [undefined, ["session"], "", "a/b", " a", "x".repeat(129)]) assert.equal(isFeedbackId(id), false);
    assert.equal(isFeedbackId("session-1_2"), true);
});

test("requires both owner and interview to match", () => {
    const session = {userId: "owner", interviewId: "interview"};
    assert.equal(ownsFeedbackSession(session, "other", "interview"), false);
    assert.equal(ownsFeedbackSession(session, "owner", "other"), false);
    assert.equal(ownsFeedbackSession(session, "owner", "interview"), true);
});

test("restores failures without automatic generation", () => {
    const session = {status: "completed", feedbackStatus: "not_started", transcriptStatus: "pending"} as const;
    assert.equal(getFeedbackPageState(session), "transcript_pending");
    assert.equal(getFeedbackPageState({...session, endOutcome: "failed"}), "call_failed");
    assert.equal(getFeedbackPageState({...session, feedbackStatus: "failed"}), "provider_failed");
    assert.equal(getFeedbackPageState({...session, transcriptStatus: "insufficient"}), "insufficient_transcript");
    assert.equal(getFeedbackPageState({...session, feedbackStatus: "generating"}), "generating");
});

test("backoff respects server delay and rejects nonfinite delay", () => {
    assert.equal(nextPollDelay(0, 5000), 5000);
    assert.equal(nextPollDelay(1, undefined), 2000);
    assert.equal(nextPollDelay(100, Infinity), 10000);
    assert.equal(nextPollDelay(1, 15000), 15000);
});

// 使用合成响应验证取消和终态，绝不发送真实模型请求或使用真实凭证。
test("stops on ready and respects cancellation before mount", async (context) => {
    const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({status: "ready"}));
    const states: string[] = [];
    await pollFeedback("fixture", new AbortController().signal, (state) => states.push(state));
    assert.deepEqual(states, ["ready"]);
    const controller = new AbortController(); controller.abort();
    await pollFeedback("fixture", controller.signal, (state) => states.push(state));
    assert.equal(fetchMock.mock.callCount(), 1);
});

test("stops at provider failure or server delay beyond budget", async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({status: "provider_failed"}));
    const states: string[] = [];
    await pollFeedback("fixture", new AbortController().signal, (state) => states.push(state));
    assert.deepEqual(states, ["provider_failed"]);
    context.mock.restoreAll();
    context.mock.method(globalThis, "fetch", async () => Response.json({status: "transcript_pending", retryAfterMs: 999999}));
    await pollFeedback("fixture", new AbortController().signal, (state) => states.push(state));
    assert.deepEqual(states.slice(1), ["transcript_pending", "timeout"]);
});
