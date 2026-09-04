import assert from "node:assert/strict";
import test from "node:test";

import {buildInterviewAgentPrompt} from "../../lib/ai-realtime/interview-prompt.ts";

test("builds a job-specific prompt that asks the model to plan questions", () => {
    const prompt = buildInterviewAgentPrompt({
        role: "高级前端工程师",
        level: "高级",
        type: "Technical",
        techstack: ["React", "TypeScript", "Next.js"],
    });

    assert.match(prompt.agentGreeting, /高级前端工程师.*技术深挖/);
    assert.match(prompt.llmSystemPrompt, /React、TypeScript、Next\.js/);
    assert.match(prompt.llmSystemPrompt, /自行规划 5 道/);
    assert.match(prompt.llmSystemPrompt, /每题最多追问一次/);
    assert.match(prompt.llmSystemPrompt, /\[INTERVIEW_COMPLETE\]/);
});

test("changes the interview plan with the selected template", () => {
    const prompt = buildInterviewAgentPrompt({
        role: "产品经理",
        level: "中级",
        type: "Behavioral",
        techstack: ["数据分析"],
    });

    assert.match(prompt.llmSystemPrompt, /行为面试/);
    assert.match(prompt.llmSystemPrompt, /团队协作/);
    assert.doesNotMatch(prompt.llmSystemPrompt, /React Server Component/);
});
