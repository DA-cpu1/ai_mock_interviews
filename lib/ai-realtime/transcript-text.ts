const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const COMPLETION_MARKER = /\[INTERVIEW_COMPLETE\]/giu;

export const normalizeTranscriptText = (text: string): string | null => {
    const normalized = text.normalize("NFC")
        .replace(COMPLETION_MARKER, " ").replace(CONTROL_CHARACTERS, "")
        .replace(/\s+/gu, " ").trim();
    return normalized.length > 0 ? normalized : null;
};
