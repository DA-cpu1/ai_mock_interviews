"use client";

import {
    Activity,
    ArrowLeft,
    Bot,
    Mic,
    MicOff,
    Phone,
    PhoneOff,
    Radio,
    RotateCcw,
    Sparkles,
    Volume2,
    VolumeX,
    Wifi,
} from "lucide-react";
import Link from "next/link";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import {
    mergeSubtitleMessage,
    parseSubtitleUpdate,
} from "@/lib/ai-realtime/subtitle-protocol";
import type {
    AiRealtimeAgentState,
    AiRealtimeCallStatus,
    AiRealtimeSessionResponse,
    AiRealtimeSubtitle,
    AiRealtimeSubtitleRole,
} from "@/types/ai-realtime";

import styles from "./AliyunInterviewClient.module.css";

// AICallKit 的引擎和事件类型只在浏览器端动态加载；这里使用类型导入，避免服务端渲染时提前执行 SDK。
type AliyunCallEngine = import("aliyun-auikit-aicall").default;
type AliyunAgentState = import("aliyun-auikit-aicall").AICallAgentState;
type AliyunSubtitle = import("aliyun-auikit-aicall").AICallSubtitleData;

interface AliyunInterviewClientProps {
    // 当前候选人的姓名，用于界面展示和头像首字母。
    userName: string;
    // 这次通话对应的已保存面试；服务端会再次检查它是否属于当前用户。
    interviewId?: string;
    // test 为独立测试台，interview 为正式面试页面；两者共用同一套通话逻辑。
    variant?: "test" | "interview";
}

// 页面底部的 SDK 事件诊断记录，只保留最近 8 条，避免日志无限增长。
interface EventLogItem {
    id: string;
    text: string;
    time: string;
}

// 将内部状态转换成用户可读的中文文案。
const STATUS_LABELS: Record<AiRealtimeCallStatus, string> = {
    idle: "待命",
    requesting_permission: "请求麦克风",
    issuing_token: "签发 Token",
    connecting: "连接中",
    active: "通话中",
    ending: "正在挂断",
    ended: "已结束",
    error: "连接异常",
};

const AGENT_STATE_LABELS: Record<AiRealtimeAgentState, string> = {
    idle: "等待智能体状态",
    listening: "聆听中",
    thinking: "思考中",
    speaking: "讲话中",
};

// 常见阿里云 AICallKit 错误码的友好提示；未收录的错误会直接展示 SDK 返回的信息。
const ERROR_MESSAGES: Record<number, string> = {
    [-10000]: "智能体启动失败，请确认 Agent ID、Region 和控制台工作流配置。",
    [-10001]: "RTC 连接失败，请检查网络后重试。",
    [-10004]: "RTC Token 已过期，请结束当前通话后重新呼叫。",
    [-10005]: "当前用户在其他标签页登录，旧通话已被替换。",
    [-10008]: "浏览器麦克风不可用或权限被拒绝。",
    [-10101]: "智能体已结束本次通话。",
    [-10204]: "找不到对应的 AI 智能体，请检查控制台配置。",
};

// 将未知类型的异常统一转换为可展示的错误文案。
const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return "语音面试暂时不可用，请稍后重试。";
};

// AICallKit 使用数字表示智能体状态，页面内部统一使用语义化字符串。
const mapAgentState = (state: AliyunAgentState): AiRealtimeAgentState => {
    switch (state) {
        case 1:
            return "listening";
        case 2:
            return "thinking";
        case 3:
            return "speaking";
        default:
            return "idle";
    }
};

// 运行时校验服务端返回值，避免不完整的 Token 配置传入 SDK 后才报错。
const isSessionResponse = (value: unknown): value is AiRealtimeSessionResponse => {
    if (!value || typeof value !== "object") return false;

    const payload = value as Partial<AiRealtimeSessionResponse>;

    return Boolean(
        payload.sessionId &&
        payload.userId &&
        payload.agentId &&
        payload.region &&
        payload.userJoinToken &&
        payload.expiresAt &&
        payload.agentConfig,
    );
};

// 诊断日志使用本地时间，便于排查权限、Token、RTC 连接等阶段的问题。
const formatTime = () =>
    new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

