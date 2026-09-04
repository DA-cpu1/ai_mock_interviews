import assert from "node:assert/strict";
import test from "node:test";

import {
    getSessionEndPlan,
    getSessionStartPlan,
} from "../../lib/ai-realtime/session-lifecycle-policy.ts";
import type {
    AiRealtimeSessionRecord,
    AiRealtimeSessionStatus,
    AiRealtimeUserSessionState,
} from "../../types/ai-realtime.ts";

const NOW = Date.parse("2026-09-02T10:00:00.000Z");

const session = (
    status: AiRealtimeSessionStatus,
    tokenExpiresAt = "2026-09-02T10:10:00.000Z",
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
    tokenExpiresAt,
    leaseExpiresAt: "2026-09-02T10:10:00.000Z",
    createdAt: "2026-09-02T09:59:00.000Z",
});

const state = (sessionId: string | null = "session-1"): AiRealtimeUserSessionState => ({
    userId: "user-1",
    activeSessionId: sessionId,
    leaseExpiresAt: sessionId ? "2026-09-02T10:10:00.000Z" : null,
    lastCreateAt: "2026-09-02T09:59:00.000Z",
});

test("starts a created session and adds the cleanup grace time", () => {
    assert.deepEqual(getSessionStartPlan(session("created"), state(), NOW, 30), {
        kind: "start",
        leaseExpiresAt: "2026-09-02T10:32:00.000Z",
    });
});

test("accepts a repeated start while the same lock is valid", () => {
    assert.deepEqual(getSessionStartPlan(session("active"), state(), NOW, 30), {
        kind: "already-active",
    });
});

test("expires a session whose token is no longer usable", () => {
    const expired = session("created", "2026-09-02T10:00:00.000Z");
    assert.deepEqual(getSessionStartPlan(expired, state(), NOW, 30), {kind: "expired"});
});

test("expires a session after its user lock was lost", () => {
    assert.deepEqual(getSessionStartPlan(session("created"), state(null), NOW, 30), {
        kind: "expired",
    });
});

test("rejects starting a session that has already completed", () => {
    assert.deepEqual(getSessionStartPlan(session("completed"), state(), NOW, 30), {
        kind: "invalid",
    });
});

test("records a normally completed interview with its first end time", () => {
    assert.deepEqual(
        getSessionEndPlan(session("active"), {
            outcome: "completed",
        }, "2026-09-02T10:05:00.000Z"),
        {
            status: "completed",
            endOutcome: "completed",
            endedAt: "2026-09-02T10:05:00.000Z",
            leaseExpiresAt: "2026-09-02T10:05:00.000Z",
            errorCode: null,
        },
    );
});

test("records a technical failure without persisting an SDK message", () => {
    assert.deepEqual(
        getSessionEndPlan(session("active"), {
            outcome: "failed",
            errorCode: "RTC_CONNECTION_FAILED",
        }, "2026-09-02T10:04:00.000Z"),
        {
            status: "failed",
            endOutcome: "failed",
            endedAt: "2026-09-02T10:04:00.000Z",
            leaseExpiresAt: "2026-09-02T10:04:00.000Z",
            errorCode: "RTC_CONNECTION_FAILED",
        },
    );
});

test("a repeated end cannot overwrite the first failure or end time", () => {
    const failedSession = {
        ...session("failed"),
        endOutcome: "failed" as const,
        endedAt: "2026-09-02T10:03:00.000Z",
        errorCode: "SDK_ERROR" as const,
    };

    assert.deepEqual(
        getSessionEndPlan(failedSession, {
            outcome: "completed",
        }, "2026-09-02T10:06:00.000Z"),
        {
            status: "failed",
            endOutcome: "failed",
            endedAt: "2026-09-02T10:03:00.000Z",
            leaseExpiresAt: "2026-09-02T10:06:00.000Z",
            errorCode: "SDK_ERROR",
        },
    );
});

test("records an early user exit as completed but keeps its outcome", () => {
    assert.deepEqual(
        getSessionEndPlan(session("active"), {
            outcome: "user_cancelled",
        }, "2026-09-02T10:02:00.000Z"),
        {
            status: "completed",
            endOutcome: "user_cancelled",
            endedAt: "2026-09-02T10:02:00.000Z",
            leaseExpiresAt: "2026-09-02T10:02:00.000Z",
            errorCode: null,
        },
    );
});
