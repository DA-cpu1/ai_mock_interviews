import dayjs from "dayjs";
import Image from "next/image";
import Link from "next/link";

import {Button} from "@/components/ui/button";
import DisplayTechIcons from "@/components/DisplayTechIcons";
import {INTERVIEW_TEMPLATES} from "@/constants/interviews";
import {getInterviewCover} from "@/lib/utils";
import type {FeedbackRecord} from "@/types/feedback";

const InterviewCard = ({
                           interviewId,
                           role,
                           type,
                           techstack,
                           createdAt,
                       }: InterviewCardProps) => {
    const feedback = null as FeedbackRecord | null;

    const normalizedType = INTERVIEW_TEMPLATES.find((template) => template.type === type)?.title
        ?? type;

    const formattedDate = dayjs(feedback?.createdAt || createdAt).format("MMM D, YYYY");

    return (
        <div className="card-border w-[360px] max-sm:w-full min-h-96">
            <div className="card-interview">
                <div>
                    <div className="absolute top-0 right-0 w-fit px-4 py-2 rounded-bl-lg bg-light-600">
                        <p className="badge-text">{normalizedType}</p>
                    </div>

                    <Image
                        src={getInterviewCover(interviewId)}
                        alt="cover image"
                        width={90}
                        height={90}
                        className="rounded-full object-fit size-[90px]"
                    />
                </div>

                <h3 className="mt-5 capitalize">
                    {role}面试
                </h3>

                <div className="flex flex-row gap-5 mt-3">
                    <div className="flex flex-row gap-2">
                        <Image
                            src="/calendar.svg"
                            alt="calendar"
                            width={22}
                            height={22}
                        />
                        <p>{formattedDate}</p>
                    </div>

                    <div className="flex flex-row gap-2 items-center">
                        <Image
                            src="/star.svg"
                            alt="star"
                            width={22}
                            height={22}
                        />
                        <p>{feedback?.totalScore || "---"}/100</p>
                    </div>

                </div>

                <p className="line-clamp-2 mt-5">
                    {feedback?.finalAssessment ||
                        "你还没有参加面试。现在开始面试，提升你的技能。"}
                </p>

                <div className="flex flex-row justify-between">
                    <DisplayTechIcons techStack={techstack}/>

                    <Button asChild className="btn-primary">
                        <Link
                            href={
                                feedback
                                    ? `/interview/${interviewId}/feedback`
                                    : `/interview/${interviewId}`
                            }
                        >
                            {feedback ? "查看反馈" : "进入面试"}
                        </Link>
                    </Button>
                </div>

            </div>
        </div>
    );
};

export default InterviewCard;

