// 浏览器端一次实时通话的生命周期状态，用于驱动状态文案、按钮和加载效果。
export type AiRealtimeCallStatus =
    // 尚未发起通话。
    | "idle"
    // 正在向用户申请麦克风权限。
    | "requesting_permission"
    // 正在向服务端申请短期 RTC Token。
    | "issuing_token"
    // 已取得连接信息，正在连接 RTC 通话。
    | "connecting"
    // RTC 已接通，可以正常进行语音交互。
    | "active"
    // 正在挂断并释放 SDK 资源。
    | "ending"
    // 通话已正常结束。
    | "ended"
    // 启动或通话过程中发生错误。
    | "error";

// AI 智能体在通话中的工作状态，与整场通话的连接状态相互独立。
export type AiRealtimeAgentState = "idle" | "listening" | "thinking" | "speaking";

// 字幕发言者：user 表示候选人，assistant 表示 AI 面试官。
export type AiRealtimeSubtitleRole = "user" | "assistant";

// 服务端会话记录的生命周期状态。
export type AiRealtimeSessionStatus =
    // 会话已创建，但尚未确认接通。
    | "created"
    // 会话正在进行。
    | "active"
    // 会话已正常完成。
    | "completed"
    // 会话因异常而失败。
    | "failed";

// 创建或操作实时会话时，服务端可能返回的业务错误码。
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

// 创建实时会话时由客户端提交的业务参数。
export interface AiRealtimeSessionRequest {
    // 本次实时会话所属的面试记录 ID。
    interviewId: string;
}

// 一次实时面试会话在服务端持久化时使用的完整数据结构。
export interface AiRealtimeSessionRecord {
    // 会话记录 ID。
    id: string;
    // 关联的面试记录 ID。
    interviewId: string;
    // 系统中的登录用户 ID。
    userId: string;
    // 提供给 RTC 服务使用的匿名用户 ID。
    rtcUserId: string;
    // 本次 RTC 通话使用的频道 ID。
    channelId: string;
    // 阿里云 AI 智能体 ID。
    agentId: string;
    // 阿里云实时互动服务所在区域。
    region: string;
    // 当前会话的服务端生命周期状态。
    status: AiRealtimeSessionStatus;
    // 固定使用语义对话模式。
    conversationMode: "semantic";
    // 本次会话使用的模型配置版本，便于追踪和复现。
    modelConfigVersion: string;
    // RTC Token 的过期时间。
    tokenExpiresAt: string;
    // 会话占用租约的过期时间，用于处理异常退出后的占用释放。
    leaseExpiresAt: string;
    // 会话记录的创建时间。
    createdAt: string;
    // 会话实际开始时间，未开始时不存在。
    startedAt?: string;
    // 会话结束时间，未结束时不存在。
    endedAt?: string;
    // 会话失败时记录的错误码。
    errorCode?: string;
}

// 用户维度的实时会话占用状态，用于限制同一用户重复创建活动会话。
export interface AiRealtimeUserSessionState {
    // 系统中的登录用户 ID。
    userId: string;
    // 当前活动会话 ID；没有活动会话时为 null。
    activeSessionId: string | null;
    // 当前活动会话租约的过期时间；没有活动会话时为 null。
    leaseExpiresAt: string | null;
    // 用户最近一次创建会话的时间，可用于频率限制。
    lastCreateAt: string;
}

// 页面展示的一条实时字幕；同一句话可根据 sentenceId 被流式更新。
export interface AiRealtimeSubtitle {
    // 字幕在页面中的唯一标识。
    id: string;
    // 字幕对应的发言者。
    role: AiRealtimeSubtitleRole;
    // 当前字幕文本。
    text: string;
    // SDK 提供的句子编号，用于识别同一句话的多次更新。
    sentenceId: number;
    // 是否已经收到这句话的最终稳定结果。
    end: boolean;
    // 字幕最后一次更新的毫秒时间戳。
    updatedAt: number;
}

// 服务端下发给 AICallKit 的智能体行为配置。
export interface AiRealtimeAgentConfig {
    // 智能体允许的最长空闲或会话时间，当前按秒传递。
    agentMaxIdleTime: number;
    // 是否启用智能语音分段，以判断一句话何时结束。
    enableIntelligentSegment: boolean;
    // 是否允许智能体在结束通话前完成平滑收尾。
    agentGracefulShutdown: boolean;
}

// 服务端创建会话后返回给浏览器的 RTC 连接信息。
export interface AiRealtimeSessionResponse {
    // 本次业务会话的唯一 ID。
    sessionId: string;
    // 浏览器加入 RTC 时使用的匿名用户 ID。
    userId: string;
    // 要连接的阿里云 AI 智能体 ID。
    agentId: string;
    // 阿里云实时互动服务所在区域。
    region: string;
    // 浏览器加入 RTC 频道所需的短期 Token。
    userJoinToken: string;
    // 短期 Token 的过期时间。
    expiresAt: string;
    // 本次通话使用的智能体行为配置。
    agentConfig: AiRealtimeAgentConfig;
}
