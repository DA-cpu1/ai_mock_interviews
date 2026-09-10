import {z} from "zod";
import {getCurrentUser} from "@/lib/action/auth.action";
import {finalizeFeedback} from "@/lib/feedback/finalize.server";
import {FeedbackStoreError} from "@/lib/feedback/feedback-store.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 反馈生成包含一次百炼模型调用；避免平台默认短时限在响应前关闭连接。
export const maxDuration = 60;
const idSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const headers = {"Cache-Control": "no-store"};

/** 结束页可以安全重复调用；服务端每次仍重新认证并校验 Session 归属。 */
export async function POST(request: Request, context: {params: Promise<{sessionId: string}>}) {
    const user = await getCurrentUser();
    if (!user) return Response.json({error: {code: "UNAUTHENTICATED", message: "请先登录。"}}, {status: 401, headers});
    const {sessionId} = await context.params;
    if (!idSchema.safeParse(sessionId).success) return Response.json({error: {code: "INVALID_SESSION_ID", message: "会话 ID 不正确。"}}, {status: 400, headers});
    try {
        const result = await finalizeFeedback(sessionId, user.id);
        const status = result.status === "transcript_pending" ? 202 : 200;
        return Response.json(result, {status, headers});
    } catch (error) {
        if (error instanceof FeedbackStoreError) {
            const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 404 : 409;
            return Response.json({error: {code: error.code, message: status === 404 ? "找不到这场面试。" : "反馈正在由其他请求处理。"}}, {status, headers});
        }
        console.error("[feedback] finalize failed", error instanceof Error ? error.name : "UnknownError");
        return Response.json({error: {code: "FINALIZE_FAILED", message: "反馈暂时无法生成，请稍后重试。"}}, {status: 503, headers});
    }
}
