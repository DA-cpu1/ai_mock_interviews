import assert from "node:assert/strict";
import test from "node:test";

import {parseCreateInterviewInput} from "../../lib/interviews/create-interview-input.ts";

const formDataFor = (overrides: Partial<Record<string, string>> = {}) => {
    const values = {
        role: "前端工程师",
        level: "中级",
        type: "Technical",
        techstack: "React，TypeScript, Next.js",
        ...overrides,
    };
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => formData.set(key, value));
    return formData;
};

test("normalizes the selected interview configuration", () => {
    const result = parseCreateInterviewInput(formDataFor());

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.data.techstack, ["React", "TypeScript", "Next.js"]);
    assert.equal(result.data.type, "Technical");
});

test("rejects unsupported selections and an empty technology list", () => {
    const result = parseCreateInterviewInput(formDataFor({
        level: "不限",
        type: "Casual Chat",
        techstack: "，,",
    }));

    assert.equal(result.success, false);
    if (result.success) return;
    const errors = result.error.flatten().fieldErrors;
    assert.ok(errors.level?.length);
    assert.ok(errors.type?.length);
    assert.ok(errors.techstack?.length);
});
