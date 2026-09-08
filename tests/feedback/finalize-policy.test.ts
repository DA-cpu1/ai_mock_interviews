import test from "node:test";
import assert from "node:assert/strict";
import {decideGenerationLease, mapFinalizeStatus} from "../../lib/feedback/finalize-policy.ts";

test("returns ready when deterministic feedback already exists", () => {
    assert.deepEqual(decideGenerationLease({feedbackId: "s1", feedbackStatus: "ready"}, 0, "a", 1000), {kind: "ready"});
});

test("keeps a valid generation lease owned by another request", () => {
    assert.equal(decideGenerationLease({feedbackStatus: "generating", generationAttemptId: "old", generationLeaseExpiresAt: "2026-09-08T00:01:00.000Z"}, Date.parse("2026-09-08T00:00:00.000Z"), "new", 60000).kind, "generating");
});

test("reclaims an expired lease", () => {
    const result = decideGenerationLease({feedbackStatus: "generating", generationAttemptId: "old", generationLeaseExpiresAt: "2026-09-07T00:00:00.000Z"}, Date.parse("2026-09-08T00:00:00.000Z"), "new", 60000);
    assert.equal(result.kind, "claim");
    assert.equal(result.attemptId, "new");
});

test("maps transcript and feedback states to API states", () => {
    assert.equal(mapFinalizeStatus("pending", "not_started"), "transcript_pending");
    assert.equal(mapFinalizeStatus("ready", "generating"), "generating");
    assert.equal(mapFinalizeStatus("ready", "ready"), "ready");
});
