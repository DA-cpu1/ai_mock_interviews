import {Button} from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import InterviewCard from "@/components/InterviewCard";
import InterviewTemplateCard from "@/components/InterviewTemplateCard";
import {INTERVIEW_TEMPLATES} from "@/constants/interviews";
import {getCurrentUser} from "@/lib/action/auth.action";
import {listUserInterviews} from "@/lib/interviews/interview-store.server";

const Page = async () => {
    const currentUser = await getCurrentUser();
    const savedInterviews = currentUser
        ? await listUserInterviews(currentUser.id)
        : [];

    return (
        <>
            <section className="card-cta">
                <div className="flex flex-col gap-6 max-w-lg">
                    <h2>通过 AI 驱动的练习与反馈，做好面试准备</h2>

                    <p className="text-lg">
                        练习真实面试题，并获得即时反馈
                    </p>

                    <Button asChild className="btn-primary max-sm:w-full">
                        <Link href="/interview?template=mixed">开始面试练习</Link>
                    </Button>
                </div>

                <Image
                    src="/robot.png"
                    alt="机器人"
                    width={400}
                    height={400}
                    loading="eager"
                    className="max-sm:hidden"
                />
            </section>


            <section className="flex flex-col gap-6 mt-8" aria-labelledby="templates-heading">
                <div className="space-y-2">
                    <h2 id="templates-heading">开始面试</h2>
                    <p>先选择练习方向，再填写目标岗位和技术栈。</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {INTERVIEW_TEMPLATES.map((template) => (
                        <InterviewTemplateCard key={template.id} template={template}/>
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-6 mt-8" aria-labelledby="saved-heading">
                <div className="space-y-2">
                    <h2 id="saved-heading">你的面试</h2>
                    <p>已保存的岗位配置可以随时继续练习。</p>
                </div>
                {savedInterviews.length > 0 ? (
                    <div className="interviews-section">
                        {savedInterviews.map((interview) => (
                            <InterviewCard
                                key={interview.id}
                                interviewId={interview.id}
                                role={interview.role}
                                type={interview.type}
                                techstack={[...interview.techstack]}
                                createdAt={interview.createdAt}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex min-h-36 flex-col items-start justify-center gap-4 rounded-lg border border-dashed border-white/15 px-6 py-5">
                        <p>还没有已保存的面试。</p>
                        <Button asChild className="btn-secondary">
                            <Link href="/interview?template=mixed">创建第一场面试</Link>
                        </Button>
                    </div>
                )}
            </section>
        </>
    );
}
export default Page
