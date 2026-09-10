import "server-only";
import {db} from "@/firebase/admin";
import {browserTranscriptSchema, type BrowserTranscriptSnapshot} from "./browser-transcript-protocol";

export class BrowserTranscriptStoreError extends Error {
    constructor(readonly code: "NOT_FOUND" | "INVALID_STATE" | "INVALID_TRANSCRIPT") { super(code); }
}

export const saveBrowserTranscript = async (sessionId: string, userId: string, input: BrowserTranscriptSnapshot) => {
    const parsed = browserTranscriptSchema.safeParse(input);
    if (!parsed.success || !parsed.data.messages.some((item) => item.role === "user")) throw new BrowserTranscriptStoreError("INVALID_TRANSCRIPT");
    const sessionRef = db.collection("interviewSessions").doc(sessionId);
    const snapshotRef = sessionRef.collection("browserTranscript").doc("final");
    return db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        if (!session.exists || session.get("userId") !== userId) throw new BrowserTranscriptStoreError("NOT_FOUND");
        if (session.get("status") !== "completed" || session.get("endOutcome") === "failed") {
            throw new BrowserTranscriptStoreError("INVALID_STATE");
        }
        const existing = await transaction.get(snapshotRef);
        // 每场只收一份最终快照，重试不能覆盖已用于反馈的证据。
        if (existing.exists || session.get("feedbackId") || session.get("feedbackStatus") === "generating") return;
        transaction.create(snapshotRef, {
            source: "browser_subtitles", snapshot: parsed.data, savedAt: new Date().toISOString(),
        });
        if (parsed.data.messages.some((item) => item.role === "user") && session.get("transcriptStatus") === "insufficient") {
            transaction.update(sessionRef, {transcriptStatus: "pending"});
        }
    });
};
