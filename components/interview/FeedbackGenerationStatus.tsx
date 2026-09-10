"use client";

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {LoaderCircle, RotateCcw} from "lucide-react";
import {pollFeedback, type PollState} from "@/lib/feedback/poll-feedback";
import type {FeedbackPageState} from "@/lib/feedback/page-policy";
import {BrowserTranscriptUploadError, uploadCachedBrowserTranscript} from "@/lib/ai-realtime/browser-transcript-cache";

const messages: Record<PollState | "call_failed", [string, string]> = {
    transcript_pending: ["正在整理面试记录", "正在等待本次面试记录完成。"],
    generating: ["正在生成反馈", "正在分析你的回答，请稍候。"],
    insufficient_transcript: ["暂未取得可用于反馈的回答记录", "短回答也可以生成反馈。请重试读取本次记录；若仍未取得回答，可能是记录尚未同步，请稍后再试。"],
    provider_failed: ["反馈暂时无法生成", "面试记录已保留，可以稍后重试。"],
    ready: ["反馈已生成", "正在加载本次反馈。"],
    timeout: ["处理时间较长", "本次等待已结束，记录仍保留。你可以继续查询或稍后返回。"],
    request_failed: ["暂时无法连接", "请检查网络后重试，面试记录不会因此丢失。"],
    unauthenticated: ["登录已过期", "请重新登录后返回本页。"],
    not_found: ["找不到这场面试", "请返回首页选择自己的面试。"],
    call_failed: ["本次通话异常结束", "本次不生成评分，请返回面试重新练习。"],
};

export default function FeedbackGenerationStatus({sessionId, initialState}: {
    sessionId: string; initialState: FeedbackPageState;
}) {
    const router = useRouter();
    const [state, setState] = useState<PollState | "call_failed">(initialState);
    const [attempt, setAttempt] = useState(0);
    const busy = state === "transcript_pending" || state === "generating" || state === "ready";
    const retryable = state === "provider_failed" || state === "timeout" || state === "request_failed"
        || state === "insufficient_transcript";

    useEffect(() => {
        // 服务端只读取；自动生成和有界轮询由这个小组件负责，失败后必须显式重试。
        if (attempt === 0 && initialState !== "transcript_pending" && initialState !== "generating") return;
        const controller = new AbortController();
        // 延后一拍可让 Strict Mode 的试探性挂载先清理，避免首屏重复提交。
        const timer = setTimeout(() => void (async () => {
            try {
                await uploadCachedBrowserTranscript(sessionId, controller.signal);
                if (controller.signal.aborted) return;
                await pollFeedback(sessionId, controller.signal, (next) => {
                    setState(next);
                    if (next === "ready") router.refresh();
                });
            } catch (error) {
                if (!controller.signal.aborted) setState(error instanceof BrowserTranscriptUploadError && error.status === 401
                    ? "unauthenticated" : "request_failed");
            }
        })(), 0);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [sessionId, initialState, attempt, router]);

    const [title, description] = messages[state];
    return <section className="space-y-5 border-y border-white/15 py-10" aria-busy={busy}>
        <div role="status" aria-live="polite" className="space-y-3">
            <h2 className="flex items-center gap-3 text-xl">
                {busy ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true"/> : null}
                {title}
            </h2>
            <p>{description}</p>
        </div>
        {/* 每个终态都有恢复入口；重试重新获得一次有限等待预算。 */}
        {retryable ? <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => {
            setState("transcript_pending"); setAttempt((value) => value + 1);
        }}><RotateCcw size={16} aria-hidden="true"/>{state === "timeout" ? "继续查询" : "重试生成反馈"}</button> : null}
        {state === "unauthenticated" ? <Link href="/sign-in" className="btn-secondary">重新登录</Link> : null}
        {state === "ready" ? <button type="button" className="btn-secondary" onClick={() => router.refresh()}>刷新反馈</button> : null}
    </section>;
}
