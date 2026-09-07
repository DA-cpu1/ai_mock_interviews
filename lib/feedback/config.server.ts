import "server-only";

const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

export class FeedbackConfigError extends Error {
    readonly code = "FEEDBACK_CONFIG_INVALID" as const;

    constructor(message: string) {
        super(message);
        this.name = "FeedbackConfigError";
    }
}

export interface FeedbackServerConfig {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
}

const readRequiredEnv = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) throw new FeedbackConfigError(`Missing required environment variable: ${name}`);
    return value;
};

const readTimeoutMs = (): number => {
    const rawValue = process.env.AI_FEEDBACK_TIMEOUT_MS?.trim();
    if (!rawValue) return DEFAULT_TIMEOUT_MS;

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
        throw new FeedbackConfigError(
            `AI_FEEDBACK_TIMEOUT_MS must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
        );
    }
    return value;
};

const normalizeBaseUrl = (value: string): string => {
    try {
        const url = new URL(value);
        if (!(["http:", "https:"] as string[]).includes(url.protocol)
            || url.username || url.password || url.search || url.hash) {
            throw new Error("unsupported endpoint");
        }
        return value.replace(/\/+$/, "");
    } catch {
        throw new FeedbackConfigError("ALIYUN_BAILIAN_BASE_URL must be a valid HTTP(S) URL");
    }
};

/** 读取反馈服务配置；开关关闭时不读取任何必须存在的服务端凭证。 */
export const getFeedbackConfig = (): FeedbackServerConfig => {
    const enabled = process.env.AI_FEEDBACK_ENABLED?.trim().toLowerCase() === "true";
    const timeoutMs = readTimeoutMs();

    // 回滚开关关闭时保持安全空配置，避免开发环境被迫填写真实密钥。
    if (!enabled) {
        return {enabled, apiKey: "", baseUrl: "", model: "", timeoutMs};
    }

    return {
        enabled,
        apiKey: readRequiredEnv("ALIYUN_BAILIAN_API_KEY"),
        baseUrl: normalizeBaseUrl(readRequiredEnv("ALIYUN_BAILIAN_BASE_URL")),
        model: readRequiredEnv("ALIYUN_BAILIAN_MODEL"),
        timeoutMs,
    };
};
