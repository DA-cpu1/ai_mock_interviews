import "server-only";

import {db} from "@/firebase/admin";
import type {NormalizedAliyunCallback} from "@/lib/aliyun/callback-protocol";
import type {AiRealtimeSessionRecord, TranscriptMessage} from "@/types/ai-realtime";

import {getCallbackSessionPlan} from "./callback-policy";
import {createTranscriptEventKey, normalizeTranscriptText} from "./transcript-event-key";

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
