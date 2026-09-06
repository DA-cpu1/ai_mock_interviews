import {createHash, timingSafeEqual} from "node:crypto";

import {z} from "zod";

const identifierSchema = z.string().trim().min(1).max(256);
const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const statusEventSchema = z.enum(["agent_start", "session_start", "agent_stop", "error"]);
const callbackEnvelopeSchema = z.object({
    aiAgentId: identifierSchema,
    instanceId: identifierSchema,
    event: z.string().trim().min(1).max(64),
    code: z.union([z.string().max(128), z.number().finite()]),
    message: z.string().max(1024),
    timestamp: z.string().datetime({offset: true}),
    userData: z.string().max(4096).optional(),
    data: z.unknown().optional(),
});
const userDataSchema = z.object({sessionId: sessionIdSchema});
const directChatRecordSchema = z.object({
    role: z.enum(["user", "agent", "assistant"]),
    text: z.string().trim().min(1).max(4000),
    sentence_id: z.number().int().nonnegative().optional(),
});
const dialogueSchema = z.object({
    producer: z.enum(["user", "agent", "assistant"]),
    text: z.string().trim().min(1).max(4000),
    time: z.number().int().nonnegative().max(8_640_000_000_000_000),
    dialogueId: identifierSchema.optional(),
    roundId: identifierSchema.optional(),
});
const dialogueBatchSchema = z.object({
    dialogues: z.array(dialogueSchema).min(1).max(200),
});

export interface NormalizedAliyunChatMessage {
    role: "user" | "assistant";
    text: string;
    sentenceId?: number;
    dialogueId?: string;
    roundId?: string;
    occurredAt: string;
}

export interface NormalizedAliyunChatCallback {
    event: "chat_record";
    aiAgentId: string;
    instanceId: string;
    sessionId: string;
    occurredAt: string;
    messages: NormalizedAliyunChatMessage[];
}

export interface NormalizedAliyunStatusCallback {
    event: z.infer<typeof statusEventSchema>;
    aiAgentId: string;
    instanceId: string;
    sessionId: string;
    occurredAt: string;
}

export type NormalizedAliyunCallback =
    | NormalizedAliyunChatCallback
    | NormalizedAliyunStatusCallback;

export type AliyunCallbackParseResult =
    | {kind: "accepted"; callback: NormalizedAliyunCallback}
    | {kind: "ignored"; event: string}
    | {kind: "invalid"; code: "INVALID_PAYLOAD" | "INVALID_USER_DATA" | "INVALID_EVENT_DATA"};

const normalizeRole = (role: "user" | "agent" | "assistant") =>
    role === "user" ? "user" as const : "assistant" as const;

export const MAX_ALIYUN_CALLBACK_BODY_BYTES = 256 * 1024;

export type AliyunCallbackBodyResult =
    | {kind: "ok"; body: unknown}
    | {kind: "invalid_content_type" | "invalid_request" | "too_large" | "invalid_json"};

/**
 * 先校验声明长度，再按块限制实际读取量；只有完整 body 未越界才解析 JSON。
 * 这既限制无 Content-Length 请求，也避免错误响应或日志泄露原始对话正文。
 */
export const readAliyunCallbackBody = async (
    request: Request,
): Promise<AliyunCallbackBodyResult> => {
    const contentType = request.headers.get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
    if (contentType !== "application/json") return {kind: "invalid_content_type"};

    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null) {
        if (!/^\d+$/.test(declaredLength)) return {kind: "invalid_request"};
        if (Number(declaredLength) > MAX_ALIYUN_CALLBACK_BODY_BYTES) {
            return {kind: "too_large"};
        }
    }
    if (!request.body) return {kind: "invalid_json"};

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_ALIYUN_CALLBACK_BODY_BYTES) {
                await reader.cancel();
                return {kind: "too_large"};
            }
            chunks.push(value);
        }
    } catch {
        return {kind: "invalid_request"};
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    try {
        const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
        return {kind: "ok", body: JSON.parse(text)};
    } catch {
        return {kind: "invalid_json"};
    }
};

const digestAuthorization = (value: string): Buffer =>
    createHash("sha256").update(value, "utf8").digest();

/**
 * Authorization 先哈希成固定长度再比较，避免原始 Token 长度形成提前返回分支。
 * 调用方只得到布尔结果，不能把凭证写入响应或日志。
 */
export const isValidCallbackAuthorization = (
    authorization: string | undefined,
    configuredToken: string,
): boolean => timingSafeEqual(
    digestAuthorization(authorization ?? ""),
    digestAuthorization(configuredToken),
);

export const parseAliyunCallbackPayload = (input: unknown): AliyunCallbackParseResult => {
    const envelopeResult = callbackEnvelopeSchema.safeParse(input);
    if (!envelopeResult.success) return {kind: "invalid", code: "INVALID_PAYLOAD"};

    const envelope = envelopeResult.data;
    const statusEventResult = statusEventSchema.safeParse(envelope.event);
    if (envelope.event !== "chat_record" && !statusEventResult.success) {
        return {kind: "ignored", event: envelope.event};
    }
    if (!envelope.userData) return {kind: "invalid", code: "INVALID_USER_DATA"};

    let rawUserData: unknown;
    try {
        rawUserData = JSON.parse(envelope.userData);
    } catch {
        return {kind: "invalid", code: "INVALID_USER_DATA"};
    }
    const userDataResult = userDataSchema.safeParse(rawUserData);
    if (!userDataResult.success) return {kind: "invalid", code: "INVALID_USER_DATA"};

    if (statusEventResult.success) {
        return {
            kind: "accepted",
            callback: {
                event: statusEventResult.data,
                aiAgentId: envelope.aiAgentId,
                instanceId: envelope.instanceId,
                sessionId: userDataResult.data.sessionId,
                occurredAt: envelope.timestamp,
            },
        };
    }

    const directResult = directChatRecordSchema.safeParse(envelope.data);
    const batchResult = dialogueBatchSchema.safeParse(envelope.data);
    let messages: NormalizedAliyunChatMessage[];
    if (directResult.success) {
        messages = [{
            role: normalizeRole(directResult.data.role),
            text: directResult.data.text,
            ...(directResult.data.sentence_id === undefined
                ? {}
                : {sentenceId: directResult.data.sentence_id}),
            occurredAt: envelope.timestamp,
        }];
    } else {
        if (!batchResult.success) return {kind: "invalid", code: "INVALID_EVENT_DATA"};
        messages = batchResult.data.dialogues.map((dialogue) => ({
            role: normalizeRole(dialogue.producer),
            text: dialogue.text,
            ...(dialogue.dialogueId ? {dialogueId: dialogue.dialogueId} : {}),
            ...(dialogue.roundId ? {roundId: dialogue.roundId} : {}),
            occurredAt: new Date(dialogue.time).toISOString(),
        }));
    }

    return {
        kind: "accepted",
        callback: {
            event: "chat_record",
            aiAgentId: envelope.aiAgentId,
            instanceId: envelope.instanceId,
            sessionId: userDataResult.data.sessionId,
            occurredAt: envelope.timestamp,
            messages,
        },
    };
};
