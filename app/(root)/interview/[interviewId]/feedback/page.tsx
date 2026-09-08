import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {ArrowLeft, RotateCcw} from "lucide-react";
import {getCurrentUser} from "@/lib/action/auth.action";
import {readFeedbackPage} from "@/lib/feedback/page-store.server";
import FeedbackGenerationStatus from "@/components/interview/FeedbackGenerationStatus";
import InterviewFeedback from "@/components/interview/InterviewFeedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({params, searchParams}: {
    params: Promise<{interviewId: string}>;
    searchParams: Promise<{sessionId?: string | string[]}>;
}) {
    const [{interviewId}, query, user] = await Promise.all([params, searchParams, getCurrentUser()]);
    if (!user) redirect("/sign-in");
    const result = await readFeedbackPage(query.sessionId, interviewId, user.id);
    if (!result) notFound();

    // 首次渲染优先读已有反馈；ready 时不挂载生成组件，刷新也不会调用模型。
    return <main className="mx-auto w-full max-w-4xl space-y-8 pb-10 [overflow-wrap:anywhere]">
        <header className="space-y-3">
            <h1 className="text-3xl font-semibold">面试反馈</h1>
            <p>本次结果是 AI 生成的练习建议，不代表招聘决定或对个人能力的事实判断。</p>
        </header>
        {result.feedback ? <InterviewFeedback feedback={result.feedback}/> :
            <FeedbackGenerationStatus key={result.sessionId} sessionId={result.sessionId} initialState={result.state}/>}
        <nav aria-label="反馈页操作" className="flex flex-wrap gap-4">
            <Link href={`/interview/${encodeURIComponent(interviewId)}`} className="btn-secondary inline-flex items-center gap-2"><RotateCcw size={16} aria-hidden="true"/>重新练习</Link>
            <Link href="/" className="btn-secondary inline-flex items-center gap-2"><ArrowLeft size={16} aria-hidden="true"/>返回首页</Link>
        </nav>
    </main>;
}
