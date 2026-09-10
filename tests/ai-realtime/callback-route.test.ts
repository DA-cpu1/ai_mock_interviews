import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as protocol from "../../lib/aliyun/callback-protocol.ts";
import {AliyunCallbackConfigError} from "../../lib/aliyun/callback-config.server.ts";

const token = "fixture-callback-token-at-least-32-characters";
const payload = {
    aiAgentId: "agent-fixture", instanceId: "instance-fixture",
    event: "agent_start", code: 1001, message: "Agent start event",
    userData: JSON.stringify({sessionId: "session-fixture", source: "interview"}),
    timestamp: "2026-09-08T10:30:52.824212+00:00",
};
const source = readFileSync(new URL("../../app/api/ai-realtime/callback/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;

// 执行真实 Route Handler；只替换 Next 调度器和数据库边界，绝不接触云端。
const loadRoute = (persist: () => Promise<unknown>) => {
    const tasks: Array<() => Promise<void>> = [];
    const logs: unknown[][] = [];
    const exported: {POST?: (request: Request) => Promise<Response>} = {};
    const modules: Record<string, unknown> = {
        "next/server": {after: (task: () => Promise<void>) => tasks.push(task)},
        "@/lib/aliyun/callback-protocol": protocol,
        "@/lib/aliyun/callback-config.server": {
            AliyunCallbackConfigError, getAliyunCallbackConfig: () => ({enabled: true, token}),
        },
        "@/lib/ai-realtime/callback-handler.server": {
            handleAliyunCallback: persist,
            CallbackHandlerError: class extends Error {},
            CallbackPersistenceError: class extends Error {},
        },
    };
    new Script(compiled).runInNewContext({
        exports: exported, Response, Date,
        console: {info: (...items: unknown[]) => logs.push(items), error: (...items: unknown[]) => logs.push(items)},
        require: (name: string) => {
            if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
            return modules[name];
        },
    });
    if (!exported.POST) throw new Error("Missing POST handler");
    return {post: exported.POST, tasks, logs};
};
const request = (body: unknown = payload, authorization = token) => new Request("https://example.test/callback", {
    method: "POST", headers: {"Content-Type": "application/json", authorization}, body: JSON.stringify(body),
});

test("acknowledges before persistence starts and keeps the scheduled task awaiting completion", {timeout: 2_000}, async () => {
    let started = false;
    let release = () => {};
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const route = loadRoute(async () => { started = true; await pending; return {insertedMessages: 0, duplicateMessages: 0}; });
    const response = await route.post(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(started, false);
    assert.equal(route.tasks.length, 1);
    let completed = false;
    const work = route.tasks[0]().then(() => { completed = true; });
    await Promise.resolve();
    assert.equal(started, true);
    assert.equal(completed, false);
    release();
    await work;
    assert.equal(completed, true);
    assert.ok(JSON.stringify(route.logs).includes("callback persisted"));
});

test("rejects unauthorized or malformed callbacks without scheduling persistence", async () => {
    const route = loadRoute(async () => { throw new Error("must not run"); });
    assert.equal((await route.post(request(payload, "wrong-token"))).status, 401);
    assert.equal((await route.post(request({}))).status, 400);
    assert.equal(route.tasks.length, 0);
});

test("records a sanitized post-response failure instead of leaking credentials", async () => {
    const route = loadRoute(async () => { throw new Error("credential-bearing-provider-error"); });
    assert.equal((await route.post(request())).status, 200);
    await route.tasks[0]();
    const logs = JSON.stringify(route.logs);
    assert.ok(logs.includes("CALLBACK_PERSISTENCE_FAILED"));
    assert.ok(logs.includes("session-fixture"));
    assert.ok(!logs.includes("credential-bearing-provider-error"));
    assert.ok(!logs.includes(token));
});
