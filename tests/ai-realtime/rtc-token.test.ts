import assert from "node:assert/strict";
import test from "node:test";

import {createArtcToken, createRtcUserId} from "../../lib/aliyun/rtc-token.server.ts";

test("creates the official ARTC Base64 token shape", () => {
    const result = createArtcToken({
        appId: "abc",
        appKey: "abckey",
        channelId: "abcChannel",
        userId: "abcUser",
        nowSeconds: 1_699_423_634,
        expiresInSeconds: 3_600,
    });
    const decoded = JSON.parse(Buffer.from(result.base64Token, "base64").toString("utf8"));

    assert.equal(result.timestamp, 1_699_427_234);
    assert.equal(result.token, "901b70939639c8afb6a507b21f81b26a33bdebba9157e661f6983eabb7bc34ac");
    assert.deepEqual(decoded, {
        appid: "abc",
        channelid: "abcChannel",
        userid: "abcUser",
        nonce: "",
        timestamp: 1_699_427_234,
        token: result.token,
    });
});

test("rejects invalid channel and user ids", () => {
    assert.throws(
        () =>
            createArtcToken({
                appId: "app",
                appKey: "key",
                channelId: "not allowed",
                userId: "user",
            }),
        {code: "ARTC_TOKEN_INPUT_INVALID"},
    );

    assert.throws(
        () =>
            createArtcToken({
                appId: "app",
                appKey: "key",
                channelId: "channel",
                userId: "u".repeat(65),
            }),
        {code: "ARTC_TOKEN_INPUT_INVALID"},
    );
});

test("derives a stable RTC user id without exposing the identity", () => {
    const first = createRtcUserId("firebase-user-1");
    const second = createRtcUserId("firebase-user-1");

    assert.equal(first, second);
    assert.match(first, /^usr_[A-Za-z0-9_-]{32}$/);
    assert.notEqual(first, "firebase-user-1");
});
