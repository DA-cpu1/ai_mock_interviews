import "server-only";

import type {NormalizedAliyunCallback} from "@/lib/aliyun/callback-protocol";

import {
    CallbackPersistenceError,
    persistAliyunCallback,
} from "./transcript-store.server";

export {CallbackPersistenceError};

export class CallbackHandlerError extends Error {
    readonly code = "CALLBACK_PERSISTENCE_FAILED";

    constructor() {
        super("CALLBACK_PERSISTENCE_FAILED");
        this.name = "CallbackHandlerError";
    }
}

export const handleAliyunCallback = async (
    callback: NormalizedAliyunCallback,
    options: {now?: Date} = {},
) => {
    try {
        return await persistAliyunCallback(callback, options);
    } catch (error) {
        if (error instanceof CallbackPersistenceError) throw error;

        console.error("[ai-realtime] callback persistence failed", {
            category: error instanceof Error ? error.name : "UnknownError",
            event: callback.event,
            sessionId: callback.sessionId,
        });
        throw new CallbackHandlerError();
    }
};
