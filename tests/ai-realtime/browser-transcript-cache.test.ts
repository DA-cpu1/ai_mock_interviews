import test from "node:test";
import assert from "node:assert/strict";
import {cacheFinalSubtitle, readCachedBrowserTranscript, uploadCachedBrowserTranscript} from "../../lib/ai-realtime/browser-transcript-cache.ts";

const message = {id: "user:1", role: "user" as const, sentenceId: 1, text: "我使用过 React。", end: true, updatedAt: 1};

test("keeps failed uploads for retry, isolates sessions and clears successful uploads", async (context) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    const stored = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {configurable: true, value: {sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
    }}});
    context.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
    const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response(null, {status: 503}));
    assert.equal(cacheFinalSubtitle("session-a", message), true);
    assert.equal(readCachedBrowserTranscript("session-b"), undefined);
    await assert.rejects(uploadCachedBrowserTranscript("session-a"), {message: "BROWSER_TRANSCRIPT_UPLOAD_FAILED"});
    assert.equal(readCachedBrowserTranscript("session-a")?.messages.length, 1);
    assert.equal(stored.size, 1);
    fetchMock.mock.mockImplementation(async () => Response.json({success: true}));
    assert.equal(await uploadCachedBrowserTranscript("session-a"), true);
    assert.equal(stored.size, 0);
    assert.equal(readCachedBrowserTranscript("session-a"), undefined);
    assert.equal(await uploadCachedBrowserTranscript("session-b"), false);
    assert.equal(fetchMock.mock.callCount(), 2);
});

test("can still upload in-memory subtitles when session storage is blocked", async (context) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {configurable: true, value: {sessionStorage: {
        getItem: () => null,
        setItem: () => { throw new Error("storage blocked"); },
        removeItem: () => {},
    }}});
    context.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
    context.mock.method(globalThis, "fetch", async () => Response.json({success: true}));
    assert.equal(cacheFinalSubtitle("memory-only", message), false);
    assert.equal(await uploadCachedBrowserTranscript("memory-only"), true);
});
