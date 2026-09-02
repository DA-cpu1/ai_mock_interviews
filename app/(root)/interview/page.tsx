import Link from "next/link";

import {Button} from "@/components/ui/button";

const Page = () => (
    <section className="card-cta min-h-64">
        <div className="flex max-w-xl flex-col gap-5">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-200">
                面试准备
            </p>
            <h1>请先选择一场已保存的面试</h1>
            <p className="text-lg text-light-100">
                系统会读取对应的岗位和题目，并确认这场面试属于你，然后才会开始语音通话。
            </p>
            <Button asChild className="btn-primary">
                <Link href="/">返回面试列表</Link>
            </Button>
        </div>
    </section>
);

export default Page;
