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

export type AiRealtimeSessionStatus =
    | "created"
    | "active"
    | "completed"
    | "failed";

export type AiRealtimeSessionErrorCode =
    | "INVALID_REQUEST"
    | "UNAUTHENTICATED"
    | "INTERVIEW_NOT_FOUND"
    | "REALTIME_DISABLED"
    | "SERVER_CONFIG_INVALID"
    | "RATE_LIMITED"
    | "ACTIVE_SESSION_EXISTS"
    | "SESSION_NOT_FOUND"
    | "SESSION_EXPIRED"
    | "INVALID_SESSION_STATE"
    | "SESSION_CREATE_FAILED";

export interface AiRealtimeSessionRequest {
    interviewId: string;
}

export interface AiRealtimeSessionRecord {
    id: string;
    interviewId: string;
    userId: string;
    rtcUserId: string;
    channelId: string;
    agentId: string;
    region: string;
    status: AiRealtimeSessionStatus;
    conversationMode: "semantic";
    modelConfigVersion: string;
    tokenExpiresAt: string;
    leaseExpiresAt: string;
    createdAt: string;
    startedAt?: string;
    endedAt?: string;
    errorCode?: string;
}

export interface AiRealtimeUserSessionState {
    userId: string;
    activeSessionId: string | null;
    leaseExpiresAt: string | null;
    lastCreateAt: string;
}

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
