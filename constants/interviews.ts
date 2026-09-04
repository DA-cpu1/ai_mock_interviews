export const INTERVIEW_LEVELS = ["初级", "中级", "高级", "专家"] as const;

export const INTERVIEW_TEMPLATES = [
    {
        id: "technical",
        type: "Technical",
        title: "技术深挖",
        description: "围绕技术原理、工程实践和问题排查逐层追问。",
        focus: "技术原理、编码实践、故障定位与技术取舍",
        questionCount: 5,
    },
    {
        id: "system-design",
        type: "System Design",
        title: "系统设计",
        description: "练习需求澄清、架构拆解、容量估算与权衡。",
        focus: "需求澄清、架构设计、可扩展性、可靠性与技术权衡",
        questionCount: 4,
    },
    {
        id: "behavioral",
        type: "Behavioral",
        title: "行为面试",
        description: "用真实经历练习协作、冲突处理和结果复盘。",
        focus: "项目经历、团队协作、冲突处理、主动性与复盘能力",
        questionCount: 5,
    },
    {
        id: "mixed",
        type: "Mixed",
        title: "综合面试",
        description: "结合技术、项目经历和岗位胜任力进行模拟。",
        focus: "技术能力、项目经验、问题解决与岗位胜任力",
        questionCount: 6,
    },
] as const;

export const INTERVIEW_TYPES = INTERVIEW_TEMPLATES.map((template) => template.type) as [
    "Technical", "System Design", "Behavioral", "Mixed",
];

export type InterviewType = typeof INTERVIEW_TYPES[number];
export type InterviewTemplate = typeof INTERVIEW_TEMPLATES[number];
