import "server-only";

import {createHash} from "node:crypto";

const RTC_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_TOKEN_TTL_SECONDS = 600;

export interface CreateArtcTokenInput {
    appId: string;
    appKey: string;
    channelId: string;
    userId: string;
    expiresInSeconds?: number;
    nowSeconds?: number;
}

export interface ArtcTokenResult {
    appId: string;
    channelId: string;
    userId: string;
    nonce: "";
    timestamp: number;
    token: string;
    base64Token: string;
    expiresAt: string;
}

export class ArtcTokenInputError extends Error {
    readonly code = "ARTC_TOKEN_INPUT_INVALID";

    constructor(message: string) {
        super(message);
        this.name = "ArtcTokenInputError";
    }
}

const assertNonEmpty = (name: string, value: string): string => {
    if (typeof value !== "string" || !value || value.trim() !== value) {
        throw new ArtcTokenInputError(`${name} must be a non-empty string`);
    }

    return value;
};

const assertRtcId = (name: string, value: string): string => {
    const normalizedValue = assertNonEmpty(name, value);

    if (!RTC_ID_PATTERN.test(normalizedValue)) {
        throw new ArtcTokenInputError(
            `${name} must contain only letters, numbers, hyphens, or underscores and be at most 64 characters`,
        );
    }

    return normalizedValue;
};

const assertSeconds = (name: string, value: number, minimum: number, maximum: number) => {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new ArtcTokenInputError(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
};

/**
 * Creates the Base64 ARTC token consumed by AICallKit's userJoinToken field.
 * The signature follows Alibaba Cloud's server-side ARTC token algorithm:
 * SHA-256(AppID + AppKey + ChannelID + UserID + Nonce + Timestamp).
 */
export const createArtcToken = ({
    appId,
    appKey,
    channelId,
    userId,
    expiresInSeconds = DEFAULT_TOKEN_TTL_SECONDS,
    nowSeconds = Math.floor(Date.now() / 1000),
}: CreateArtcTokenInput): ArtcTokenResult => {
    const normalizedAppId = assertNonEmpty("appId", appId);
    const normalizedAppKey = assertNonEmpty("appKey", appKey);
    const normalizedChannelId = assertRtcId("channelId", channelId);
    const normalizedUserId = assertRtcId("userId", userId);

    assertSeconds("expiresInSeconds", expiresInSeconds, 60, 86400);
    assertSeconds("nowSeconds", nowSeconds, 0, Number.MAX_SAFE_INTEGER);

    const nonce = "" as const;
    const timestamp = nowSeconds + expiresInSeconds;
    const token = createHash("sha256")
        .update(
            `${normalizedAppId}${normalizedAppKey}${normalizedChannelId}${normalizedUserId}${nonce}${timestamp}`,
            "utf8",
        )
        .digest("hex");
    const tokenJson = {
        appid: normalizedAppId,
        channelid: normalizedChannelId,
        userid: normalizedUserId,
        nonce,
        timestamp,
        token,
    };
    const base64Token = Buffer.from(JSON.stringify(tokenJson), "utf8").toString("base64");

    return {
        appId: normalizedAppId,
        channelId: normalizedChannelId,
        userId: normalizedUserId,
        nonce,
        timestamp,
        token,
        base64Token,
        expiresAt: new Date(timestamp * 1000).toISOString(),
    };
};

/**
 * Keeps the browser-facing RTC user id stable per authenticated user while
 * avoiding disclosure of the Firebase identifier itself.
 */
export const createRtcUserId = (identity: string): string => {
    const normalizedIdentity = assertNonEmpty("identity", identity);
    const digest = createHash("sha256").update(normalizedIdentity, "utf8").digest("hex").slice(0, 32);

    return `usr_${digest}`;
};

