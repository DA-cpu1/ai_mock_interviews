import "server-only";
import {db} from "@/firebase/admin";
import {readTranscriptForFeedback} from "@/lib/ai-realtime/transcript-store.server";
import {selectFeedbackTranscript} from "./select-transcript";

export const readFeedbackTranscript = async (sessionId: string, userId: string, options: {now?: Date}) => {
    const result = await readTranscriptForFeedback(sessionId, options);
    if (!result || result.session.userId !== userId) return null;
    const completed = result.session.status === "completed" && result.session.endOutcome !== "failed";
    let browserSnapshot: unknown;
    if (completed && !result.hasCallbackAnswer && result.readiness.status !== "failed") {
        const doc = await db.collection("interviewSessions").doc(sessionId).collection("browserTranscript").doc("final").get();
        if (doc.exists && doc.get("source") === "browser_subtitles") browserSnapshot = doc.get("snapshot");
    }
    return {...result, readiness: selectFeedbackTranscript({
        callback: result.readiness, callbackHasAnswer: result.hasCallbackAnswer, completed, browserSnapshot,
    })};
};
