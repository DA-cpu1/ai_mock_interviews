import test from "node:test";
import assert from "node:assert/strict";
import {createBrowserTranscriptHarness} from "./browser-transcript-harness.ts";

const session = {userId: "owner", status: "completed", endOutcome: "user_cancelled", transcriptStatus: "insufficient"};
const snapshot = {truncated: false, messages: [{role: "user", sentenceId: 1, text: "会", updatedAt: 1}]};
const path = "interviewSessions/session-1/browserTranscript/final";

test("saves a short answer separately and restores an insufficient session for feedback", async () => {
    const harness = createBrowserTranscriptHarness(session);
    const response = await harness.post(snapshot);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(harness.records.get(path)?.source, "browser_subtitles");
    assert.equal(harness.records.get("interviewSessions/session-1")?.transcriptStatus, "pending");
    const saved = JSON.stringify(harness.records.get(path));
    assert.equal((await harness.post({...snapshot, messages: [{...snapshot.messages[0], text: "重复提交不能改掉原证据"}]})).status, 200);
    assert.equal(JSON.stringify(harness.records.get(path)), saved);
});

test("rejects unauthenticated, foreign, nonexistent and invalid sessions without writes", async () => {
    for (const [user, id, expected] of [[null, "session-1", 401], [{id: "other"}, "session-1", 404], [{id: "owner"}, "missing", 404], [{id: "owner"}, "a/b", 400]] as const) {
        const harness = createBrowserTranscriptHarness(session, user);
        assert.equal((await harness.post(snapshot, id)).status, expected);
        assert.equal(harness.records.size, 1);
    }
});

test("rejects active and technically failed calls", async () => {
    for (const invalid of [{...session, status: "active"}, {...session, status: "failed"}, {...session, endOutcome: "failed"}]) {
        const harness = createBrowserTranscriptHarness(invalid);
        assert.equal((await harness.post(snapshot)).status, 409);
        assert.equal(harness.records.size, 1);
    }
});

test("rejects empty, oversized and forged-source snapshots", async () => {
    const harness = createBrowserTranscriptHarness(session);
    assert.equal((await harness.post({...snapshot, source: "aliyun_callback"})).status, 400);
    assert.equal((await harness.post({...snapshot, messages: []})).status, 400);
    assert.equal((await harness.post({padding: "x".repeat(256 * 1024)})).status, 413);
    assert.equal(harness.records.size, 1);
});

test("does not replace evidence while feedback is generating or already saved", async () => {
    for (const locked of [{...session, feedbackStatus: "generating"}, {...session, feedbackId: "session-1"}]) {
        const harness = createBrowserTranscriptHarness(locked);
        assert.equal((await harness.post(snapshot)).status, 200);
        assert.equal(harness.records.has(path), false);
    }
});
