export type AiRealtimeCallStatus =
    | "idle"
    | "requesting_permission"
    | "issuing_token"
    | "connecting"
    | "active"
    | "ending"
    | "ended"
    | "error";

export type AiRealtimeAgentState = "idle" | "listening" | "thinking" | "speaking";

export type AiRealtimeSubtitleRole = "user" | "assistant";

export interface AiRealtimeSubtitle {
    id: string;
    role: AiRealtimeSubtitleRole;
    text: string;
    sentenceId: number;
    end: boolean;
    updatedAt: number;
}

export interface AiRealtimeAgentConfig {
    agentMaxIdleTime: number;
    enableIntelligentSegment: boolean;
    agentGracefulShutdown: boolean;
}

export interface AiRealtimeSessionResponse {
    sessionId: string;
    userId: string;
    agentId: string;
    region: string;
    userJoinToken: string;
    expiresAt: string;
    agentConfig: AiRealtimeAgentConfig;
}

