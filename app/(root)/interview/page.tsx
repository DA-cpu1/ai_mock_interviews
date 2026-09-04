import {ClipboardList} from "lucide-react";

import CreateInterviewForm from "@/components/interview/CreateInterviewForm";
import {INTERVIEW_TEMPLATES} from "@/constants/interviews";

const Page = async (props: PageProps<"/interview">) => {
    const {template} = await props.searchParams;
    const initialTemplate = INTERVIEW_TEMPLATES.find((item) => item.id === template)
        ?? INTERVIEW_TEMPLATES.at(-1)!;

    return (
        <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-16">
            <header className="flex flex-col gap-5 lg:sticky lg:top-12">
                <div className="flex size-11 items-center justify-center rounded-md border border-primary-200/30 bg-primary-200/10 text-primary-200">
                    <ClipboardList aria-hidden="true" className="size-5"/>
                </div>
                <div className="space-y-3">
                    <p className="text-sm font-semibold uppercase text-primary-200">创建面试</p>
                    <h1 className="text-3xl font-semibold text-white sm:text-4xl">配置你的面试练习</h1>
                    <p className="max-w-md text-base leading-7 text-light-100">
                        告诉 AI 你的目标岗位和技术方向，由它为本场面试动态规划问题。
                    </p>
                </div>
                <div className="border-l-2 border-primary-200/40 pl-4">
                    <p className="text-sm leading-6 text-light-100">
                        面试记录仅归当前账号所有，进入通话前服务端还会再次核验归属。
                    </p>
                </div>
            </header>

            <div className="rounded-lg border border-white/10 bg-dark-300/70 p-5 shadow-2xl shadow-black/20 sm:p-8">
                <div className="mb-7 border-b border-white/10 pb-5">
                    <h2 className="text-xl font-semibold text-white">面试设置</h2>
                </div>
                <CreateInterviewForm initialType={initialTemplate.type}/>
            </div>
        </section>
    );
};

export default Page;