const AliyunInterviewClient = ({
    userName,
    interviewId,
    variant = "test",
}: AliyunInterviewClientProps) => {
    // 这些状态共同驱动页面上的通话按钮、状态标签、字幕和错误提示。
    const [callStatus, setCallStatus] = useState<AiRealtimeCallStatus>("idle");
    const [agentState, setAgentState] = useState<AiRealtimeAgentState>("idle");
    const [agentStarted, setAgentStarted] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isAgentAudioMuted, setIsAgentAudioMuted] = useState(false);
    const [messages, setMessages] = useState<AiRealtimeSubtitle[]>([]);
    const [eventLog, setEventLog] = useState<EventLogItem[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [sessionInfo, setSessionInfo] = useState<AiRealtimeSessionResponse | null>(null);

    // ref 保存不会因为重新渲染而改变的通话对象、会话信息和并发控制标记。
    const engineRef = useRef<AliyunCallEngine | null>(null);
    // sessionRef 给异步流程使用；sessionInfo 则专门用于把会话信息渲染到页面。
    const sessionRef = useRef<AiRealtimeSessionResponse | null>(null);
    // 组件卸载后，异步回调不应再更新 React state。
    const mountedRef = useRef(true);
    // 防止重复点击“开始呼叫”或在启动/结束同时发生时产生多个 SDK 实例。
    const startingRef = useRef(false);
    const endingRef = useRef(false);
    // 多个结束路径可能同时触发，复用同一个清理 Promise 保证只清理一次。
    const cleanupPromiseRef = useRef<Promise<void> | null>(null);
    // 保存取消事件监听的函数，通话结束或组件卸载时统一移除监听。
    const removeListenersRef = useRef<(() => void) | null>(null);
    // 让同一毫秒内生成的日志也拥有唯一 id。
    const eventSequenceRef = useRef(0);
    // 用于字幕区域自动滚动到底部。
    const transcriptRef = useRef<HTMLDivElement | null>(null);

    // 在诊断面板头部插入一条最新事件，并限制日志数量。
    const appendEvent = useCallback((text: string) => {
        if (!mountedRef.current) return;

        const item: EventLogItem = {
            id: `${Date.now()}-${eventSequenceRef.current++}`,
            text,
            time: formatTime(),
        };

        setEventLog((current) => [item, ...current].slice(0, 8));
    }, []);

    // 合并流式字幕：同一个角色的同一个 sentenceId 代表同一句话，后续片段更新原记录而不是重复追加。
    // [INTERVIEW_COMPLETE] 是后端/智能体用于通知面试结束的控制标记，不应该显示给候选人。
    const mergeSubtitle = useCallback((role: AiRealtimeSubtitleRole, subtitle: AliyunSubtitle) => {
        const parsed = parseSubtitleUpdate(role, subtitle, Date.now());
        setMessages((current) => mergeSubtitleMessage(current, parsed.message));
        return parsed.interviewComplete;
    }, []);

    // 移除当前 SDK 实例注册的所有事件监听。
    const removeEngineListeners = useCallback(() => {
        removeListenersRef.current?.();
        removeListenersRef.current = null;
    }, []);

    // 把 SDK 的接通和结束结果告诉服务端，让数据库里的会话状态保持一致。
    const updateServerSession = useCallback(async (action: "start" | "end") => {
        const sessionId = sessionRef.current?.sessionId;
        if (!sessionId) return;

        const response = await fetch(
            `/api/ai-realtime/sessions/${encodeURIComponent(sessionId)}/${action}`,
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({}),
                // 页面正在关闭时，也尽量把结束通知送到服务端。
                keepalive: action === "end",
            },
        );

        if (!response.ok) {
            const payload: unknown = await response.json().catch(() => null);
            const message = payload && typeof payload === "object" && "error" in payload
                ? (payload.error as {message?: string})?.message
                : undefined;
            throw new Error(message || `服务端返回 ${response.status}`);
        }

        appendEvent(action === "start" ? "服务端已记录通话开始" : "服务端已记录通话结束");
    }, [appendEvent]);

    // 统一释放 SDK 资源。requestHangup=true 表示主动挂断，false 表示 SDK 已经因错误/结束而触发清理。
    const cleanupEngine = useCallback(
        async (finalStatus: "ended" | "error", requestHangup: boolean) => {
            if (cleanupPromiseRef.current) {
                await cleanupPromiseRef.current;
                return;
            }

            const engine = engineRef.current;

            if (!engine) {
                try {
                    await updateServerSession("end");
                } catch (error) {
                    appendEvent(`结束状态未能保存：${toErrorMessage(error)}`);
                }
                sessionRef.current = null;
                if (mountedRef.current) setCallStatus(finalStatus);
                return;
            }

            endingRef.current = true;

            const cleanupPromise = (async () => {
                if (mountedRef.current) setCallStatus("ending");

                try {
                    // handup() in aliyun-auikit-aicall also initiates destroy().
                    // Use direct destroy only for SDK-initiated end/error paths.
                    if (requestHangup) {
                        await engine.handup();
                    } else {
                        await engine.destroy();
                    }
                } catch (error) {
                    appendEvent(`资源清理失败：${toErrorMessage(error)}`);

                    try {
                        await engine.destroy();
                    } catch {
                        // The engine may already have been destroyed by handup().
                    }
                } finally {
                    try {
                        await updateServerSession("end");
                    } catch (error) {
                        appendEvent(`结束状态未能保存：${toErrorMessage(error)}`);
                    }
                    removeEngineListeners();

                    if (engineRef.current === engine) {
                        engineRef.current = null;
                    }

                    sessionRef.current = null;

                    if (mountedRef.current) {
                        setCallStatus(finalStatus);
                        setAgentState("idle");
                        setAgentStarted(false);
                        setIsMuted(false);
                        setIsAgentAudioMuted(false);
                    }

                    endingRef.current = false;
                }
            })();

            cleanupPromiseRef.current = cleanupPromise;

            try {
                await cleanupPromise;
            } finally {
                if (cleanupPromiseRef.current === cleanupPromise) {
                    cleanupPromiseRef.current = null;
                }
            }
        },
        [appendEvent, removeEngineListeners, updateServerSession],
    );

    // 统一处理 SDK 错误：展示友好提示、记录诊断日志，并触发资源清理。
    const handleSdkError = useCallback(
        (code: number, message: string) => {
            const friendlyMessage = ERROR_MESSAGES[code] ?? message ?? `SDK 错误码：${code}`;

            setErrorMessage(friendlyMessage);
            appendEvent(`SDK 错误 ${code}：${friendlyMessage}`);

            if (!endingRef.current) {
                void cleanupEngine("error", false);
            }
        },
        [appendEvent, cleanupEngine],
    );

    // 为 AICallKit 注册生命周期、智能体状态、字幕、音频和鉴权相关事件。
    const registerEngineListeners = useCallback(
        (engine: AliyunCallEngine) => {
            // RTC 真正接通后才进入 active 状态，按钮也在此时可用。
            const onCallBegin = () => {
                void updateServerSession("start")
                    .then(() => {
                        if (mountedRef.current) setCallStatus("active");
                        appendEvent("callBegin · 已接入 RTC 通话");
                    })
                    .catch((error) => {
                        const message = toErrorMessage(error);
                        if (mountedRef.current) setErrorMessage(message);
                        appendEvent(`开始状态未能保存：${message}`);
                        if (!endingRef.current) void cleanupEngine("error", true);
                    });
            };
            const onCallEnd = () => {
                appendEvent("callEnd · SDK 通知通话结束");

                if (!endingRef.current) {
                    void cleanupEngine("ended", false);
                }
            };
            const onAgentStarted = () => {
                setAgentStarted(true);
                appendEvent("agentStarted · 智能体已启动");
            };
            const onAgentStateChanged = (state: AliyunAgentState) => {
                const nextState = mapAgentState(state);
                setAgentState(nextState);
                appendEvent(`agentStateChanged · ${AGENT_STATE_LABELS[nextState]}`);
            };
            // AI 字幕可能是流式片段；稳定句中若出现完成标记，则延迟挂断，让最后一句播报完成。
            const onAgentSubtitle = (subtitle: AliyunSubtitle) => {
                const interviewComplete = mergeSubtitle("assistant", subtitle);
                appendEvent(
                    `agentSubtitleNotify · ${subtitle.end ? "稳定句" : "流式更新"} #${subtitle.sentenceId}`,
                );

                if (interviewComplete) {
                    appendEvent("检测到 [INTERVIEW_COMPLETE] · 准备优雅结束");
                    window.setTimeout(() => {
                        if (engineRef.current && !endingRef.current) {
                            void cleanupEngine("ended", true);
                        }
                    }, 1200);
                }
            };
            const onUserSubtitle = (subtitle: AliyunSubtitle) => {
                mergeSubtitle("user", subtitle);
                appendEvent(
                    `userSubtitleNotify · ${subtitle.end ? "稳定句" : "流式更新"} #${subtitle.sentenceId}`,
                );
            };
            // 以下事件主要用于诊断播放器、Token 和 RTC 连接状态。
            const onAudioSubscribed = () => appendEvent("audioSubscribed · AI 音频已订阅");
            const onSpeakingInterrupted = () => appendEvent("speakingInterrupted · AI 播报已打断");
            const onAutoPlayFailed = () => {
                setErrorMessage("浏览器阻止了自动播放，请点击页面后再试。");
                appendEvent("autoPlayFailed · 需要用户手势恢复音频");
            };
            const onAuthInfoWillExpire = () => {
                setErrorMessage("RTC Token 即将过期，请结束当前通话后重新呼叫。");
                appendEvent("authInfoWillExpire · 当前 Token 即将过期");
            };
            const onAuthInfoExpired = () => handleSdkError(-10004, "RTC Token 已过期。");
            const onConnectionStatusChange = (status: number) =>
                appendEvent(`connectionStatusChange · 状态 ${status}`);

            engine.on("callBegin", onCallBegin);
            engine.on("callEnd", onCallEnd);
            engine.on("agentStarted", onAgentStarted);
            engine.on("agentStateChanged", onAgentStateChanged);
            engine.on("agentSubtitleNotify", onAgentSubtitle);
            engine.on("userSubtitleNotify", onUserSubtitle);
            engine.on("audioSubscribed", onAudioSubscribed);
            engine.on("speakingInterrupted", onSpeakingInterrupted);
            engine.on("autoPlayFailed", onAutoPlayFailed);
            engine.on("authInfoWillExpire", onAuthInfoWillExpire);
            engine.on("authInfoExpired", onAuthInfoExpired);
            engine.on("connectionStatusChange", onConnectionStatusChange);
            engine.on("errorOccurred", handleSdkError);

            // 返回取消函数，确保通话结束后不会残留旧实例的回调。
            removeListenersRef.current = () => {
                engine.off("callBegin", onCallBegin);
                engine.off("callEnd", onCallEnd);
                engine.off("agentStarted", onAgentStarted);
                engine.off("agentStateChanged", onAgentStateChanged);
                engine.off("agentSubtitleNotify", onAgentSubtitle);
                engine.off("userSubtitleNotify", onUserSubtitle);
                engine.off("audioSubscribed", onAudioSubscribed);
                engine.off("speakingInterrupted", onSpeakingInterrupted);
                engine.off("autoPlayFailed", onAutoPlayFailed);
                engine.off("authInfoWillExpire", onAuthInfoWillExpire);
                engine.off("authInfoExpired", onAuthInfoExpired);
                engine.off("connectionStatusChange", onConnectionStatusChange);
                engine.off("errorOccurred", handleSdkError);
            };
        },
        [appendEvent, cleanupEngine, handleSdkError, mergeSubtitle, updateServerSession],
    );

    // 启动一次完整的 AI 语音面试：麦克风权限 -> 服务端会话配置 -> AICallKit -> RTC 通话。
    const startCall = useCallback(async () => {
        //防止重复呼叫和并发冲突
        if (startingRef.current || endingRef.current || engineRef.current) return;
        if (!interviewId) {
            setErrorMessage("请先选择一场已保存的面试。");
            setCallStatus("error");
            return;
        }

        //初始化本次通话的页面状态
        startingRef.current = true;
        setErrorMessage(null);
        setMessages([]);
        setEventLog([]);
        setSessionInfo(null);
        setAgentState("idle");
        setAgentStarted(false);
        setCallStatus("requesting_permission");
        appendEvent("开始请求麦克风权限");

        try {
            // 先单独申请一次权限并立即释放临时音轨；真正的音频采集由 AICallKit 接管。
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error("当前浏览器不支持麦克风采集。");
            }

            const permissionStream = await navigator.mediaDevices.getUserMedia({audio: true});
            permissionStream.getTracks().forEach((track) => track.stop());
            appendEvent("麦克风权限已获取");

            setCallStatus("issuing_token");
            appendEvent("请求服务端签发短期 ARTC Token");

            // 服务端负责登录校验、生成短期 Token，并隐藏阿里云 App Key。
            const response = await fetch("/api/ai-realtime/sessions", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({interviewId}),
            });
            const payload: unknown = await response.json().catch(() => null);

            if (!response.ok) {
                const apiMessage =
                    payload && typeof payload === "object" && "error" in payload
                        ? (payload.error as { message?: string })?.message
                        : undefined;
                throw new Error(apiMessage || `服务端返回 ${response.status}`);
            }

            if (!isSessionResponse(payload)) {
                throw new Error("服务端返回的通话配置不完整。");
            }

            sessionRef.current = payload;//给程序逻辑使用
            setSessionInfo(payload);//给 UI 展示使用
            setCallStatus("connecting");
            appendEvent("Token 已签发，动态加载 AICallKit");

            // 动态导入可避免首屏加载语音 SDK，也保证该浏览器专用 SDK 不在服务端执行。
            const {
                AICallAgentConfig,
                AICallAgentType,
                default: ARTCAICallEngine,
            } = await import("aliyun-auikit-aicall");

            if (!mountedRef.current) return;

            const engine = new ARTCAICallEngine();
            const agentConfig = new AICallAgentConfig();
            // 将服务端返回的智能体行为配置交给 AICallKit。

            // 最长空闲或会话相关时间，单位由 SDK 定义，此处服务端按秒下发
            agentConfig.agentMaxIdleTime = payload.agentConfig.agentMaxIdleTime;
            //启用智能语音分段，帮助判断一句话何时结束
            agentConfig.enableIntelligentSegment = payload.agentConfig.enableIntelligentSegment;
            //允许智能体更平滑地结束通话
            agentConfig.agentGracefulShutdown = payload.agentConfig.agentGracefulShutdown;
            //更接近普通电话：用户不需要一直按住按钮才能讲话。
            agentConfig.enablePushToTalk = false;

            engineRef.current = engine;
            registerEngineListeners(engine);

            // 使用服务端签发的临时凭证连接指定区域的阿里云 VoiceAgent。
            await engine.callWithConfig({
                agentId: payload.agentId,
                agentType: AICallAgentType.VoiceAgent,
                userId: payload.userId,
                region: payload.region,
                userJoinToken: payload.userJoinToken,
                userData: JSON.stringify({
                    sessionId: payload.sessionId,
                    source: variant,
                }),
                agentConfig,
            });

            appendEvent("callWithConfig · 等待 callBegin");
        } catch (error) {
            const message = toErrorMessage(error);
            setErrorMessage(message);
            appendEvent(`启动失败 · ${message}`);

            if (sessionRef.current && !endingRef.current) {
                await cleanupEngine("error", false);
            } else {
                setCallStatus("error");
            }
        } finally {
            startingRef.current = false;
        }
    }, [appendEvent, cleanupEngine, interviewId, registerEngineListeners, variant]);

    // 用户主动挂断当前通话。
    const endCall = useCallback(() => {
        if (!engineRef.current || endingRef.current) return;

        appendEvent("用户请求挂断");
        void cleanupEngine("ended", true);
    }, [appendEvent, cleanupEngine]);

    // 切换候选人的麦克风状态。
    const toggleMute = useCallback(async () => {
        const engine = engineRef.current;

        if (!engine || callStatus !== "active") return;

        const nextMuted = !isMuted;
        setIsMuted(nextMuted);

        try {
            await engine.mute(nextMuted);
            appendEvent(nextMuted ? "已静音麦克风" : "已恢复麦克风");
        } catch (error) {
            setIsMuted(!nextMuted);
            setErrorMessage(`麦克风切换失败：${toErrorMessage(error)}`);
        }
    }, [appendEvent, callStatus, isMuted]);

    // 切换 AI 播报音频的播放状态，不影响 AI 继续处理通话。
    const toggleAgentAudio = useCallback(async () => {
        const engine = engineRef.current;

        if (!engine || callStatus !== "active") return;

        const nextMuted = !isAgentAudioMuted;
        const accepted = await engine.muteAgentAudioPlaying(nextMuted);

        if (accepted) {
            setIsAgentAudioMuted(nextMuted);
            appendEvent(nextMuted ? "已静音 AI 音频" : "已恢复 AI 音频");
        }
    }, [appendEvent, callStatus, isAgentAudioMuted]);

    // 请求 AICallKit 停止当前 AI 讲话，只有 AI 正在讲话时按钮才可用。
    const interruptAgent = useCallback(async () => {
        const engine = engineRef.current;

        if (!engine || callStatus !== "active") return;

        const accepted = await engine.interruptSpeaking();

        if (accepted) appendEvent("已请求打断 AI 播报");
    }, [appendEvent, callStatus]);

    // 错误或结束后清空本次会话的 UI 记录，恢复到待命状态。
    const resetAfterError = useCallback(() => {
        if (engineRef.current || startingRef.current || endingRef.current) return;

        setErrorMessage(null);
        setSessionInfo(null);
        setCallStatus("idle");
        setEventLog([]);
        setMessages([]);
    }, []);

    // 新字幕到来后自动滚动到最新内容。
    useEffect(() => {
        const transcriptElement = transcriptRef.current;

        if (transcriptElement) {
            transcriptElement.scrollTop = transcriptElement.scrollHeight;
        }
    }, [messages]);

    // 处理页面刷新、关闭和组件卸载，避免 RTC 通话或麦克风资源残留。
    useEffect(() => {
        mountedRef.current = true;

        const handleBeforeUnload = () => {
            const engine = engineRef.current;

            if ((!engine && !sessionRef.current) || endingRef.current) return;

            endingRef.current = true;
            void updateServerSession("end").catch(() => undefined);
            if (engine) void engine.handup().catch(() => engine.destroy());
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            mountedRef.current = false;
            window.removeEventListener("beforeunload", handleBeforeUnload);

            const engine = engineRef.current;

            if ((engine || sessionRef.current) && !endingRef.current) {
                endingRef.current = true;
                void updateServerSession("end").catch(() => undefined);
                if (engine) void engine.handup().catch(() => engine.destroy());
            }
        };
    }, [updateServerSession]);

    // 将底层状态整理成渲染层需要的布尔值和文案。
    const isConnecting =
        callStatus === "requesting_permission" ||
        callStatus === "issuing_token" ||
        callStatus === "connecting";
    const isActive = callStatus === "active";
    const isEnding = callStatus === "ending";
    const isSpeaking = agentState === "speaking";
    const isTestPage = variant === "test";
    const statusLabel = STATUS_LABELS[callStatus];
    const agentStateLabel = AGENT_STATE_LABELS[agentState];
    const subtitleCountLabel = `${messages.length.toString().padStart(2, "0")} 条`;

    const transcriptHint = useMemo(() => {
        if (messages.length > 0) return "字幕会按 sentenceId 更新，不会重复堆叠流式片段";
        if (isActive) return "等待你或 AI 的第一句稳定字幕…";
        return "点击呼叫后，这里会显示用户与 AI 的实时字幕";
    }, [isActive, messages.length]);

    return (
        <main className={styles.page}>
            {/* 顶部标题：根据 test/interview 模式显示不同的页面定位和返回链接。 */}
            <header className={styles.header}>
                <div>
                    <div className={styles.eyebrow}>
                        <span className={styles.eyebrowMark}/>
                        <span>{isTestPage ? "ARTC / AICALLKIT · TEST LAB" : "PREPWISE / LIVE INTERVIEW"}</span>
                    </div>
                    <h1>{isTestPage ? "语音面试 · 信号台" : "开始一场语音面试"}</h1>
                    <p className={styles.subtitle}>
                        {isTestPage
                            ? "把呼叫、字幕与智能体状态放在同一块可观测的测试台上。"
                            : "让 AI 面试官实时提问，你只需要专注于回答。"}
                    </p>
                </div>

                <div className={styles.headerActions}>
                    <Link href={isTestPage ? "/interview" : "/"} className={styles.backLink}>
                        <ArrowLeft size={16}/>
                        <span>{isTestPage ? "返回面试页" : "返回首页"}</span>
                    </Link>
                    <div className={styles.liveChip}>
                        <span className={styles.liveDot}/>
                        <span>REALTIME</span>
                    </div>
                </div>
            </header>

            {/* 主控制台：左侧为通话控制，右侧为双方实时字幕。 */}
            <section className={styles.consoleGrid} aria-label="阿里云实时互动测试台">
                <article className={styles.stageCard}>
                    <div className={styles.cardTopline}>
                        <div className={styles.cardKicker}>
                            <Radio size={15}/>
                            <span>LIVE ROOM / 01</span>
                        </div>
                        <div className={`${styles.statusPill} ${styles[`status_${callStatus}`]}`}>
                            <span className={styles.statusDot}/>
                            <span>{statusLabel}</span>
                        </div>
                    </div>

                    {/* AI 面试官和候选人的状态卡片。 */}
                    <div className={styles.participantGrid}>
                        <div className={`${styles.participantCard} ${isSpeaking ? styles.participantActive : ""}`}>
                            <div className={styles.participantMeta}>
                                <span className={styles.participantLabel}>AI INTERVIEWER</span>
                                <span className={styles.participantState}>{agentStateLabel}</span>
                            </div>
                            <div className={`${styles.agentOrb} ${isSpeaking ? styles.orbSpeaking : ""}`}>
                                <span className={styles.orbGrid}/>
                                <span className={`${styles.orbRing} ${styles.orbRingOne}`}/>
                                <span className={`${styles.orbRing} ${styles.orbRingTwo}`}/>
                                <Bot size={34} strokeWidth={1.4}/>
                            </div>
                            <div className={styles.waveform} aria-hidden="true">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((bar) => (
                                    <span
                                        key={bar}
                                        className={isSpeaking ? styles.waveActive : ""}
                                        style={{animationDelay: `${bar * 55}ms`}}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className={`${styles.participantCard} ${isActive ? styles.participantReady : ""}`}>
                            <div className={styles.participantMeta}>
                                <span className={styles.participantLabel}>CANDIDATE</span>
                                <span className={styles.participantState}>{userName}</span>
                            </div>
                            <div className={styles.userOrb}>
                                <span
                                    className={styles.userInitial}>{userName.trim().charAt(0).toUpperCase() || "U"}</span>
                                <span className={styles.userSignal}/>
                            </div>
                            <div className={styles.participantFooter}>
                                {isMuted ? <MicOff size={15}/> : <Mic size={15}/>}
                                <span>{isMuted ? "麦克风已静音" : "麦克风待命"}</span>
                            </div>
                        </div>
                    </div>

                    {/* 汇总展示当前智能体状态、智能体是否已启动以及 RTC 是否已连接。 */}
                    <div className={styles.stateStrip}>
                        <div className={styles.stateStripMain}>
                            <span className={`${styles.signalIcon} ${isActive ? styles.signalIconActive : ""}`}>
                                <Activity size={15}/>
                            </span>
                            <div>
                                <span className={styles.stateStripLabel}>AGENT STATE</span>
                                <strong>{agentStateLabel}</strong>
                            </div>
                        </div>
                        <div className={styles.stateStripMeta}>
                            <span className={agentStarted ? styles.readyText : ""}>
                                {agentStarted ? "AGENT READY" : "WAITING FOR AGENT"}
                            </span>
                            <span className={styles.stateSeparator}>/</span>
                            <span>{isActive ? "RTC CONNECTED" : "RTC STANDBY"}</span>
                        </div>
                    </div>

                    {/* 启动、连接或 SDK 出错时显示错误提示。 */}
                    {errorMessage ? (
                        <div className={styles.errorBanner} role="alert">
                            <span className={styles.errorIcon}>!</span>
                            <span>{errorMessage}</span>
                        </div>
                    ) : null}

                    {/* active 状态显示通话控制；其他状态显示开始/重新呼叫按钮。 */}
                    <div className={styles.controls}>
                        {isActive ? (
                            <>
                                <button
                                    type="button"
                                    className={`${styles.controlButton} ${isMuted ? styles.controlButtonOn : ""}`}
                                    onClick={() => void toggleMute()}
                                    aria-label={isMuted ? "恢复麦克风" : "静音麦克风"}
                                >
                                    {isMuted ? <MicOff size={18}/> : <Mic size={18}/>}
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.controlButton} ${isAgentAudioMuted ? styles.controlButtonOn : ""}`}
                                    onClick={() => void toggleAgentAudio()}
                                    aria-label={isAgentAudioMuted ? "恢复 AI 音频" : "静音 AI 音频"}
                                >
                                    {isAgentAudioMuted ? <VolumeX size={18}/> : <Volume2 size={18}/>}
                                </button>
                                <button
                                    type="button"
                                    className={styles.interruptButton}
                                    onClick={() => void interruptAgent()}
                                    disabled={!isSpeaking}
                                >
                                    <Sparkles size={16}/>
                                    <span>打断 AI</span>
                                </button>
                                <button type="button" className={styles.endButton} onClick={endCall}
                                        disabled={isEnding}>
                                    <PhoneOff size={17}/>
                                    <span>挂断</span>
                                </button>
                            </>
                        ) : callStatus === "error" || callStatus === "ended" ? (
                            <button type="button" className={styles.callButton} onClick={() => void startCall()}>
                                <Phone size={18}/>
                                <span>重新呼叫</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                className={`${styles.callButton} ${isConnecting ? styles.callButtonLoading : ""}`}
                                onClick={() => void startCall()}
                                disabled={isConnecting}
                            >
                                {isConnecting ? <Wifi size={18} className={styles.spin}/> : <Phone size={18}/>}
                                <span>{isConnecting ? statusLabel : "开始呼叫"}</span>
                            </button>
                        )}
                    </div>
                </article>

                {/* 实时字幕面板：同时显示候选人和 AI 的流式/稳定字幕。 */}
                <aside className={styles.transcriptCard}>
                    <div className={styles.cardTopline}>
                        <div className={styles.cardKicker}>
                            <Sparkles size={15}/>
                            <span>LIVE TRANSCRIPT</span>
                        </div>
                        <span className={styles.countLabel}>{subtitleCountLabel}</span>
                    </div>

                    <div className={styles.transcriptBody} ref={transcriptRef} aria-live="polite">
                        {messages.length === 0 ? (
                            <div className={styles.emptyTranscript}>
                                <div className={styles.emptyIcon}>
                                    <Volume2 size={22}/>
                                </div>
                                <p>{transcriptHint}</p>
                            </div>
                        ) : (
                            messages.map((message) => (
                                <div
                                    className={`${styles.message} ${message.role === "user" ? styles.messageUser : styles.messageAssistant}`}
                                    key={message.id}
                                >
                                    <div className={styles.messageHeader}>
                                        <span>{message.role === "user" ? "你" : "AI INTERVIEWER"}</span>
                                        <span>{message.end ? "STABLE" : "LIVE"}</span>
                                    </div>
                                    <p>{message.text}</p>
                                </div>
                            ))
                        )}
                    </div>

                    <div className={styles.transcriptFooter}>
                        <span className={styles.footerSignal}/>
                        <span>流式字幕仅用于即时显示</span>
                    </div>
                </aside>
            </section>

            {/* 三项固定说明：SDK 数据链路、音频采集范围和当前可观测状态。 */}
            <section className={styles.bottomGrid}>
                <article className={styles.infoCard}>
                    <div className={styles.infoIcon}><Bot size={18}/></div>
                    <div>
                        <span className={styles.infoLabel}>SDK PIPELINE</span>
                        <p>Browser → AICallKit → ARTC → IMS VoiceAgent</p>
                    </div>
                </article>
                <article className={styles.infoCard}>
                    <div className={styles.infoIcon}><Mic size={18}/></div>
                    <div>
                        <span className={styles.infoLabel}>CAPTURE</span>
                        <p>仅使用麦克风，不保存原始音频</p>
                    </div>
                </article>
                <article className={styles.infoCard}>
                    <div className={styles.infoIcon}><Activity size={18}/></div>
                    <div>
                        <span className={styles.infoLabel}>OBSERVABILITY</span>
                        <p>{agentStateLabel} · {statusLabel}</p>
                    </div>
                </article>
            </section>

            {/* 诊断面板：显示最近 SDK 事件以及当前 session/region，便于联调。 */}
            <section className={styles.diagnosticsCard}>
                <div className={styles.diagnosticsHeader}>
                    <div className={styles.cardKicker}>
                        <Radio size={15}/>
                        <span>DIAGNOSTICS</span>
                    </div>
                    <div className={styles.diagnosticMeta}>
                        <span>{sessionInfo ? `SESSION ${sessionInfo.sessionId.slice(0, 8)}` : "NO SESSION"}</span>
                        <span className={styles.stateSeparator}>/</span>
                        <span>{sessionInfo?.region ?? "REGION —"}</span>
                    </div>
                </div>

                <div className={styles.diagnosticsBody}>
                    <div className={styles.diagnosticList}>
                        {eventLog.length === 0 ? (
                            <div className={styles.diagnosticEmpty}>
                                <RotateCcw size={15}/>
                                <span>启动通话后显示 SDK 事件流</span>
                            </div>
                        ) : (
                            eventLog.map((event) => (
                                <div className={styles.diagnosticRow} key={event.id}>
                                    <span>{event.time}</span>
                                    <strong>{event.text}</strong>
                                </div>
                            ))
                        )}
                    </div>
                    <div className={styles.diagnosticNote}>
                        <div className={styles.noteIcon}><Wifi size={16}/></div>
                        <p>
                            {isTestPage
                                ? "这是独立测试页。先确认呼叫、挂断、双方字幕和 agentStateChanged 都正常，再接入正式面试流程。"
                                : "当前页面已使用同一套 AICallKit 会话容器，便于和独立测试页保持一致。"}
                        </p>
                    </div>
                </div>
            </section>

            {/* 通话结束或出错后，可只清除本次记录，不立即重新申请权限和 Token。 */}
            {callStatus === "error" || callStatus === "ended" ? (
                <button type="button" className={styles.retryLink} onClick={resetAfterError}>
                    <RotateCcw size={15}/>
                    <span>清空本次测试记录</span>
                </button>
            ) : null}
        </main>
    );
};

export default AliyunInterviewClient;
