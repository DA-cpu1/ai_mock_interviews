import {browserTranscriptSchema} from "../ai-realtime/browser-transcript-protocol.ts";
import {createTranscriptHash, type TranscriptReadiness} from "../ai-realtime/transcript-readiness.ts";

export type FeedbackTranscript =
    | {status: "ready"; transcript: string; transcriptHash: string; source: "aliyun_callback" | "browser_subtitles"; truncated: boolean}
    | {status: "pending"; retryAfterMs: number}
    | {status: "insufficient"}
    | {status: "failed"; code: string};

export const selectFeedbackTranscript = (input: {
    callback: TranscriptReadiness; callbackHasAnswer: boolean; completed: boolean; browserSnapshot?: unknown;
}): FeedbackTranscript => {
    const {callback} = input;
    if (callback.status === "ready") return {...callback, source: "aliyun_callback", truncated: false};
    const unavailable: FeedbackTranscript = callback.status === "pending"
        ? {status: "pending", retryAfterMs: callback.retryAfterMs}
        : callback.status === "failed" ? {status: "failed", code: callback.code} : {status: "insufficient"};
    // 已有回调回答时继续等它就绪；失败数据不通过浏览器路径掩盖。
    if (callback.status === "failed" || input.callbackHasAnswer || !input.completed || input.browserSnapshot === undefined) return unavailable;
    const parsed = browserTranscriptSchema.safeParse(input.browserSnapshot);
    if (!parsed.success) return {status: "failed", code: "INVALID_BROWSER_TRANSCRIPT"};
    if (!parsed.data.messages.some((item) => item.role === "user")) return unavailable;
    const transcript = parsed.data.messages.map((item) => `${item.role}: ${item.text}`).join("\n");
    return {status: "ready", transcript, transcriptHash: createTranscriptHash(transcript), source: "browser_subtitles", truncated: parsed.data.truncated};
};
