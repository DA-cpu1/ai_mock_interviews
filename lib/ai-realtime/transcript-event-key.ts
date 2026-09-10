import {createHash} from "node:crypto";
import {normalizeTranscriptText} from "./transcript-text.ts";
export {normalizeTranscriptText} from "./transcript-text.ts";

export interface TranscriptEventKeyInput {
    sessionId: string;
    instanceId: string;
    role: "user" | "assistant";
    text: string;
    occurredAt: string;
    sentenceId?: number;
    dialogueId?: string;
    roundId?: string;
}

export const createTranscriptEventKey = (input: TranscriptEventKeyInput): string => {
    // Stable provider ids keep updates on one document; the fallback distinguishes id-less events.
    const text = normalizeTranscriptText(input.text) ?? "";
    const identity = input.dialogueId
        ? ["dialogue", input.dialogueId]
        : input.sentenceId === undefined
            ? ["content", input.occurredAt, text]
            : ["sentence", String(input.sentenceId)];

    return createHash("sha256")
        .update([
            "transcript-event-v1",
            "chat_record",
            input.sessionId,
            input.instanceId,
            input.role,
            ...identity,
        ].join("\n"), "utf8")
        .digest("hex");
};
