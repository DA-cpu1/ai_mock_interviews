"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

// 描述一次通话从未开始到结束的四个阶段。
enum CallStatus {
    INACTIVE = "INACTIVE",
    CONNECTING = "CONNECTING",
    ACTIVE = "ACTIVE",
    FINISHED = "FINISHED",
}

// 统一字幕消息的数据格式，方便以后对接任意国内模型。
interface SavedMessage {
    role: "user" | "system" | "assistant";
    content: string;
}

// 在项目原有 AgentProps 的基础上，补充与具体模型无关的 UI 输入。
interface AgentComponentProps extends AgentProps {
    // 由语音播放模块传入；为 true 时显示 AI 头像的呼吸动画。
    isSpeaking?: boolean;
    // 完整对话记录；当前界面只展示最后一条消息。
    messages?: readonly SavedMessage[];
    // 开始和结束通话的适配接口，应由未来接入的模型模块实现。
    onCall?: () => void | Promise<void>;
    onDisconnect?: () => void;
}

const Agent = ({
    userName,
    isSpeaking = false,
    messages = [],
    onCall,
    onDisconnect,
}: AgentComponentProps) => {
    // Agent 自己管理按钮和通话区域的显示状态。
    const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);

    // 这是可以直接从 props 推导出的值，因此不需要再创建一个 state。
    const lastMessage = messages.at(-1)?.content ?? "";

    // 用户点击 Call 后，先进入连接中状态，再等待模型连接完成。
    const handleCall = async () => {
        setCallStatus(CallStatus.CONNECTING);

        try {
            // 没有传 onCall 时也能作为纯 UI 预览使用。
            await onCall?.();
            setCallStatus(CallStatus.ACTIVE);
        } catch (error) {
            // 连接失败后恢复初始状态，让用户可以重试。
            console.error("Failed to start the call:", error);
            setCallStatus(CallStatus.INACTIVE);
        }
    };

    // 通知外部模型停止工作，并把界面切换到已结束状态。
    const handleDisconnect = () => {
        onDisconnect?.();
        setCallStatus(CallStatus.FINISHED);
    };

    return (
        <>
            {/* 上半部分：左侧 AI 面试官，右侧当前用户。 */}
            <div className="call-view">
                <div className="card-interviewer">
                    <div className="avatar">
                        <Image
                            src="/ai-avatar.png"
                            alt="AI interviewer"
                            width={65}
                            height={54}
                            className="object-cover"
                        />
                        {/* 模型开始播放语音时，在头像上叠加扩散动画。 */}
                        {isSpeaking ? <span className="animate-speak" /> : null}
                    </div>
                    <h3>AI Interviewer</h3>
                </div>

                <div className="card-border">
                    <div className="card-content">
                        <Image
                            src="/user-avatar.png"
                            alt={`${userName}'s profile`}
                            width={539}
                            height={539}
                            className="size-30 rounded-full object-cover"
                        />
                        <h3>{userName}</h3>
                    </div>
                </div>
            </div>

            {/* 有消息时才渲染字幕区域，空数组不会留下空白面板。 */}
            {messages.length > 0 ? (
                <div className="transcript-border">
                    <div className="transcript">
                        <p
                            // 消息改变时重新挂载段落，从而重新播放淡入动画。
                            key={lastMessage}
                            className={cn(
                                "transition-opacity duration-500 opacity-0",
                                "animate-fadeIn opacity-100",
                            )}
                        >
                            {lastMessage}
                        </p>
                    </div>
                </div>
            ) : null}

            {/* 下半部分：根据通话状态在 Call 和 End 按钮之间切换。 */}
            <div className="flex w-full justify-center">
                {callStatus !== CallStatus.ACTIVE ? (
                    <button className="relative btn-call" onClick={handleCall}>
                        <span
                            className={cn(
                                "absolute animate-ping rounded-full opacity-75",
                                // 只有连接模型期间才显示按钮上的扩散圆环。
                                callStatus !== CallStatus.CONNECTING && "hidden",
                            )}
                        />

                        <span className="relative">
                            {callStatus === CallStatus.INACTIVE ||
                            callStatus === CallStatus.FINISHED
                                ? "Call"
                                : ". . ."}
                        </span>
                    </button>
                ) : (
                    <button className="btn-disconnect" onClick={handleDisconnect}>
                        End
                    </button>
                )}
            </div>
        </>
    );
};

export default Agent;
