import "server-only";

import {db} from "@/firebase/admin";
import type {
    AiRealtimeSessionRecord,
    AiRealtimeUserSessionState,
} from "@/types/ai-realtime";

import {assertSessionCreationAllowed, SessionCreationError} from "./session-policy";

// 原子地创建会话并占用用户级活跃锁。
// 归属校验、锁读取和两次写入必须处于同一事务中，否则并发请求都可能
// 在看到“没有活跃会话”后各自创建一条会话记录。
export const createSessionWithActiveLock = async (
    record: AiRealtimeSessionRecord,
): Promise<void> => {
    // 会话记录按会话 ID 保存；用户状态按用户 ID 保存，因而同一用户的
    // 所有创建请求都会竞争同一份状态文档。
    const interviewRef = db.collection("interviews").doc(record.interviewId);
    const sessionRef = db.collection("interviewSessions").doc(record.id);
    const stateRef = db.collection("aiRealtimeUserStates").doc(record.userId);

    await db.runTransaction(async (transaction) => {
        // Firestore 事务先完成全部读取，再执行写入。发生并发修改时，SDK 会
        // 重试事务，让策略基于最新的面试和用户锁状态重新判断。
        const [interviewSnapshot, stateSnapshot] = await transaction.getAll(
            interviewRef,
            stateRef,
        );

        // 不区分“记录不存在”和“记录不属于当前用户”，避免泄露其他用户的面试。
        if (!interviewSnapshot.exists || interviewSnapshot.get("userId") !== record.userId) {
            throw new SessionCreationError("INTERVIEW_NOT_FOUND");
        }

        const state = stateSnapshot.exists
            ? stateSnapshot.data() as AiRealtimeUserSessionState
            : undefined;
        // 使用待创建记录的服务端时间作为同一次判断与写入的统一时间基准。
        assertSessionCreationAllowed(state, Date.parse(record.createdAt));

        // create 要求该会话 ID 尚不存在；set 则既能创建首次状态，也能原子覆盖过期锁。
        transaction.create(sessionRef, record);
        transaction.set(stateRef, {
            userId: record.userId,
            activeSessionId: record.id,
            leaseExpiresAt: record.leaseExpiresAt,
            lastCreateAt: record.createdAt,
        } satisfies AiRealtimeUserSessionState);
    });
};
