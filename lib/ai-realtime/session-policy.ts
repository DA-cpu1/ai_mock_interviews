import type {
    AiRealtimeSessionErrorCode,
    AiRealtimeUserSessionState,
} from "@/types/ai-realtime";

const CREATE_COOLDOWN_MS = 10_000;

// 将可供接口稳定映射的业务错误码保留在 Error 对象上，而不是依赖错误文案。
export class SessionCreationError extends Error {
    readonly code: AiRealtimeSessionErrorCode;
    constructor(code: AiRealtimeSessionErrorCode) {
        super(code);
        this.name = "SessionCreationError";
        this.code = code;
    }
}

// 纯策略函数：不访问 Firestore，也不读取系统时钟，方便用固定时间做确定性测试。
// 没有抛错即表示调用方可以创建会话并写入新的活跃锁。
export const assertSessionCreationAllowed = (
    state: AiRealtimeUserSessionState | undefined,
    nowMs: number,
) => {
    // activeSessionId 存在但租约时间缺失时按“仍有效”处理，避免坏数据绕过互斥锁。
    // 正常租约只有在 leaseExpiresAt <= nowMs 后才允许被后续请求回收。
    const leaseExpiresAt = state?.leaseExpiresAt
        ? Date.parse(state.leaseExpiresAt)
        : Number.POSITIVE_INFINITY;

    // 活跃租约优先于限流返回，让调用方得到更准确的拒绝原因。
    if (state?.activeSessionId && leaseExpiresAt > nowMs) {
        throw new SessionCreationError("ACTIVE_SESSION_EXISTS");
    }

    // 即使旧租约已过期，也要限制连续创建；这能抑制双击、重试风暴和 Token 滥发。
    const lastCreateAt = Date.parse(state?.lastCreateAt ?? "");
    if (Number.isFinite(lastCreateAt) && nowMs - lastCreateAt < CREATE_COOLDOWN_MS) {
        throw new SessionCreationError("RATE_LIMITED");
    }
};
