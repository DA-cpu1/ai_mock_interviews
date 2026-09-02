import assert from "node:assert/strict";
import test from "node:test";

import {assertSessionCreationAllowed} from "../../lib/ai-realtime/session-policy.ts";
import type {AiRealtimeUserSessionState} from "../../types/ai-realtime.ts";

// 所有用例都使用固定 ISO 时间，避免测试结果受真实时钟和时区影响。
const state = (lease: string | null, created: string): AiRealtimeUserSessionState => ({
    userId: "user-1",
    activeSessionId: "session-1",
    leaseExpiresAt: lease,
    lastCreateAt: created,
});

// 租约尚未到期时，即使距离上次创建已超过 10 秒，也必须拒绝重复会话。
test("rejects a session while its active lease is valid", () => {
    assert.throws(
        () => assertSessionCreationAllowed(state("2026-09-02T10:01:00.000Z", "2026-09-02T09:00:00.000Z"), Date.parse("2026-09-02T10:00:00.000Z")),
        {code: "ACTIVE_SESSION_EXISTS"},
    );
});

// 租约过期只解除互斥占用，不会绕过独立的 10 秒创建限流。
test("rate limits immediate reuse of an expired lease", () => {
    assert.throws(
        () => assertSessionCreationAllowed(state("2026-09-02T09:59:00.000Z", "2026-09-02T09:59:55.000Z"), Date.parse("2026-09-02T10:00:00.000Z")),
        {code: "RATE_LIMITED"},
    );
});

// 两道门槛都通过：旧租约已过期，且上次创建距今超过 10 秒。
test("allows an expired lease after the cooldown", () => {
    assert.doesNotThrow(() => assertSessionCreationAllowed(state("2026-09-02T09:59:00.000Z", "2026-09-02T09:00:00.000Z"), Date.parse("2026-09-02T10:00:00.000Z")));
});
