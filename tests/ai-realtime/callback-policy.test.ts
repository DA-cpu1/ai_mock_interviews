import assert from "node:assert/strict";
import test from "node:test";

import {
    getCallbackSessionPlan,
} from "../../lib/ai-realtime/callback-policy.ts";
import type {
    NormalizedAliyunChatCallback,
    NormalizedAliyunStatusCallback,
} from "../../lib/aliyun/callback-protocol.ts";
import type {
    AiRealtimeSessionRecord,
    AiRealtimeSessionStatus,
} from "../../types/ai-realtime.ts";

const session = (
    status: AiRealtimeSessionStatus,
    extra: Partial<AiRealtimeSessionRecord> = {},
): AiRealtimeSessionRecord => ({
    id: "session-1",
    interviewId: "interview-1",
    userId: "user-1",
    rtcUserId: "rtc-user-1",
    channelId: "channel-1",
    agentId: "agent-1",
    region: "cn-shanghai",
    status,
    transcriptStatus: "pending",
    feedbackStatus: "not_started",
    conversationMode: "semantic",
    modelConfigVersion: "voice-v1",
    tokenExpiresAt: "2026-09-04T10:10:00.000Z",
    leaseExpiresAt: "2026-09-04T10:10:00.000Z",
    createdAt: "2026-09-04T10:00:00.000Z",
    ...extra,
});

const statusCallback = (
    event: NormalizedAliyunStatusCallback["event"],
    instanceId = "instance-1",
): NormalizedAliyunStatusCallback => ({
    event,
    aiAgentId: "agent-1",
    instanceId,
    sessionId: "session-1",
    occurredAt: "2026-09-04T10:01:00.000Z",
});

const chatCallback: NormalizedAliyunChatCallback = {
    event: "chat_record",
    aiAgentId: "agent-1",
    instanceId: "instance-1",
    sessionId: "session-1",
    occurredAt: "2026-09-04T10:01:00.000Z",
    messages: [],
};

test("binds the instance and starts a created session", () => {
    assert.deepEqual(getCallbackSessionPlan(session("created"), statusCallback("agent_start")), {
        kind: "update",
        updates: {
            agentInstanceId: "instance-1",
            status: "active",
            startedAt: "2026-09-04T10:01:00.000Z",
        },
    });
});

test("binds a chat-first callback without changing session status", () => {
    assert.deepEqual(getCallbackSessionPlan(session("created"), chatCallback), {
        kind: "update",
        updates: {agentInstanceId: "instance-1"},
    });
});

test("rejects a callback from a different provider instance", () => {
    assert.deepEqual(
        getCallbackSessionPlan(session("active", {agentInstanceId: "instance-1"}), statusCallback("agent_stop", "other")),
        {kind: "reject", code: "SESSION_INSTANCE_MISMATCH"},
    );
});

test("completes an active session on agent_stop", () => {
    assert.deepEqual(getCallbackSessionPlan(session("active"), statusCallback("agent_stop")), {
        kind: "update",
        updates: {
            agentInstanceId: "instance-1",
            status: "completed",
            providerStoppedAt: "2026-09-04T10:01:00.000Z",
        },
    });
});

test("does not move a completed session back to active", () => {
    assert.deepEqual(
        getCallbackSessionPlan(
            session("completed", {agentInstanceId: "instance-1", providerStoppedAt: "2026-09-04T10:00:30.000Z"}),
            statusCallback("agent_start"),
        ),
        {kind: "update", updates: {}},
    );
});

test("keeps completed state when a late chat record arrives", () => {
    assert.deepEqual(
        getCallbackSessionPlan(session("completed", {agentInstanceId: "instance-1"}), chatCallback),
        {kind: "update", updates: {}},
    );
});
