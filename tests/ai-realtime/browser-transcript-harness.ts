import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import ts from "typescript";
import {browserTranscriptSchema} from "../../lib/ai-realtime/browser-transcript-protocol.ts";
import {readAliyunCallbackBody} from "../../lib/aliyun/callback-protocol.ts";
import {isFeedbackId} from "../../lib/feedback/page-policy.ts";

export const executeModule = (path: string, modules: Record<string, unknown>, exported: object, globals: Record<string, unknown> = {}) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    new Script(compiled).runInNewContext({exports: exported, Response, Date, console, ...globals, require: (name: string) => {
        if (!(name in modules)) throw new Error(`Unexpected test import: ${name}`);
        return modules[name];
    }});
};

export const createBrowserTranscriptHarness = (session: Record<string, unknown>, user: {id: string} | null = {id: "owner"}) => {
    const records = new Map<string, Record<string, unknown>>([["interviewSessions/session-1", session]]);
    const ref = (path: string) => ({path, collection: (name: string) => ({doc: (id: string) => ref(`${path}/${name}/${id}`)})});
    const transaction = {
        get: async ({path}: {path: string}) => ({exists: records.has(path), get: (name: string) => records.get(path)?.[name]}),
        create: ({path}: {path: string}, value: Record<string, unknown>) => {
            if (records.has(path)) throw new Error("Duplicate document");
            records.set(path, value);
        },
        update: ({path}: {path: string}, value: Record<string, unknown>) => records.set(path, {...records.get(path), ...value}),
    };
    const db = {collection: (name: string) => ({doc: (id: string) => ref(`${name}/${id}`)}),
        runTransaction: (run: (value: typeof transaction) => Promise<void>) => run(transaction)};
    const store: Record<string, unknown> = {};
    executeModule("../../lib/ai-realtime/browser-transcript-store.server.ts", {
        "server-only": {}, "@/firebase/admin": {db}, "./browser-transcript-protocol": {browserTranscriptSchema},
    }, store);
    const route: {POST?: (request: Request, context: {params: Promise<{sessionId: string}>}) => Promise<Response>} = {};
    executeModule("../../app/api/interviews/[sessionId]/browser-transcript/route.ts", {
        "@/lib/action/auth.action": {getCurrentUser: async () => user},
        "@/lib/aliyun/callback-protocol": {readAliyunCallbackBody},
        "@/lib/ai-realtime/browser-transcript-protocol": {browserTranscriptSchema},
        "@/lib/ai-realtime/browser-transcript-store.server": store,
        "@/lib/feedback/page-policy": {isFeedbackId},
    }, route);
    if (!route.POST) throw new Error("Missing POST");
    const post = route.POST;
    return {records, post: (body: unknown, sessionId = "session-1") => post(new Request("https://example.test/transcript", {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
    }), {params: Promise.resolve({sessionId})})};
};
