"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import {
  ConversationMessage,
  PersonaMode,
  PersonaRecord,
  SearchResultItem,
} from "@/lib/storage/types";
import BlobMascot, { getBlobVariantForSlug } from "./BlobMascot";
import GrokComposer from "./GrokComposer";
import PageArtifactCard from "./PageArtifactCard";
import ThoughtSearchTrace from "./ThoughtSearchTrace";

interface StreamingState {
  isSearching: boolean;
  searchQuery?: string;
  searchResults?: SearchResultItem[];
  thought: string;
  thoughtDurationMs?: number;
  isStreamingThought: boolean;
  reply: string;
}

interface ChatStageProps {
  persona: PersonaRecord | null;
  messages: ConversationMessage[];
  streaming: StreamingState | null;
  input: string;
  onChangeInput: (val: string) => void;
  onSend: (options?: { imageUrl?: string; requestPhoto?: boolean }) => void;
  onTriggerProactive: (hoursIdle?: number) => void;
  onClearHistory: () => void;
  onQuickCorrect: (msgIndex: number, reason: string) => Promise<void>;
  onRegenerate: (msgIndex: number, overrideMode?: PersonaMode) => void;
  thinkMode: boolean;
  onToggleThink: () => void;
  deepSearch: boolean;
  onToggleDeepSearch: () => void;
  activeMode: PersonaMode;
  onChangeMode: (mode: PersonaMode) => void;
  showInspector: boolean;
  onToggleInspector: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenImport: () => void;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[var(--text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[12.5px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function GrokMessageBody({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2 text-[14px] leading-[1.65] text-[var(--text-primary)]">
      {blocks.map((block, bIdx) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const inner = block.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
          return (
            <pre
              key={bIdx}
              className="p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-x-auto font-mono text-xs leading-relaxed"
            >
              <code>{inner}</code>
            </pre>
          );
        }
        return (
          <p key={bIdx} className="whitespace-pre-wrap break-words">
            {renderInlineMarkdown(block)}
          </p>
        );
      })}
    </div>
  );
}

export default function ChatStage({
  persona,
  messages,
  streaming,
  input,
  onChangeInput,
  onSend,
  onTriggerProactive,
  onClearHistory,
  onQuickCorrect,
  onRegenerate,
  thinkMode,
  onToggleThink,
  deepSearch,
  onToggleDeepSearch,
  activeMode,
  onChangeMode,
  showInspector,
  onToggleInspector,
  sidebarOpen,
  onToggleSidebar,
  onOpenImport,
}: ChatStageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedToast, setSharedToast] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streaming]);

  const speakMessage = (id: string, text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = 1.05;
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utter);
  };

  const copyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleShare = async () => {
    if (!persona) return;
    const summary = messages
      .slice(-6)
      .map((m) => `${m.role === "user" ? "我" : persona.name}: ${m.content}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(
        `【PersonaBot · ${persona.name} 对话片段】\n\n${summary || persona.profile.bio || ""}`
      );
      setSharedToast(true);
      setTimeout(() => setSharedToast(false), 1800);
    } catch {
      setSharedToast(true);
      setTimeout(() => setSharedToast(false), 1800);
    }
  };

  if (!persona) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3 text-xs text-[var(--text-muted)]">
          <BlobMascot variant="bot" size={44} showOnlineDot />
          <span>正在连接 PersonaBot...</span>
        </div>
      </div>
    );
  }

  const blobVariant = getBlobVariantForSlug(persona.slug);
  const modeSpec = PERSONA_MODES[activeMode] || PERSONA_MODES.authentic;
  const firstTimestamp = messages[0]?.timestamp
    ? new Date(messages[0].timestamp).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div className="relative flex-1 flex flex-col h-screen bg-[var(--bg-primary)] min-w-0 overflow-hidden">
      {/* Floating Transparent Grok Bot Header */}
      <header className="relative z-20 px-4 md:px-6 pt-3.5 pb-2 flex items-center justify-between pointer-events-none">
        {/* Left: Reopen sidebar if collapsed */}
        <div className="pointer-events-auto flex items-center gap-2 min-w-[72px]">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              title="展开侧边栏"
            >
              ◧
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="px-3 py-1.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              title="清空当前对话"
            >
              新对话
            </button>
          )}
        </div>

        {/* Center Floating Pill: [BlobMascot] Persona Name */}
        <button
          type="button"
          onClick={onToggleInspector}
          className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill hover:border-[var(--border-strong)] transition-all"
          title="点击展开/收起角色灵魂状态舱"
        >
          <BlobMascot variant={blobVariant} size={22} />
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            {persona.name}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {showInspector ? "✕" : "· 状态"}
          </span>
        </button>

        {/* Right Floating Pill: 分享 */}
        <div className="pointer-events-auto flex items-center justify-end gap-2 min-w-[72px]">
          <button
            type="button"
            onClick={handleShare}
            className="px-4 py-1.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all"
          >
            {sharedToast ? "已复制 ✓" : "分享"}
          </button>
        </div>
      </header>

      {/* Scrollable Chat Stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-8 pt-2 pb-6"
      >
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && !streaming ? (
            /* Clean Empty State matching Grok Bot minimalism */
            <div className="pt-14 pb-8 flex flex-col items-center text-center space-y-5 animate-fade-in">
              <BlobMascot variant={blobVariant} size={68} />
              <div className="space-y-1.5 max-w-md">
                <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                  {persona.name}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {persona.profile.bio ||
                    "支持 DeepSearch 实时联网生成结构化页面、Think 内心潜台词与多档人格模式。"}
                </p>
                <div className="pt-1 flex items-center justify-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>
                    {modeSpec.badge} {modeSpec.shortLabel}
                  </span>
                  <span>·</span>
                  <span>♥ 亲密度 {persona.intimacy}%</span>
                  <span>·</span>
                  <span>{persona.emotionState.moodLabel || "在线"}</span>
                </div>
              </div>

              {/* 4 Quick Starter Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl pt-2">
                {[
                  {
                    icon: "📊",
                    title: "联网整理今日热搜清单",
                    sub: "自动调用 DeepSearch 生成可展开「页面」卡片",
                    text: "帮我联网整理一下今天全网最值得聊的科技圈热搜清单，用你的性格锐评一下",
                  },
                  {
                    icon: "💭",
                    title: "看看你此刻真实的内心 OS",
                    sub: "触发 Think 潜台词推演",
                    text: "说实话，你现在看到我打开这个窗口，心里第一反应是什么？",
                  },
                  {
                    icon: "📸",
                    title: "发张你那边的随手拍",
                    sub: "生成实时情境镜头卡片",
                    text: "发张你现在手边的随手拍给我看看呗",
                  },
                  {
                    icon: "🌙",
                    title: "忙完了一天，求安慰",
                    sub: "感受角色的情绪共鸣与连发节奏",
                    text: "今天工作累麻了，快按你的脾气哄我两句",
                  },
                ].map((chip) => (
                  <button
                    key={chip.title}
                    type="button"
                    onClick={() => onChangeInput(chip.text)}
                    className="p-3.5 rounded-2xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]/80 border border-[var(--border-subtle)] text-left transition-all"
                  >
                    <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      <span>{chip.icon}</span>
                      <span>{chip.title}</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-1">
                      {chip.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Centered Grok Bot Timestamp & Status Line */}
              <div className="py-2 text-center space-y-1.5">
                <div className="text-[11.5px] text-[var(--text-muted)]">
                  今天 {firstTimestamp}
                </div>
                <div className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
                  <span>已发消息给</span>
                  <BlobMascot variant="bot" size={14} />
                  <span className="font-medium text-[var(--text-secondary)]">
                    {persona.name}
                  </span>
                </div>
              </div>

              {messages.map((msg, idx) => {
                const isUser = msg.role === "user";
                const bursts =
                  !isUser && msg.bursts && msg.bursts.length > 0
                    ? msg.bursts
                    : [msg.content];

                if (isUser) {
                  return (
                    <div
                      key={msg.id || `${msg.timestamp}-${idx}`}
                      className="flex flex-col items-end animate-fade-in"
                    >
                      {msg.imageUrl && (
                        <div className="mb-2 rounded-2xl overflow-hidden border border-[var(--border-strong)] max-w-xs">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={msg.imageUrl}
                            alt="用户上传图片"
                            className="w-full max-h-56 object-cover"
                          />
                        </div>
                      )}
                      <div className="max-w-[75%] px-4 py-2.5 rounded-[20px] rounded-tr-md bg-[var(--user-capsule)] text-[var(--user-capsule-text)] text-[14px] leading-relaxed shadow-xs">
                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  );
                }

                const altRewriteMode: PersonaMode =
                  (msg.mode || activeMode) === "fun" ? "companion" : "fun";
                const altRewriteLabel =
                  altRewriteMode === "fun" ? "⚡ 毒舌重说" : "🌸 温柔重说";

                return (
                  <div
                    key={msg.id || `${msg.timestamp}-${idx}`}
                    className="group flex flex-col items-start animate-fade-in"
                  >
                    {/* Collapsible Think & Search Pill */}
                    <ThoughtSearchTrace
                      thought={msg.thought}
                      thoughtDurationMs={msg.thoughtDurationMs}
                      searchQuery={msg.searchQuery}
                      searchResults={msg.searchResults}
                    />

                    {/* Soft Gray Rounded Grok Bot Reply Card */}
                    <div className="max-w-[660px] rounded-[20px] bg-[var(--bg-bubble-ai)] px-4 py-3 space-y-2.5">
                      {bursts.map((burstText, bIdx) => (
                        <GrokMessageBody key={bIdx} content={burstText} />
                      ))}
                    </div>

                    {/* Elevated White Interactive "Page" Artifact Card */}
                    {msg.pageCard && <PageArtifactCard card={msg.pageCard} />}

                    {/* Multimodal Photo / Voice Cards */}
                    {msg.mediaCards && msg.mediaCards.length > 0 && (
                      <div className="mt-2.5 space-y-2 w-full max-w-md">
                        {msg.mediaCards.map((card, cIdx) =>
                          card.type === "photo" ? (
                            <div
                              key={cIdx}
                              className="p-4 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-[var(--text-primary)]">
                                  📸 {persona.name} 的情境实拍
                                </span>
                                <span className="text-[10px] text-[var(--text-muted)]">
                                  MOMENT
                                </span>
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed">
                                &ldquo;{card.caption}&rdquo;
                              </p>
                            </div>
                          ) : (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() =>
                                speakMessage(`${msg.id}-v-${cIdx}`, card.caption)
                              }
                              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-between gap-3 text-left transition-all"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-7 h-7 rounded-full bg-[#18a999]/15 text-[#18a999] flex items-center justify-center text-xs shrink-0">
                                  {speakingId === `${msg.id}-v-${cIdx}` ? "🔊" : "▶"}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                                    语音条 · {card.durationSec || 5}&Prime;
                                  </div>
                                  <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                    {card.caption}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[10px] text-[#18a999] font-medium shrink-0">
                                点击播放
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {/* Subtle Hover Action Row */}
                    <div className="mt-1.5 px-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)] opacity-70 group-hover:opacity-100 transition-opacity">
                      {msg.mood && <span>{msg.mood}</span>}
                      <button
                        type="button"
                        onClick={() => copyMessage(msg.id, msg.content)}
                        className="hover:text-[var(--text-primary)] transition-colors"
                      >
                        {copiedId === msg.id ? "✓ 已复制" : "复制"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRegenerate(idx)}
                        disabled={Boolean(streaming)}
                        className="hover:text-[var(--text-primary)] transition-colors"
                      >
                        ↻ 重说
                      </button>
                      <button
                        type="button"
                        onClick={() => onRegenerate(idx, altRewriteMode)}
                        disabled={Boolean(streaming)}
                        className="hover:text-[var(--text-primary)] transition-colors"
                      >
                        {altRewriteLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => speakMessage(msg.id, msg.content)}
                        className="hover:text-[var(--text-primary)] transition-colors"
                      >
                        {speakingId === msg.id ? "🔊 播报中" : "🔈 朗读"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCorrectingIndex(
                            correctingIndex === idx ? null : idx
                          );
                          setCorrectionText("");
                        }}
                        className="hover:text-[var(--text-primary)] transition-colors"
                      >
                        ✎ 纠偏
                      </button>
                    </div>

                    {/* Inline Correction Popover */}
                    {correctingIndex === idx && (
                      <div className="mt-2 p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-strong)] grok-floating-card w-full max-w-md space-y-2 animate-fade-in">
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          纠正 {persona.name} 的表达偏差：
                        </div>
                        <input
                          type="text"
                          value={correctionText}
                          onChange={(e) => setCorrectionText(e.target.value)}
                          placeholder="例如：她不会这么客气，应该先损我一句..."
                          className="w-full px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs focus:outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCorrectingIndex(null)}
                            className="px-2.5 py-1 text-xs text-[var(--text-muted)]"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!correctionText.trim()) return;
                              await onQuickCorrect(idx, correctionText.trim());
                              setCorrectingIndex(null);
                            }}
                            className="px-3 py-1 rounded-full bg-[#18a999] text-white font-semibold text-xs"
                          >
                            永久记住
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Live Streaming Turn */}
              {streaming && (
                <div className="flex flex-col items-start animate-fade-in">
                  <ThoughtSearchTrace
                    thought={streaming.thought}
                    thoughtDurationMs={streaming.thoughtDurationMs}
                    isStreamingThought={streaming.isStreamingThought}
                    isSearching={streaming.isSearching}
                    searchQuery={streaming.searchQuery}
                    searchResults={streaming.searchResults}
                  />
                  {streaming.reply ? (
                    <div className="max-w-[660px] rounded-[20px] bg-[var(--bg-bubble-ai)] px-4 py-3 text-[14px] leading-[1.65] text-[var(--text-primary)]">
                      <span className="whitespace-pre-wrap break-words">
                        {streaming.reply}
                      </span>
                      <span className="grok-cursor" />
                    </div>
                  ) : (
                    <div className="rounded-[20px] bg-[var(--bg-bubble-ai)] px-4 py-2.5 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#18a999] animate-pulse-dot" />
                      <span>{persona.name} 正在输入...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Capsule Composer */}
      <GrokComposer
        personaName={persona.name}
        value={input}
        onChange={onChangeInput}
        onSend={onSend}
        disabled={Boolean(streaming)}
        thinkMode={thinkMode}
        onToggleThink={onToggleThink}
        deepSearch={deepSearch}
        onToggleDeepSearch={onToggleDeepSearch}
        activeMode={activeMode}
        onChangeMode={onChangeMode}
        onTriggerProactive={() => onTriggerProactive()}
        onOpenImport={onOpenImport}
      />
    </div>
  );
}
