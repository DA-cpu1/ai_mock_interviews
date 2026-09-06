import "server-only";

const MIN_CALLBACK_TOKEN_LENGTH = 32;
const MAX_CALLBACK_TOKEN_LENGTH = 512;

export class AliyunCallbackConfigError extends Error {
    readonly code = "ALIYUN_CALLBACK_CONFIG_INVALID";

    constructor(message: string) {
        super(message);
        this.name = "AliyunCallbackConfigError";
    }
}

export interface AliyunCallbackConfig {
    enabled: boolean;
    token: string;
}

export const getAliyunCallbackConfig = (): AliyunCallbackConfig => {
    const token = process.env.ALIYUN_AI_CALLBACK_TOKEN?.trim() ?? "";

    if (!token) return {enabled: false, token: ""};
    if (token.length < MIN_CALLBACK_TOKEN_LENGTH || token.length > MAX_CALLBACK_TOKEN_LENGTH) {
        throw new AliyunCallbackConfigError(
            `ALIYUN_AI_CALLBACK_TOKEN must contain ${MIN_CALLBACK_TOKEN_LENGTH}-${MAX_CALLBACK_TOKEN_LENGTH} characters`,
        );
    }

    return {enabled: true, token};
};
