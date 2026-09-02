import {notFound} from "next/navigation";

import AliyunInterviewClient from "@/components/interview/AliyunInterviewClient";
import {db} from "@/firebase/admin";
import {getCurrentUser} from "@/lib/action/auth.action";

const interviewIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

const Page = async (props: PageProps<"/interview/[interviewId]">) => {
    const [{interviewId}, currentUser] = await Promise.all([
        props.params,
        getCurrentUser(),
    ]);

    if (!currentUser || !interviewIdPattern.test(interviewId)) notFound();

    // 页面只确认面试存在且属于当前用户，具体通话仍由浏览器组件负责。
    const interview = await db.collection("interviews").doc(interviewId).get();
    if (!interview.exists || interview.get("userId") !== currentUser.id) notFound();

    return <AliyunInterviewClient
        userName={currentUser.name || "Candidate"}
        interviewId={interviewId}
        variant="interview"
    />;
};

export default Page;
