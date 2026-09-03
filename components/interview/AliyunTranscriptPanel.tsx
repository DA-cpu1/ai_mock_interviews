"use client";

import {Sparkles, Volume2} from "lucide-react";
import {memo, useEffect, useRef} from "react";

import type {AiRealtimeSubtitle} from "@/types/ai-realtime";

import styles from "./AliyunInterviewClient.module.css";

interface AliyunTranscriptPanelProps {
    messages: readonly AiRealtimeSubtitle[];
    hint: string;
}

interface TranscriptMessageProps {
    message: AiRealtimeSubtitle;
}

// 字幕协议会保留未变化消息的对象引用，因此流式更新时只重绘正在变化的那一行。
const TranscriptMessage = memo(function TranscriptMessage({message}: TranscriptMessageProps) {
    const isUser = message.role === "user";

    return (
        <div
            className={`${styles.message} ${isUser ? styles.messageUser : styles.messageAssistant}`}
        >
            <div className={styles.messageHeader}>
                <span>{isUser ? "你" : "AI INTERVIEWER"}</span>
                <span>{message.end ? "STABLE" : "LIVE"}</span>
            </div>
            <p>{message.text}</p>
        </div>
    );
});

const AliyunTranscriptPanel = memo(function AliyunTranscriptPanel({
    messages,
    hint,
}: AliyunTranscriptPanelProps) {
    const transcriptRef = useRef<HTMLDivElement | null>(null);
    const countLabel = `${messages.length.toString().padStart(2, "0")} 条`;

    // 每次新增字幕或更新同一句字幕后，都让滚动区域显示最新内容。
    useEffect(() => {
        const transcriptElement = transcriptRef.current;

        if (transcriptElement) {
            transcriptElement.scrollTop = transcriptElement.scrollHeight;
        }
    }, [messages]);

    return (
        <aside className={styles.transcriptCard}>
            <div className={styles.cardTopline}>
                <div className={styles.cardKicker}>
                    <Sparkles size={15}/>
                    <span>LIVE TRANSCRIPT</span>
                </div>
                <span className={styles.countLabel}>{countLabel}</span>
            </div>

            <div className={styles.transcriptBody} ref={transcriptRef} aria-live="polite">
                {messages.length === 0 ? (
                    <div className={styles.emptyTranscript}>
                        <div className={styles.emptyIcon}>
                            <Volume2 size={22}/>
                        </div>
                        <p>{hint}</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <TranscriptMessage key={message.id} message={message}/>
                    ))
                )}
            </div>

            <div className={styles.transcriptFooter}>
                <span className={styles.footerSignal}/>
                <span>流式字幕仅用于即时显示</span>
            </div>
        </aside>
    );
});

export default AliyunTranscriptPanel;
