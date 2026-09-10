import {getCurrentUser} from "@/lib/action/auth.action";
import {readAliyunCallbackBody} from "@/lib/aliyun/callback-protocol";
import {browserTranscriptSchema} from "@/lib/ai-realtime/browser-transcript-protocol";
import {BrowserTranscriptStoreError, saveBrowserTranscript} from "@/lib/ai-realtime/browser-transcript-store.server";
import {isFeedbackId} from "@/lib/feedback/page-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {"Cache-Control": "no-store"};
const fail = (status: number, code: string) => Response.json({error: {code, message: "回答记录暂未保存，请重试。"}}, {status, headers});

export async function POST(request: Request, context: {params: Promise<{sessionId: string}>}) {
    const user = await getCurrentUser();
    if (!user) return fail(401, "UNAUTHENTICATED");
    const {sessionId} = await context.params;
    if (!isFeedbackId(sessionId)) return fail(400, "INVALID_SESSION_ID");
    // 复用现有流式 JSON 读取器，限制实际请求体为 256 KiB。
    const body = await readAliyunCallbackBody(request);
    if (body.kind !== "ok") return fail(body.kind === "too_large" ? 413 : 400, "INVALID_TRANSCRIPT_BODY");
    const parsed = browserTranscriptSchema.safeParse(body.body);
    if (!parsed.success || !parsed.data.messages.some((item) => item.role === "user")) return fail(400, "INVALID_TRANSCRIPT");
    try {
        await saveBrowserTranscript(sessionId, user.id, parsed.data);
        return Response.json({success: true}, {headers});
    } catch (error) {
        if (error instanceof BrowserTranscriptStoreError) {
            return fail(error.code === "NOT_FOUND" ? 404 : 409, error.code);
        }
        console.error("[feedback] browser transcript save failed", error instanceof Error ? error.name : "UnknownError");
        return fail(503, "TRANSCRIPT_SAVE_FAILED");
    }
}
