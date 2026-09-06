import {createHash} from "node:crypto";

import type {
    AiRealtimeTranscriptStatus,
    TranscriptMessage,
} from "@/types/ai-realtime";

import {normalizeTranscriptText} from "./transcript-event-key.ts";

// agent_stop 只表示智能体停止，不保证最后一条 chat_record 已经到达。
// 等待这一段安静窗口，可以避免用缺少最后回答的 transcript 生成反馈。
export const TRANSCRIPT_SILENCE_WINDOW_MS = 5_000;
// 尚未收到 agent_stop 时没有准确的剩余时间，调用方按这个间隔再次检查。
export const TRANSCRIPT_PENDING_RETRY_MS = 1_000;
// 这些限制同时保护 Firestore 读取、内存使用和后续发送给模型的 prompt 大小。
export const MAX_TRANSCRIPT_MESSAGES = 200;
export const MAX_TRANSCRIPT_MESSAGE_CHARACTERS = 4_000;
export const MAX_TRANSCRIPT_TOTAL_CHARACTERS = 60_000;
// 只有候选人的有效文本参与这个阈值，避免“只说了欢迎语”被当成完成面试。
const MIN_USER_ANSWER_CHARACTERS = 20;

export type TranscriptReadinessFailureCode =
    | "MESSAGE_LIMIT_EXCEEDED"
    | "MESSAGE_TOO_LONG"
    | "TRANSCRIPT_TOO_LONG"
    | "INVALID_MESSAGE"
    | "INVALID_TIMESTAMP";

export interface TranscriptReadinessInput {
    // providerStoppedAt 和 lastTranscriptAt 都来自服务端回调归档，不来自浏览器字幕。
    providerStoppedAt?: string;
    lastTranscriptAt?: string;
    messages: readonly TranscriptMessage[];
    // 显式传入时间，让测试和生产判断使用同一套纯函数逻辑。
    nowMs: number;
}

export interface NormalizedTranscript {
    // ready 和 insufficient 都返回规范化结果，后续可以记录 hash 或展示诊断信息。
    messages: TranscriptMessage[];
    transcript: string;
    transcriptHash: string;
    totalCharacters: number;
    userCharacters: number;
}

export type TranscriptReadiness =
    | {status: "pending"; retryAfterMs: number}
    | ({status: "ready" | "insufficient"} & NormalizedTranscript)
    | {status: "failed"; code: TranscriptReadinessFailureCode};

export type TranscriptReadinessStatus = AiRealtimeTranscriptStatus;

const compareMessages = (left: TranscriptMessage, right: TranscriptMessage): number => {
    // 回调可能乱序到达；发生同一时间时再用 eventKey 保证顺序稳定。
    const occurredAt = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return Number.isNaN(occurredAt) || occurredAt === 0
        ? left.occurredAt.localeCompare(right.occurredAt) || left.eventKey.localeCompare(right.eventKey)
        : occurredAt;
};

// Array.from 按 Unicode 码点计数，中文和 emoji 不会因为 UTF-16 代理对被多算一次。
const characterCount = (text: string): number => Array.from(text).length;

const hasValidMessageFields = (message: TranscriptMessage): boolean => {
    // TypeScript 的类型断言不会在运行时验证 Firestore 数据，因此边界处仍要检查字段。
    const value: unknown = message;
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (record.role === "user" || record.role === "assistant")
        && typeof record.eventKey === "string"
        && typeof record.text === "string"
        && typeof record.occurredAt === "string"
        && record.source === "aliyun_callback";
};

const createTranscriptText = (messages: readonly TranscriptMessage[]): string => messages
    // 固定角色前缀和换行格式，让相同内容每次得到同一个 hash。
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");

export const createTranscriptHash = (transcript: string): string =>
    createHash("sha256").update(transcript, "utf8").digest("hex");

export const sortTranscriptMessages = (
    messages: readonly TranscriptMessage[],
): TranscriptMessage[] => [...messages].sort(compareMessages);

type PreparedTranscript =
    | {kind: "ok"; value: NormalizedTranscript}
    | {kind: "failed"; code: TranscriptReadinessFailureCode};

