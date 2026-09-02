import {getCurrentUser} from "@/lib/action/auth.action";
import AliyunInterviewClient from "@/components/interview/AliyunInterviewClient";

const Page = async (props: PageProps<"/interview/aliyun-test">) => {
    const [currentUser, searchParams] = await Promise.all([
        getCurrentUser(),
        props.searchParams,
    ]);
    const interviewId = typeof searchParams.interviewId === "string"
        ? searchParams.interviewId
        : undefined;

    return <AliyunInterviewClient
        userName={currentUser?.name || "Candidate"}
        interviewId={interviewId}
        variant="test"
    />;
};

export default Page;
