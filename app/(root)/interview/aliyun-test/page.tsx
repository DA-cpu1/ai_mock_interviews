import {getCurrentUser} from "@/lib/action/auth.action";
import AliyunInterviewClient from "@/components/interview/AliyunInterviewClient";

const Page = async () => {
    const currentUser = await getCurrentUser();

    return <AliyunInterviewClient userName={currentUser?.name || "Candidate"} variant="test" />;
};

export default Page;

