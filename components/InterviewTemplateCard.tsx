import {
    ArrowUpRight,
    Code2,
    Layers3,
    MessagesSquare,
    Network,
    type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type {InterviewTemplate} from "@/constants/interviews";

const icons: Record<InterviewTemplate["id"], LucideIcon> = {
    technical: Code2,
    "system-design": Network,
    behavioral: MessagesSquare,
    mixed: Layers3,
};

const InterviewTemplateCard = ({template}: {template: InterviewTemplate}) => {
    const Icon = icons[template.id];

    return (
        <Link
            href={`/interview?template=${template.id}`}
            className="group flex min-h-52 flex-col justify-between rounded-lg border border-white/10 bg-dark-300 p-5 transition hover:-translate-y-1 hover:border-primary-200/60 hover:bg-dark-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200"
        >
            <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-md bg-primary-200/10 text-primary-200">
                    <Icon aria-hidden="true" className="size-5"/>
                </span>
                <ArrowUpRight aria-hidden="true" className="size-5 text-light-400 transition group-hover:text-primary-200"/>
            </div>
            <div className="space-y-2">
                <h3 className="text-xl text-white">{template.title}</h3>
                <p className="text-sm leading-6 text-light-100">{template.description}</p>
                <p className="text-xs font-semibold text-primary-200">AI 动态规划 {template.questionCount} 道问题</p>
            </div>
        </Link>
    );
};

export default InterviewTemplateCard;
