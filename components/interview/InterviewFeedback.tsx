import {FEEDBACK_DIMENSION_LABELS} from "@/lib/feedback/schema";
import type {FeedbackRecord} from "@/types/feedback";

// 正文保持为 Server Component，模型信息、文本哈希等内部字段不传入浏览器组件。
export default function InterviewFeedback({feedback}: {feedback: FeedbackRecord}) {
    return <div className="space-y-8">
        <section className="flex flex-wrap items-end justify-between gap-4 border-y border-white/15 py-6" aria-labelledby="score-heading">
            <div><h2 id="score-heading" className="text-xl">本次练习总分</h2><p className="mt-2 text-sm">五个维度等权计算</p></div>
            <p><strong className="text-5xl text-emerald-300">{feedback.totalScore}</strong><span> / 100</span></p>
        </section>
        <section aria-labelledby="dimensions-heading">
            <h2 id="dimensions-heading" className="mb-4 text-xl">维度反馈</h2>
            <div className="grid gap-4 sm:grid-cols-2">
                {feedback.categoryScores.map((item) => <article key={item.id} className="min-w-0 rounded-lg border border-white/15 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg">{FEEDBACK_DIMENSION_LABELS[item.id]}</h3><span className="text-emerald-300">{item.score} / 100</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap leading-7">{item.comment}</p>
                </article>)}
            </div>
        </section>
        <div className="grid gap-8 sm:grid-cols-2">
            <section aria-labelledby="strengths-heading"><h2 id="strengths-heading" className="mb-3 text-xl">优势</h2>
                <ul className="space-y-3 leading-7">{feedback.strengths.map((text, index) => <li key={index}>{text}</li>)}</ul>
            </section>
            <section aria-labelledby="improvements-heading"><h2 id="improvements-heading" className="mb-3 text-xl">改进项</h2>
                <ul className="space-y-3 leading-7">{feedback.areasForImprovement.map((text, index) => <li key={index}>{text}</li>)}</ul>
            </section>
        </div>
        <section className="border-t border-white/15 pt-6" aria-labelledby="assessment-heading">
            <h2 id="assessment-heading" className="mb-3 text-xl">总结</h2><p className="whitespace-pre-wrap leading-7">{feedback.finalAssessment}</p>
        </section>
    </div>;
}
