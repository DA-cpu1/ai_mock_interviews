import "server-only";

import {db} from "@/firebase/admin";
import type {NormalizedAliyunCallback} from "@/lib/aliyun/callback-protocol";
import type {AiRealtimeSessionRecord, TranscriptMessage} from "@/types/ai-realtime";

import {getCallbackSessionPlan} from "./callback-policy";
import {createTranscriptEventKey, normalizeTranscriptText} from "./transcript-event-key";
import {
    getTranscriptReadiness,
    MAX_TRANSCRIPT_MESSAGES,
} from "./transcript-readiness";

export type CallbackPersistenceErrorCode = "SESSION_NOT_FOUND" | "AGENT_MISMATCH" | "SESSION_INSTANCE_MISMATCH";
export class CallbackPersistenceError extends Error {
    constructor(readonly code: CallbackPersistenceErrorCode) {
        super(code); this.name = "CallbackPersistenceError";
    }
}

type PreparedMessage = Omit<TranscriptMessage, "source" | "receivedAt">;
export interface PersistedCallbackResult {
    insertedMessages: number;
    duplicateMessages: number;
}

export interface ReadTranscriptResult {
    // Session 提供 stop 时间；readiness 提供反馈生成前必须满足的状态和规范化正文。
    session: AiRealtimeSessionRecord;
    readiness: ReturnType<typeof getTranscriptReadiness>;
}

/**
 * 读取服务端回调保存的权威 transcript，并判断它是否已经适合生成反馈。
 * 这个函数不读取浏览器字幕，也不在读取阶段修改 Session 状态；状态写回由 finalize 流程负责。
 */
export const readTranscriptForFeedback = async (
    sessionId: string,
    options: {now?: Date} = {},
): Promise<ReadTranscriptResult | null> => {
    const sessionRef = db.collection("interviewSessions").doc(sessionId);
    const sessionSnapshot = await sessionRef.get();
    // 先判断 Session 是否存在，避免对不存在的面试继续读取子集合。
    if (!sessionSnapshot.exists) return null;

    // 多读一条哨兵文档即可识别越界；真正交给策略处理的消息仍受 200 条上限保护。
    // 查询只按时间取候选集，同一时间的 eventKey 排序在纯函数中完成，避免依赖复合索引。
    const messageSnapshot = await sessionRef.collection("messages")
        .orderBy("occurredAt", "asc")
        .limit(MAX_TRANSCRIPT_MESSAGES + 1)
        .get();
    const session = sessionSnapshot.data() as AiRealtimeSessionRecord;
    const messages = messageSnapshot.docs.map(
        // M3 已限制写入字段；M4 的纯策略仍会再次检查运行时数据。
        (snapshot) => snapshot.data() as TranscriptMessage,
    );

    // SDK 挂断后 agent_stop 回调可能延迟或丢失；已由服务端确认完成的会话
    // 使用 endedAt 作为临时停止点，仍保留静默窗口等待迟到的 chat_record。
    const providerStoppedAt = session.providerStoppedAt
        ?? (session.status === "completed" ? session.endedAt : undefined);

    return {
        session,
        // now 可注入固定时间，生产默认使用当前时间，测试不依赖真实时钟。
        readiness: getTranscriptReadiness({
            providerStoppedAt,
            lastTranscriptAt: session.lastTranscriptAt,
            messages,
            nowMs: (options.now ?? new Date()).getTime(),
        }),
    };
};

const prepareMessages = (callback: NormalizedAliyunCallback): PreparedMessage[] => {
    if (callback.event !== "chat_record") return [];
    const messages = new Map<string, PreparedMessage>();
    for (const input of callback.messages) {
        const text = normalizeTranscriptText(input.text);
        if (!text) continue;
        const eventKey = createTranscriptEventKey({
            ...input,
            text,
            sessionId: callback.sessionId,
            instanceId: callback.instanceId,
        });
        messages.set(eventKey, {...input, text, eventKey});
    }
    return [...messages.values()];
};

const toStoredMessage = (message: PreparedMessage, receivedAt: string): TranscriptMessage => ({
    eventKey: message.eventKey,
    role: message.role,
    text: message.text,
    source: "aliyun_callback",
    occurredAt: message.occurredAt,
    receivedAt,
    ...(message.sentenceId === undefined ? {} : {sentenceId: message.sentenceId}),
    ...(message.dialogueId === undefined ? {} : {dialogueId: message.dialogueId}),
    ...(message.roundId === undefined ? {} : {roundId: message.roundId}),
});
const latestTimestamp = (current: string | undefined, candidate: string): string =>
    !current || Date.parse(candidate) > Date.parse(current) ? candidate : current;

const storedCount = (value: number | undefined): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
export const persistAliyunCallback = async (
    callback: NormalizedAliyunCallback,
    options: {now?: Date} = {},
): Promise<PersistedCallbackResult> => {
    const receivedAt = (options.now ?? new Date()).toISOString();
    const messages = prepareMessages(callback);
    const sessionRef = db.collection("interviewSessions").doc(callback.sessionId);
    const messageRefs = messages.map((message) => sessionRef.collection("messages").doc(message.eventKey));

    // Read the session and candidate message docs before any write to make replay counting atomic.
    return db.runTransaction(async (transaction) => {
        const snapshots = await transaction.getAll(sessionRef, ...messageRefs);
        const sessionSnapshot = snapshots[0];
        if (!sessionSnapshot.exists) throw new CallbackPersistenceError("SESSION_NOT_FOUND");

        const session = sessionSnapshot.data() as AiRealtimeSessionRecord;
        if (session.agentId !== callback.aiAgentId) {
            throw new CallbackPersistenceError("AGENT_MISMATCH");
        }
        const plan = getCallbackSessionPlan(session, callback);
        if (plan.kind === "reject") throw new CallbackPersistenceError(plan.code);

        const updates: Record<string, unknown> = {...plan.updates};
        let insertedMessages = 0;
        let duplicateMessages = 0;
        let lastTranscriptAt = session.lastTranscriptAt;

        messages.forEach((message, index) => {
            const messageSnapshot = snapshots[index + 1];
            const messageRef = messageRefs[index];
            const stored = toStoredMessage(message, receivedAt);
            if (messageSnapshot.exists) {
                duplicateMessages += 1;
                const previous = messageSnapshot.data();
                const firstReceivedAt = typeof previous?.receivedAt === "string" ? previous.receivedAt : receivedAt;
                transaction.update(messageRef, {...stored, receivedAt: firstReceivedAt});
            } else {
                insertedMessages += 1;
                transaction.create(messageRef, stored);
            }
            lastTranscriptAt = latestTimestamp(lastTranscriptAt, message.occurredAt);
        });

        if (callback.event === "chat_record" && messages.length > 0) {
            const count = storedCount(session.transcriptMessageCount);
            if (insertedMessages > 0 || count !== null) updates.transcriptMessageCount = (count ?? 0) + insertedMessages;
            if (lastTranscriptAt !== session.lastTranscriptAt) updates.lastTranscriptAt = lastTranscriptAt;
        }
        if (Object.keys(updates).length > 0) transaction.update(sessionRef, updates);

        return {insertedMessages, duplicateMessages};
    });
};
