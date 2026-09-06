import assert from "node:assert/strict";
import test from "node:test";

import {
    createTranscriptEventKey,
    normalizeTranscriptText,
} from "../../lib/ai-realtime/transcript-event-key.ts";
import type {TranscriptEventKeyInput} from "../../lib/ai-realtime/transcript-event-key.ts";

const base: TranscriptEventKeyInput = {
    sessionId: "session-1",
    instanceId: "instance-1",
    role: "user",
    text: "我负责了缓存改造。",
    occurredAt: "2026-09-04T10:00:00.000Z",
    sentenceId: 7,
};

test("normalizes whitespace, control characters, and the completion marker", () => {
    assert.equal(
        normalizeTranscriptText("  我负责了\n缓存改造。 [INTERVIEW_COMPLETE] \u0000"),
        "我负责了 缓存改造。",
    );
    assert.equal(normalizeTranscriptText(" [INTERVIEW_COMPLETE] "), null);
});

test("replays with equivalent text to the same event key", () => {
    assert.equal(
        createTranscriptEventKey(base),
        createTranscriptEventKey({...base, text: "  我负责了  缓存改造。 "}),
    );
});

test("uses a stable dialogue id for updates even when text and time change", () => {
    const first = {...base, dialogueId: "dialogue-1", roundId: "round-1"};
    const update = {
        ...first,
        text: "我负责了缓存改造，并补充了监控。",
        occurredAt: "2026-09-04T10:00:01.000Z",
        roundId: undefined,
    };

    assert.equal(createTranscriptEventKey(first), createTranscriptEventKey(update));
});

test("separates user and assistant messages with the same sentence id", () => {
    assert.notEqual(
        createTranscriptEventKey(base),
        createTranscriptEventKey({...base, role: "assistant"}),
    );
});

test("content fallback changes when its time or text changes", () => {
    const withoutSentence = {...base, sentenceId: undefined};

    assert.notEqual(
        createTranscriptEventKey(withoutSentence),
        createTranscriptEventKey({
            ...withoutSentence,
            occurredAt: "2026-09-04T10:00:01.000Z",
        }),
    );
    assert.notEqual(
        createTranscriptEventKey(withoutSentence),
        createTranscriptEventKey({...withoutSentence, text: "另一句话。"}),
    );
});

test("returns a Firestore-safe fixed-length key", () => {
    const eventKey = createTranscriptEventKey(base);

    assert.match(eventKey, /^[a-f0-9]{64}$/);
    assert.equal(eventKey.includes("/"), false);
});
