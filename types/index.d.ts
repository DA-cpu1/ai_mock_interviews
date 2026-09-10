interface Interview {
    id: string;
    role: string;
    level: string;
    questions?: string[];
    questionMode?: "ai-generated" | "predefined";
    techstack: string[];
    createdAt: string;
    userId: string;
    type: string;
    finalized: boolean;
}

interface User {
    name: string;
    email: string;
    id: string;
}

interface InterviewCardProps {
    interviewId: string;
    role: string;
    type: string;
    techstack: string[];
    createdAt: string;
    feedbackSummary?: import("@/lib/interviews/interview-store.server").InterviewFeedbackSummary;
}

interface AgentProps {
    userName: string;
    userId?: string;
    interviewId?: string;
    feedbackId?: string;
    type: "generate" | "interview";
    questions?: string[];
}

interface RouteParams {
    params: Promise<Record<string, string>>;
    searchParams: Promise<Record<string, string>>;
}

interface GetLatestInterviewsParams {
    userId: string;
    limit?: number;
}

interface SignInParams {
    idToken: string;
}

interface SignUpParams {
    uid: string;
    name: string;
    email: string;
    password: string;
}

type FormType = "sign-in" | "sign-up";

interface InterviewFormProps {
    interviewId: string;
    role: string;
    level: string;
    type: string;
    techstack: string[];
    amount: number;
}

interface TechIconProps {
    techStack: string[];
}
