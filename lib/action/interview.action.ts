"use server";

import {db} from "@/firebase/admin";
import {getCurrentUser} from "@/lib/action/auth.action";
import {parseCreateInterviewInput} from "@/lib/interviews/create-interview-input";

type InterviewField = "role" | "level" | "type" | "techstack";

export interface CreateInterviewActionState {
    message: string;
    interviewId?: string;
    fieldErrors?: Partial<Record<InterviewField, string[] | undefined>>;
}

export async function createInterview(
    _previousState: CreateInterviewActionState,
    formData: FormData,
): Promise<CreateInterviewActionState> {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        return {message: "登录状态已失效，请重新登录后再创建面试。"};
    }

    const result = parseCreateInterviewInput(formData);

    if (!result.success) {
        return {
            message: "请检查标出的内容后再提交。",
            fieldErrors: result.error.flatten().fieldErrors,
        };
    }

    const interviewRef = db.collection("interviews").doc();

    try {
        await interviewRef.create({
            ...result.data,
            userId: currentUser.id,
            questionMode: "ai-generated",
            finalized: true,
            createdAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error(
            "[interviews] failed to create interview",
            error instanceof Error ? error.name : "UnknownError",
        );
        return {message: "创建面试失败，请稍后重试。"};
    }

    return {message: "", interviewId: interviewRef.id};
}
