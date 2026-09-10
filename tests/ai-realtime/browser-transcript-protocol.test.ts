import test from "node:test";
import assert from "node:assert/strict";
import {browserTranscriptSchema, collectFinalSubtitle} from "../../lib/ai-realtime/browser-transcript-protocol.ts";
import type {BrowserTranscriptSnapshot} from "../../lib/ai-realtime/browser-transcript-protocol.ts";

const subtitle = (sentenceId: number, text = "有效回答", end = true) => ({
    id: `user:${sentenceId}`, role: "user" as const, sentenceId, text, end, updatedAt: sentenceId,
});

test("collects final subtitles only and replaces repeated final results", () => {
    const empty = {messages: [], truncated: false};
    assert.deepEqual(collectFinalSubtitle(empty, subtitle(1, "流式片段", false)), empty);
    const first = collectFinalSubtitle(empty, subtitle(1));
    const second = collectFinalSubtitle(first, subtitle(1, "修正后的完整回答"));
    assert.equal(second.messages.length, 1);
    assert.equal(second.messages[0].text, "修正后的完整回答");
    assert.deepEqual(collectFinalSubtitle(second, subtitle(1, "过期片段", false)), second);
    assert.deepEqual(collectFinalSubtitle(second, subtitle(2, " [INTERVIEW_COMPLETE] ")), second);
});

test("retains more than the 50 visible lines and marks capacity truncation", () => {
    let snapshot: BrowserTranscriptSnapshot = {messages: [], truncated: false};
    for (let index = 0; index < 51; index++) snapshot = collectFinalSubtitle(snapshot, subtitle(index));
    assert.equal(snapshot.messages.length, 51);
    assert.equal(snapshot.truncated, false);
    for (let index = 51; index < 201; index++) snapshot = collectFinalSubtitle(snapshot, subtitle(index));
    assert.equal(snapshot.messages.length, 200);
    assert.equal(snapshot.messages[0].sentenceId, 1);
    assert.equal(snapshot.truncated, true);
    assert.equal(browserTranscriptSchema.safeParse(snapshot).success, true);
});

test("bounds total size and excludes malformed or oversized subtitles", () => {
    let snapshot: BrowserTranscriptSnapshot = {messages: [], truncated: false};
    for (let index = 0; index < 16; index++) snapshot = collectFinalSubtitle(snapshot, subtitle(index, "字".repeat(4000)));
    assert.equal(snapshot.messages.length, 15);
    assert.equal(snapshot.truncated, true);
    assert.equal(browserTranscriptSchema.safeParse(snapshot).success, true);
    assert.equal(collectFinalSubtitle(snapshot, subtitle(99, "字".repeat(4001))).messages.length, 15);
    const message = snapshot.messages[0];
    assert.equal(browserTranscriptSchema.safeParse({messages: [message, message], truncated: false}).success, false);
    assert.equal(browserTranscriptSchema.safeParse({...snapshot, source: "aliyun_callback"}).success, false);
    assert.equal(browserTranscriptSchema.safeParse({messages: [{...message, text: " "}], truncated: false}).success, false);
});
