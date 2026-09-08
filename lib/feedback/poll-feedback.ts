export type PollState = "transcript_pending" | "generating" | "insufficient_transcript"
    | "provider_failed" | "ready" | "timeout" | "request_failed" | "unauthenticated" | "not_found";
export const POLL_BUDGET_MS = 120_000;

export const nextPollDelay = (attempt: number, retryAfterMs: unknown) => {
    const serverDelay = typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
        ? Math.max(0, retryAfterMs) : 0;
    return Math.max(serverDelay, Math.min(10_000, 1_000 * 2 ** Math.min(attempt, 4)));
};

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
    }, ms);
    signal.addEventListener("abort", abort, {once: true});
    if (signal.aborted) abort();
});

// 每次只发送一个请求；总时限同时覆盖请求和等待，卸载取消不会再更新界面。
export const pollFeedback = async (
    sessionId: string,
    signal: AbortSignal,
    onState: (state: PollState) => void,
) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, {once: true});
    if (signal.aborted) controller.abort();
    const deadline = Date.now() + POLL_BUDGET_MS;
    const timeout = setTimeout(() => controller.abort(), POLL_BUDGET_MS);
    try {
        for (let attempt = 0; !controller.signal.aborted; attempt++) {
            const response = await fetch(`/api/interviews/${encodeURIComponent(sessionId)}/finalize`, {
                method: "POST", cache: "no-store", signal: controller.signal,
            });
            if (signal.aborted) return;
            if (response.status === 401) { onState("unauthenticated"); return; }
            if (response.status === 404) { onState("not_found"); return; }
            if (!response.ok) throw new Error("FINALIZE_REQUEST_FAILED");
            const value: unknown = await response.json();
            if (!value || typeof value !== "object" || !("status" in value)) throw new Error("INVALID_RESPONSE");
            const state = value.status;
            if (state !== "ready" && state !== "generating" && state !== "transcript_pending"
                && state !== "insufficient_transcript" && state !== "provider_failed") throw new Error("INVALID_STATE");
            if (controller.signal.aborted) break;
            onState(state);
            if (state !== "generating" && state !== "transcript_pending") return;
            const delay = nextPollDelay(attempt, "retryAfterMs" in value ? value.retryAfterMs : undefined);
            // 服务端要求的等待超过剩余预算时停止，不能为了赶时限提前请求。
            if (Date.now() + delay >= deadline) { onState("timeout"); return; }
            await wait(delay, controller.signal);
        }
        if (!signal.aborted) onState("timeout");
    } catch {
        if (!signal.aborted) onState(controller.signal.aborted ? "timeout" : "request_failed");
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
    }
};
