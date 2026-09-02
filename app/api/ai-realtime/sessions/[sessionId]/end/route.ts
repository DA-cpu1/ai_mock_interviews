import {handleSessionLifecycle} from "@/lib/ai-realtime/session-lifecycle-handler.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 通话结束或页面清理时调用这里，重复调用也不会重复创建数据。
export async function POST(
    request: Request,
    context: RouteContext<"/api/ai-realtime/sessions/[sessionId]/end">,
) {
    const {sessionId} = await context.params;
    return handleSessionLifecycle(request, sessionId, "end");
}
