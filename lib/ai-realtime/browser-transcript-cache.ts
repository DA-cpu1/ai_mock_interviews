import {browserTranscriptSchema, collectFinalSubtitle, type BrowserTranscriptSnapshot} from "./browser-transcript-protocol.ts";
import type {AiRealtimeSubtitle} from "../../types/ai-realtime.ts";

// 仅由客户端调用。内存用于存储不可用时的当前页面恢复，sessionStorage 用于同标签页刷新恢复。
const memory = new Map<string, BrowserTranscriptSnapshot>();
const key = (sessionId: string) => `interview-browser-transcript:${sessionId}`;

export const readCachedBrowserTranscript = (sessionId: string): BrowserTranscriptSnapshot | undefined => {
    const cached = memory.get(sessionId);
    if (cached) return cached;
    try {
        const raw = window.sessionStorage.getItem(key(sessionId));
        if (!raw) return;
        const parsed = browserTranscriptSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) throw new Error("INVALID_CACHED_TRANSCRIPT");
        memory.set(sessionId, parsed.data);
        return parsed.data;
    } catch {
        console.warn("[feedback] browser transcript cache could not be read");
    }
};

export const cacheFinalSubtitle = (sessionId: string, message: AiRealtimeSubtitle): boolean => {
    if (!message.end) return true;
    const current = readCachedBrowserTranscript(sessionId) ?? {messages: [], truncated: false};
    const next = collectFinalSubtitle(current, message);
    memory.set(sessionId, next);
    try {
        window.sessionStorage.setItem(key(sessionId), JSON.stringify(next));
        return true;
    } catch {
        // 内存中的完整快照仍然可在挂断后上传。
        return false;
    }
};

export class BrowserTranscriptUploadError extends Error {
    readonly status: number;
    constructor(status: number) { super("BROWSER_TRANSCRIPT_UPLOAD_FAILED"); this.status = status; }
}

export const uploadCachedBrowserTranscript = async (sessionId: string, signal?: AbortSignal): Promise<boolean> => {
    const snapshot = readCachedBrowserTranscript(sessionId);
    if (!snapshot?.messages.some((item) => item.role === "user")) return false;
    const timeout = AbortSignal.timeout(15_000);
    const response = await fetch(`/api/interviews/${encodeURIComponent(sessionId)}/browser-transcript`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify(snapshot), cache: "no-store",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) throw new BrowserTranscriptUploadError(response.status);
    memory.delete(sessionId);
    try {
        window.sessionStorage.removeItem(key(sessionId));
    } catch {
        console.warn("[feedback] uploaded browser transcript cache could not be cleared");
    }
    return true;
};
