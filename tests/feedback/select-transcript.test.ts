import test from "node:test";
import assert from "node:assert/strict";
import {selectFeedbackTranscript} from "../../lib/feedback/select-transcript.ts";
import {getTranscriptReadiness} from "../../lib/ai-realtime/transcript-readiness.ts";

const snapshot = {truncated: false, messages: [{role: "user", sentenceId: 1, text: "我使用过 React。", updatedAt: 1}]};
const waiting = {status: "pending", retryAfterMs: 1000} as const;
const input = {callback: waiting, callbackHasAnswer: false, completed: true, browserSnapshot: snapshot};

test("generates from browser subtitles without waiting for any callback after completion", () => {
    const result = selectFeedbackTranscript(input);
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.source, "browser_subtitles");
    assert.equal(result.transcript, "user: 我使用过 React。");
    assert.match(result.transcriptHash, /^[a-f0-9]{64}$/);
});

test("keeps waiting during calls and when a callback answer is still settling", () => {
    assert.deepEqual(selectFeedbackTranscript({...input, completed: false}), waiting);
    assert.deepEqual(selectFeedbackTranscript({...input, callbackHasAnswer: true}), waiting);
});

test("prefers a ready callback transcript over a different browser snapshot", () => {
    const callback = getTranscriptReadiness({providerStoppedAt: "2026-09-10T00:00:00Z", nowMs: Date.parse("2026-09-10T00:01:00Z"), messages: [{
        eventKey: "user-1", source: "aliyun_callback", role: "user", text: "服务端收到的回答", occurredAt: "2026-09-10T00:00:00Z", receivedAt: "2026-09-10T00:00:00Z",
    }]});
    const result = selectFeedbackTranscript({...input, callback, callbackHasAnswer: true});
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.source, "aliyun_callback");
    assert.equal(result.transcript, "user: 服务端收到的回答");
});

test("does not invent feedback from missing, empty, or invalid browser data", () => {
    assert.deepEqual(selectFeedbackTranscript({...input, browserSnapshot: undefined}), waiting);
    assert.deepEqual(selectFeedbackTranscript({...input, browserSnapshot: {...snapshot, messages: []}}), waiting);
    assert.equal(selectFeedbackTranscript({...input, browserSnapshot: {...snapshot, source: "aliyun_callback"}}).status, "failed");
    assert.deepEqual(selectFeedbackTranscript({...input, callback: {status: "failed", code: "INVALID_MESSAGE"}}), {status: "failed", code: "INVALID_MESSAGE"});
});
