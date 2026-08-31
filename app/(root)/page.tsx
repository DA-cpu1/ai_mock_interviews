import {Button} from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import InterviewCard from "@/components/InterviewCard";
import {dummyInterviews} from "@/constants";

const Page = () => {
    return (
        <>
            <section className="card-cta">
                <div className="flex flex-col gap-6 max-w-lg">
                    <h2>通过 AI 驱动的练习与反馈，做好面试准备</h2>

                    <p className="text-lg">
                        练习真实面试题，并获得即时反馈
                    </p>

                    <Button asChild className="btn-primary max-sm:w-full">
                        <Link href="/interview">开始面试练习</Link>
                    </Button>
                </div>

                <Image
                    src="/robot.png"
                    alt="机器人"
                    width={400}
                    height={400}
                    className="max-sm:hidden"
                />
            </section>


            <section className="flex flex-col gap-6 mt-8">
                <h2>你的面试</h2>

                <div className="interviews-section">
                    {dummyInterviews.map((interview) => (
                        <InterviewCard key={interview.id} {...interview} />
                    ))}
                </div>
            </section>

            <section className="flex flex-col gap-6 mt-8">
                <h2>开始面试</h2>
                <div className="interviews-section">
                    {dummyInterviews.map((interview) => (
                        <InterviewCard key={interview.id} {...interview} />
                    ))}
                </div>

                {/*<p>当前没有可用的面试</p>*/}
            </section>
        </>
    );
}
export default Page
