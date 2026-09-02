import {handleSessionLifecycle} from "@/lib/ai-realtime/session-lifecycle-handler.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 浏览器收到 SDK 的接通通知后调用这里，把会话改成进行中。
export async function POST(
    request: Request,
    context: RouteContext<"/api/ai-realtime/sessions/[sessionId]/start">,
) {
    const {sessionId} = await context.params;
    return handleSessionLifecycle(request, sessionId, "start");
}
