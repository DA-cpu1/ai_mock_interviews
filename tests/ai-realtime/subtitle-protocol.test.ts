import assert from "node:assert/strict";
import test from "node:test";

import {
    mergeSubtitleMessage,
    parseSubtitleUpdate,
} from "../../lib/ai-realtime/subtitle-protocol.ts";

test("updates a streaming subtitle with a stable role and sentence id", () => {
    const first = parseSubtitleUpdate("assistant", {
        text: "欢迎",
        sentenceId: 7,
        end: false,
    }, 100);
    const second = parseSubtitleUpdate("assistant", {
        text: "欢迎参加面试",
        sentenceId: 7,
        end: true,
    }, 200);

    assert.ok(first.message);
    assert.ok(second.message);

    const messages = mergeSubtitleMessage(
        mergeSubtitleMessage([], first.message),
        second.message,
    );

    assert.deepEqual(messages, [{
        id: "assistant:7",
        role: "assistant",
        text: "欢迎参加面试",
        sentenceId: 7,
        end: true,
        updatedAt: 200,
    }]);
});

test("does not downgrade a stable subtitle with a late streaming fragment", () => {
    const stable = parseSubtitleUpdate("assistant", {
        text: "完整回答",
        sentenceId: 8,
        end: true,
    }, 300);
    const lateFragment = parseSubtitleUpdate("assistant", {
        text: "完整",
        sentenceId: 8,
        end: false,
    }, 400);

    assert.ok(stable.message);
    assert.ok(lateFragment.message);

    const messages = mergeSubtitleMessage(
        mergeSubtitleMessage([], stable.message),
        lateFragment.message,
    );

    assert.deepEqual(messages, [{
        id: "assistant:8",
        role: "assistant",
        text: "完整回答",
        sentenceId: 8,
        end: true,
        updatedAt: 300,
    }]);
});

test("removes every completion marker from a stable assistant subtitle", () => {
    const parsed = parseSubtitleUpdate("assistant", {
        text: "最后回答[INTERVIEW_COMPLETE][INTERVIEW_COMPLETE]",
        sentenceId: 9,
        end: true,
    }, 500);

    assert.deepEqual(parsed, {
        message: {
            id: "assistant:9",
            role: "assistant",
            text: "最后回答",
            sentenceId: 9,
            end: true,
            updatedAt: 500,
        },
        interviewComplete: true,
    });
});

test("uses a marker-only update to stabilize existing visible text", () => {
    const live = parseSubtitleUpdate("assistant", {
        text: "感谢你的回答",
        sentenceId: 10,
        end: false,
    }, 600);
    const completion = parseSubtitleUpdate("assistant", {
        text: "[INTERVIEW_COMPLETE]",
        sentenceId: 10,
        end: true,
    }, 700);

    assert.ok(live.message);
    assert.ok(completion.message);

    const messages = mergeSubtitleMessage(
        mergeSubtitleMessage([], live.message),
        completion.message,
    );

    assert.deepEqual(messages, [{
        id: "assistant:10",
        role: "assistant",
        text: "感谢你的回答",
        sentenceId: 10,
        end: true,
        updatedAt: 700,
    }]);
    assert.equal(completion.interviewComplete, true);
});

test("keeps only the latest 50 subtitles when appending", () => {
    let messages: ReturnType<typeof mergeSubtitleMessage> = [];

    for (let sentenceId = 1; sentenceId <= 51; sentenceId += 1) {
        const parsed = parseSubtitleUpdate("user", {
            text: `回答 ${sentenceId}`,
            sentenceId,
            end: true,
        }, sentenceId);

        messages = mergeSubtitleMessage(messages, parsed.message);
    }

    assert.equal(messages.length, 50);
    assert.equal(messages[0].id, "user:2");
    assert.equal(messages[49].id, "user:51");
});

test("enforces the 50 message limit when updating an existing subtitle", () => {
    const current = Array.from({length: 51}, (_, index) => ({
        id: `user:${index + 1}`,
        role: "user" as const,
        text: `回答 ${index + 1}`,
        sentenceId: index + 1,
        end: true,
        updatedAt: index + 1,
    }));
    const update = parseSubtitleUpdate("user", {
        text: "修订后的回答",
        sentenceId: 51,
        end: true,
    }, 900);

    const messages = mergeSubtitleMessage(current, update.message);

    assert.equal(messages.length, 50);
    assert.equal(messages[0].id, "user:2");
    assert.deepEqual(messages[49], {
        ...update.message,
        id: "user:51",
    });
});

test("does not accept completion markers from users or live assistant text", () => {
    const user = parseSubtitleUpdate("user", {
        text: "回答[INTERVIEW_COMPLETE]",
        sentenceId: 1,
        end: true,
    }, 1);
    const liveAssistant = parseSubtitleUpdate("assistant", {
        text: "追问[INTERVIEW_COMPLETE]",
        sentenceId: 2,
        end: false,
    }, 2);

    assert.deepEqual([
        {text: user.message.text, complete: user.interviewComplete},
        {text: liveAssistant.message.text, complete: liveAssistant.interviewComplete},
    ], [
        {text: "回答", complete: false},
        {text: "追问", complete: false},
    ]);
});

test("keeps matching numeric sentence ids separate across roles", () => {
    const user = parseSubtitleUpdate("user", {
        text: "候选人回答",
        sentenceId: 12,
        end: true,
    }, 1);
    const assistant = parseSubtitleUpdate("assistant", {
        text: "面试官追问",
        sentenceId: 12,
        end: true,
    }, 2);

    const messages = mergeSubtitleMessage(
        mergeSubtitleMessage([], user.message),
        assistant.message,
    );

    assert.deepEqual(messages.map(({id, text}) => ({id, text})), [
        {id: "user:12", text: "候选人回答"},
        {id: "assistant:12", text: "面试官追问"},
    ]);
});

test("does not add a marker-only subtitle without visible text", () => {
    const parsed = parseSubtitleUpdate("assistant", {
        text: "[INTERVIEW_COMPLETE]",
        sentenceId: 13,
        end: true,
    }, 1);

    assert.deepEqual(mergeSubtitleMessage([], parsed.message), []);
});

test("does not mutate the existing subtitle array", () => {
    const current = [{
        id: "user:14",
        role: "user" as const,
        text: "初稿",
        sentenceId: 14,
        end: false,
        updatedAt: 1,
    }];
    const snapshot = structuredClone(current);
    const update = parseSubtitleUpdate("user", {
        text: "定稿",
        sentenceId: 14,
        end: true,
    }, 2);

    mergeSubtitleMessage(current, update.message);

    assert.deepEqual(current, snapshot);
});