const prepareTranscript = (messages: readonly TranscriptMessage[]): PreparedTranscript => {
    // 先挡住数量，再处理正文，避免异常数据进入后续排序和 hash 计算。
    if (messages.length > MAX_TRANSCRIPT_MESSAGES) {
        return {kind: "failed", code: "MESSAGE_LIMIT_EXCEEDED"};
    }

    // Firestore 返回的是运行时数据；这里只接受 M3 约定的服务端回调消息。
    for (const message of messages) {
        if (!hasValidMessageFields(message)) {
            return {kind: "failed", code: "INVALID_MESSAGE"};
        }
        if (Number.isNaN(Date.parse(message.occurredAt))) {
            return {kind: "failed", code: "INVALID_TIMESTAMP"};
        }
    }

    const sortedMessages = sortTranscriptMessages(messages);
    const normalizedMessages: TranscriptMessage[] = [];
    let totalCharacters = 0;
    let userCharacters = 0;

    for (const message of sortedMessages) {
        const text = normalizeTranscriptText(message.text);
        // 空白或控制标记不是有效发言；M3 通常已过滤，这里再次保持读取安全。
        if (!text) continue;
        const messageCharacters = characterCount(text);
        // 单条限制防止一条异常消息占满整个反馈输入。
        if (messageCharacters > MAX_TRANSCRIPT_MESSAGE_CHARACTERS) {
            return {kind: "failed", code: "MESSAGE_TOO_LONG"};
        }
        totalCharacters += messageCharacters;
        // 总量限制防止多条合法消息合起来超过模型输入和系统资源的边界。
        if (totalCharacters > MAX_TRANSCRIPT_TOTAL_CHARACTERS) {
            return {kind: "failed", code: "TRANSCRIPT_TOO_LONG"};
        }
        if (message.role === "user") userCharacters += messageCharacters;
        normalizedMessages.push({...message, text});
    }

    const transcript = createTranscriptText(normalizedMessages);
    return {
        kind: "ok",
        value: {
            messages: normalizedMessages,
            transcript,
            transcriptHash: createTranscriptHash(transcript),
            totalCharacters,
            userCharacters,
        },
    };
};

/**
 * 判断本场 transcript 是否可以用于生成反馈。
 * 只使用传入的 nowMs，避免就绪状态依赖墙上时钟，便于固定时间测试。
 */
export const getTranscriptReadiness = ({
    providerStoppedAt,
    lastTranscriptAt,
    messages,
    nowMs,
}: TranscriptReadinessInput): TranscriptReadiness => {
    const prepared = prepareTranscript(messages);
    if (prepared.kind === "failed") return {status: "failed", code: prepared.code};
    if (!providerStoppedAt) {
        // 没有 provider stop 时，回调还可能继续到达，不能提前生成反馈。
        return {status: "pending", retryAfterMs: TRANSCRIPT_PENDING_RETRY_MS};
    }

    const stoppedMs = Date.parse(providerStoppedAt);
    const lastMessageMs = lastTranscriptAt === undefined
        ? stoppedMs
        : Date.parse(lastTranscriptAt);
    if (Number.isNaN(stoppedMs) || Number.isNaN(lastMessageMs) || !Number.isFinite(nowMs)) {
        return {status: "failed", code: "INVALID_TIMESTAMP"};
    }

    const latestMessageMs = prepared.value.messages.reduce(
        (latest, message) => Math.max(latest, Date.parse(message.occurredAt)),
        stoppedMs,
    );
    // 同一时刻读取 Session 和消息不是原子快照，以消息自身时间补足可能过期的 Session 元数据。
    const lastActivityMs = Math.max(stoppedMs, lastMessageMs, latestMessageMs);
    const remainingMs = TRANSCRIPT_SILENCE_WINDOW_MS - (nowMs - lastActivityMs);
    if (remainingMs > 0) {
        return {status: "pending", retryAfterMs: Math.ceil(remainingMs)};
    }

    const hasAssistantQuestion = prepared.value.messages.some(
        (message) => message.role === "assistant",
    );
    // 最小有效问答需要 AI 发言和候选人至少 20 个有效字符，欢迎语本身不算回答。
    return {
        status: hasAssistantQuestion && prepared.value.userCharacters >= MIN_USER_ANSWER_CHARACTERS
            ? "ready"
            : "insufficient",
        ...prepared.value,
    };
};
