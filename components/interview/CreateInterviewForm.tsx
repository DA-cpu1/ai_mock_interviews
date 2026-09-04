"use client";

import {ArrowRight, LoaderCircle} from "lucide-react";
import {useActionState, useEffect} from "react";

import {Button} from "@/components/ui/button";
import {
    INTERVIEW_LEVELS,
    INTERVIEW_TEMPLATES,
    type InterviewType,
} from "@/constants/interviews";
import {
    createInterview,
    type CreateInterviewActionState,
} from "@/lib/action/interview.action";

const initialState: CreateInterviewActionState = {message: ""};
const controlClass = "min-h-12 w-full rounded-md border border-white/15 bg-dark-200 px-4 text-base text-white outline-none transition focus:border-primary-200 focus:ring-2 focus:ring-primary-200/20 disabled:cursor-wait disabled:opacity-60 placeholder:text-light-400";

const FieldError = ({id, messages}: {id: string; messages?: string[]}) => messages?.[0] ? (
    <p id={id} className="text-sm text-destructive-100">{messages[0]}</p>
) : null;

const CreateInterviewForm = ({initialType}: {initialType: InterviewType}) => {
    const [state, formAction, pending] = useActionState(createInterview, initialState);
    const errors = state.fieldErrors;
    const isNavigating = Boolean(state.interviewId);

    useEffect(() => {
        if (state.interviewId) {
            // Full navigation avoids reusing the Server Action's stale Turbopack Flight chunks.
            const interviewUrl = new URL(
                `/interview/${encodeURIComponent(state.interviewId)}`,
                window.location.origin,
            );
            window.location.assign(interviewUrl);
        }
    }, [state.interviewId]);

    return (
        <form action={formAction} className="space-y-6" noValidate>
            <fieldset disabled={pending || isNavigating} className="space-y-6">
                <div className="space-y-3">
                    <span id="type-label" className="text-sm font-medium text-light-100">面试类型</span>
                    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="type-label">
                        {INTERVIEW_TEMPLATES.map((template) => (
                            <label key={template.id} className="cursor-pointer">
                                <input
                                    className="peer sr-only" type="radio" name="type"
                                    value={template.type} defaultChecked={template.type === initialType}
                                    aria-describedby={errors?.type ? "type-error" : undefined}
                                />
                                <span className="flex min-h-24 flex-col gap-2 rounded-md border border-white/10 bg-dark-200 p-4 transition hover:border-white/25 peer-checked:border-primary-200 peer-checked:bg-primary-200/10 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-200">
                                    <strong className="text-sm text-white">{template.title}</strong>
                                    <span className="text-sm leading-5 text-light-100">{template.description}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <FieldError id="type-error" messages={errors?.type}/>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                        <label htmlFor="role" className="text-sm font-medium text-light-100">目标岗位</label>
                        <input
                            id="role" name="role" required maxLength={80}
                            placeholder="例如：前端工程师" autoComplete="organization-title"
                            className={controlClass} aria-invalid={Boolean(errors?.role)}
                            aria-describedby={errors?.role ? "role-error" : undefined}
                        />
                        <FieldError id="role-error" messages={errors?.role}/>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="level" className="text-sm font-medium text-light-100">岗位级别</label>
                        <select
                            id="level" name="level" required defaultValue=""
                            className={controlClass} aria-invalid={Boolean(errors?.level)}
                            aria-describedby={errors?.level ? "level-error" : undefined}
                        >
                            <option value="" disabled>选择级别</option>
                            {INTERVIEW_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                        </select>
                        <FieldError id="level-error" messages={errors?.level}/>
                    </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="techstack" className="text-sm font-medium text-light-100">技术栈</label>
                    <input
                        id="techstack" name="techstack" required maxLength={500}
                        placeholder="React, TypeScript, Next.js" autoComplete="off"
                        className={controlClass} aria-invalid={Boolean(errors?.techstack)}
                        aria-describedby={errors?.techstack ? "techstack-error" : undefined}
                    />
                    <FieldError id="techstack-error" messages={errors?.techstack}/>
                </div>

                {state.message ? (
                    <p role="status" aria-live="polite" className="text-sm text-destructive-100">
                        {state.message}
                    </p>
                ) : null}

                <Button type="submit" className="btn-primary w-full min-h-12">
                    {pending || isNavigating ? <LoaderCircle className="animate-spin"/> : <ArrowRight/>}
                    {pending ? "正在创建面试" : isNavigating ? "正在进入面试" : "创建并开始面试"}
                </Button>
            </fieldset>
        </form>
    );
};

export default CreateInterviewForm;
