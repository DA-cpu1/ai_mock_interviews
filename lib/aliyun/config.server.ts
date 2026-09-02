import "server-only";

const DEFAULT_REGION = "cn-shanghai";
const DEFAULT_TOKEN_TTL_SECONDS = 600;
const DEFAULT_MAX_SESSION_MINUTES = 30;

export class AliyunConfigError extends Error {
    readonly code = "ALIYUN_CONFIG_INVALID";

    constructor(message: string) {
        super(message);
        this.name = "AliyunConfigError";
    }
}

export interface AliyunRealtimeServerConfig {
    enabled: boolean;
    region: string;
    agentId: string;
    appId: string;
    appKey: string;
    tokenTtlSeconds: number;
    maxSessionMinutes: number;
}

const readRequiredEnv = (name: string): string => {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new AliyunConfigError(`Missing required environment variable: ${name}`);
    }

    return value;
};

const readBoundedInteger = (
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number => {
    const rawValue = process.env[name]?.trim();

    if (!rawValue) return fallback;

    const value = Number(rawValue);

    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new AliyunConfigError(
            `${name} must be an integer between ${minimum} and ${maximum}`,
        );
    }

    return value;
};

export const getAliyunRealtimeConfig = (): AliyunRealtimeServerConfig => {
    const enabled = process.env.AI_REALTIME_ENABLED?.trim().toLowerCase() === "true";
    const region = process.env.ALIYUN_AI_REALTIME_REGION?.trim() || DEFAULT_REGION;
    const tokenTtlSeconds = readBoundedInteger(
        "ALIYUN_RTC_TOKEN_TTL_SECONDS",
        DEFAULT_TOKEN_TTL_SECONDS,
        60,
        3600,
    );
    const maxSessionMinutes = readBoundedInteger(
        "AI_REALTIME_MAX_SESSION_MINUTES",
        DEFAULT_MAX_SESSION_MINUTES,
        1,
        120,
    );

    // Keep the rollback switch cheap: a disabled feature does not require
    // production credentials to exist and cannot accidentally create a call.
    if (!enabled) {
        return {
            enabled,
            region,
            agentId: "",
            appId: "",
            appKey: "",
            tokenTtlSeconds,
            maxSessionMinutes,
        };
    }

    return {
        enabled,
        region,
        agentId: readRequiredEnv("ALIYUN_AI_AGENT_ID"),
        appId: readRequiredEnv("ALIYUN_RTC_APP_ID"),
        appKey: readRequiredEnv("ALIYUN_RTC_APP_KEY"),
        tokenTtlSeconds,
        maxSessionMinutes,
    };
};

