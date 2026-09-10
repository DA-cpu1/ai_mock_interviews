import {z} from "zod";
import {normalizeTranscriptText} from "./transcript-text.ts";
import type {AiRealtimeSubtitle} from "../../types/ai-realtime.ts";

export const BROWSER_TRANSCRIPT_MAX_MESSAGES = 200;
export const BROWSER_TRANSCRIPT_MAX_CHARACTERS = 60_000;
const messageSchema = z.object({
    role: z.enum(["user", "assistant"]), sentenceId: z.number().int().nonnegative(),
    text: z.string().max(4_000).transform((text) => normalizeTranscriptText(text) ?? "").pipe(z.string().min(1)),
    updatedAt: z.number().int().nonnegative().max(8_640_000_000_000_000),
}).strict();
export const browserTranscriptSchema = z.object({
    messages: z.array(messageSchema).max(BROWSER_TRANSCRIPT_MAX_MESSAGES),
    truncated: z.boolean(),
}).strict().superRefine(({messages}, ctx) => {
    if (messages.reduce((sum, item) => sum + item.text.length, 0) > BROWSER_TRANSCRIPT_MAX_CHARACTERS) {
        ctx.addIssue({code: "custom", message: "回答记录过长。"});
    }
    const ids = messages.map((item) => `${item.role}:${item.sentenceId}`);
    if (new Set(ids).size !== ids.length) ctx.addIssue({code: "custom", message: "字幕句子重复。"});
});
export type BrowserTranscriptSnapshot = z.infer<typeof browserTranscriptSchema>;

// 独立于最近 50 条展示字幕，只有 SDK 标为最终结果的句子能进入兜底记录。
export const collectFinalSubtitle = (snapshot: BrowserTranscriptSnapshot, message: AiRealtimeSubtitle): BrowserTranscriptSnapshot => {
    if (!message.end) return snapshot;
    if (!normalizeTranscriptText(message.text)) return snapshot;
    const parsed = messageSchema.safeParse({role: message.role, sentenceId: message.sentenceId, text: message.text, updatedAt: message.updatedAt});
    if (!parsed.success) return {...snapshot, truncated: true};
    const next = snapshot.messages.slice();
    const index = next.findIndex((item) => item.role === message.role && item.sentenceId === message.sentenceId);
    if (index < 0) next.push(parsed.data);
    else next[index] = parsed.data;
    let truncated = snapshot.truncated;
    let characters = next.reduce((sum, item) => sum + item.text.length, 0);
    while (next.length > BROWSER_TRANSCRIPT_MAX_MESSAGES || characters > BROWSER_TRANSCRIPT_MAX_CHARACTERS) {
        const removed = next.shift();
        if (!removed) break;
        characters -= removed.text.length;
        truncated = true;
    }
    return {messages: next, truncated};
};
