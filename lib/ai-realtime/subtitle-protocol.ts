import type {
    AiRealtimeSubtitle,
    AiRealtimeSubtitleRole,
} from "@/types/ai-realtime";

// 智能体通过字幕发送的结束控制标记不会展示给用户。
const INTERVIEW_COMPLETE_MARKER = "[INTERVIEW_COMPLETE]";
// 字幕长期停留在页面中，因此在协议层统一限制数量。
const MAX_SUBTITLE_MESSAGES = 50;

// AICallKit 单次推送的字幕数据；这里只保留协议处理所需字段。
export interface SubtitleUpdate {
    text: string;
    // 同一角色的相同 sentenceId 表示同一句流式字幕。
    sentenceId: number;
    // true 表示 SDK 已给出这句话的稳定结果。
    end: boolean;
}

// 可见字幕与控制信号分开返回，避免控制标记进入页面文本。
export interface ParsedSubtitleUpdate {
    message: AiRealtimeSubtitle;
    interviewComplete: boolean;
}

// 将一次 SDK 字幕转换为确定性的页面消息；时间由调用方传入，便于测试。
export const parseSubtitleUpdate = (
    role: AiRealtimeSubtitleRole,
    update: SubtitleUpdate,
    updatedAt: number,
): ParsedSubtitleUpdate => {
    const text = update.text.split(INTERVIEW_COMPLETE_MARKER).join("").trim();

    return {
        message: {
            id: `${role}:${update.sentenceId}`,
            role,
            text,
            sentenceId: update.sentenceId,
            end: update.end,
            updatedAt,
        },
        // 用户字幕和 AI 的流式片段即使含有标记，也不能结束面试。
        interviewComplete: role === "assistant"
            && update.end
            && update.text.includes(INTERVIEW_COMPLETE_MARKER),
    };
};

// 不修改原数组：追加新句或在原位置更新同一句，并始终保留最新 50 条。
export const mergeSubtitleMessage = (
    current: readonly AiRealtimeSubtitle[],
    message: AiRealtimeSubtitle,
): AiRealtimeSubtitle[] => {
    const index = current.findIndex((item) => item.id === message.id);

    if (index === -1) {
        // 只有控制标记而没有可见文本时，不生成空白字幕。
        const next = message.text ? [...current, message] : current;
        return next.slice(-MAX_SUBTITLE_MESSAGES);
    }
    // 网络乱序可能让流式片段晚于稳定句到达，稳定结果不能因此倒退。
    if (current[index].end && !message.end) {
        return current.slice(-MAX_SUBTITLE_MESSAGES);
    }

    const next = current.slice();
    // marker-only 稳定事件沿用已有文本，只把该句升级为稳定状态。
    next[index] = message.text ? message : {
        ...current[index],
        end: message.end,
        updatedAt: message.updatedAt,
    };
    return next.slice(-MAX_SUBTITLE_MESSAGES);
};
