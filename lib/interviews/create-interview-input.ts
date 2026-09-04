import {z} from "zod";

import {INTERVIEW_LEVELS, INTERVIEW_TYPES} from "../../constants/interviews.ts";

const splitValues = (value: string) => value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const createInterviewInputSchema = z.object({
    role: z.string().trim()
        .min(2, "岗位至少需要 2 个字符。")
        .max(80, "岗位不能超过 80 个字符。"),
    level: z.enum(INTERVIEW_LEVELS, {
        errorMap: () => ({message: "请选择有效的岗位级别。"}),
    }),
    type: z.enum(INTERVIEW_TYPES, {
        errorMap: () => ({message: "请选择有效的面试类型。"}),
    }),
    techstack: z.string().trim()
        .min(1, "请至少填写一项技术栈。")
        .max(500, "技术栈内容过长。")
        .transform(splitValues)
        .pipe(z.array(z.string().max(40, "每项技术栈不能超过 40 个字符。"))
            .min(1, "请至少填写一项技术栈。")
            .max(12, "技术栈最多填写 12 项。")),
}).strict();

export type CreateInterviewInput = z.infer<typeof createInterviewInputSchema>;

export const parseCreateInterviewInput = (formData: FormData) =>
    createInterviewInputSchema.safeParse({
        role: formData.get("role"),
        level: formData.get("level"),
        type: formData.get("type"),
        techstack: formData.get("techstack"),
    });
