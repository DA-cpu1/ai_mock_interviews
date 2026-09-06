import {createHash} from "node:crypto";

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

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const COMPLETION_MARKER = /\[INTERVIEW_COMPLETE\]/giu;

export const normalizeTranscriptText = (text: string): string | null => {
    const normalized = text
        .normalize("NFC")
        .replace(COMPLETION_MARKER, " ")
        .replace(CONTROL_CHARACTERS, "")
        .replace(/\s+/gu, " ")
        .trim();

    return normalized.length > 0 ? normalized : null;
};

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
