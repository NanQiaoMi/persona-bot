"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import {
  ConversationMessage,
  PersonaMode,
  PersonaRecord,
  SearchResultItem,
} from "@/lib/storage/types";
import GrokComposer from "./GrokComposer";
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
  onOpenCommandPalette: () => void;
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
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-[12.5px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function GrokMarkdownText({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2 text-[14.5px] leading-[1.7] text-[var(--text-primary)]">
      {blocks.map((block, bIdx) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const inner = block.slice(3, -3).replace(/^[a-zA-Z]+\n/, "");
          return (
            <pre
              key={bIdx}
              className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-x-auto font-mono text-xs leading-relaxed"
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

function getHeroGreeting(name: string): string {
  const h = new Date().getHours();
  if (h < 6) return `夜深了，${name} 还在陪你醒着`;
  if (h < 12) return `早安，想和 ${name} 聊点什么？`;
  if (h < 18) return `下午好，找 ${name} 摸鱼还是聊正事？`;
  return `晚上好，想和 ${name} 聊点什么？`;
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
  onOpenCommandPalette,
}: ChatStageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      // Ignore clipboard failure
    }
  };

  if (!persona) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3 text-xs text-[var(--text-muted)]">
          <div className="w-7 h-7 rounded-full border-2 border-white/15 border-t-white animate-spin" />
          <span>正在连接 {`Grok`} 神经矩阵...</span>
        </div>
      </div>
    );
  }

  const modeSpec = PERSONA_MODES[activeMode] || PERSONA_MODES.authentic;
  const accentColor = persona.profile.accentColor || "#10b981";
  const isHeroEmpty = messages.length === 0 && !streaming;

  return (
    <div className="relative flex-1 flex flex-col h-screen bg-[var(--bg-primary)] min-w-0 overflow-hidden">
      {/* Subtle Per-Persona Ambient Aura */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[560px] h-[220px] rounded-full blur-[110px] opacity-[0.09] transition-all duration-700"
        style={{ background: accentColor }}
      />

      {/* Minimalist Top Bar */}
      <header className="relative z-10 px-4 md:px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/80 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="w-8 h-8 rounded-lg hover:bg-white/5 border border-[var(--border-subtle)] flex items-center justify-center text-xs text-[var(--text-secondary)]"
              title="展开角色侧边栏"
            >
              ◧
            </button>
          )}
          <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-strong)] flex items-center justify-center text-base shrink-0">
            {persona.profile.avatarEmoji || persona.name.charAt(0)}
          </div>
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-sm text-[var(--text-primary)] truncate">
              {persona.name}
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              {modeSpec.badge} {modeSpec.shortLabel}
            </span>
            <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] truncate">
              · {persona.emotionState.moodLabel || persona.emotionState.primary}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-secondary)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
            title="打开快捷指令面板 (⌘K)"
          >
            <span>切换 / 搜索</span>
            <kbd className="font-mono text-[10px] px-1 rounded bg-white/5">⌘K</kbd>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
            <span className="text-rose-400">♥</span>
            <span className="font-medium">{persona.intimacy}%</span>
          </div>

          <button
            type="button"
            onClick={() => onTriggerProactive()}
            disabled={Boolean(streaming)}
            className="px-2.5 py-1 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-secondary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
            title="让角色结合当前时段与心情主动破冰"
          >
            ⚡ 破冰
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="px-2.5 py-1 rounded-full border border-[var(--border-subtle)] hover:border-rose-500/40 text-[11px] text-[var(--text-muted)] hover:text-rose-300 transition-all"
              title="清空当前对话并回到居中大舞台"
            >
              新对话
            </button>
          )}

          <button
            type="button"
            onClick={onToggleInspector}
            className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${
              showInspector
                ? "bg-[var(--text-primary)] text-[var(--bg-primary)] border-transparent"
                : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {showInspector ? "收起状态舱" : "灵魂状态舱"}
          </button>
        </div>
      </header>

      {/* Main Content: Either Centered Grok Hero Stage OR Streaming Conversation Feed */}
      {isHeroEmpty ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-12 animate-fade-in">
          <div className="w-full max-w-2xl space-y-6">
            {/* Hero Emblem & Greeting */}
            <div className="text-center space-y-3">
              <div
                className="w-14 h-14 mx-auto rounded-full border border-[var(--border-strong)] bg-[var(--bg-secondary)] flex items-center justify-center text-2xl shadow-xl"
                style={{ boxShadow: `0 0 36px -8px ${accentColor}` }}
              >
                {persona.profile.avatarEmoji || "✦"}
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
                {getHeroGreeting(persona.name)}
              </h1>
              <p className="text-xs md:text-sm text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
                {persona.profile.bio ||
                  "五层灵魂人格已激活 · 支持实时联网冲浪、内心潜台词推演与多档尺度切换。"}
              </p>
            </div>

            {/* Centered Hero Grok Capsule Composer */}
            <GrokComposer
              variant="hero"
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
            />

            {/* Sleek Starter Suggestion Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                {
                  icon: "🌐",
                  label: "聊聊今天的热搜",
                  text: "今天全网有什么离谱热搜或科技圈新鲜事？用你的性格跟我锐评一下",
                },
                {
                  icon: "💭",
                  label: "窥探此刻心事",
                  text: "说实话，你今天看到我突然来找你，心里第一反应是什么？",
                },
                {
                  icon: "📸",
                  label: "发张随手拍",
                  text: "发张你现在手边的随手拍或者自拍给我看看呗",
                },
                {
                  icon: "🌙",
                  label: "今天累麻了",
                  text: "今天忙到头秃好累啊，快按你的脾气哄我两句",
                },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => onChangeInput(chip.text)}
                  className="px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-secondary)]/80 hover:bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5"
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="relative z-10 flex-1 overflow-y-auto px-4 md:px-8 py-6"
          >
            <div className="max-w-3xl mx-auto space-y-7">
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
                      <div className="max-w-[78%] px-4 py-2.5 rounded-[22px] rounded-tr-md bg-[var(--user-capsule)] text-[var(--user-capsule-text)] text-[14.5px] leading-relaxed shadow-sm">
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
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
                    className="group flex items-start gap-3.5 animate-fade-in"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-strong)] flex items-center justify-center text-sm shrink-0 mt-0.5">
                      {persona.profile.avatarEmoji || persona.name.charAt(0)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <ThoughtSearchTrace
                        thought={msg.thought}
                        thoughtDurationMs={msg.thoughtDurationMs}
                        searchQuery={msg.searchQuery}
                        searchResults={msg.searchResults}
                      />

                      {/* Grok Native Borderless Typography with Natural Burst Spacing */}
                      <div className="space-y-3">
                        {bursts.map((burstText, bIdx) => (
                          <GrokMarkdownText key={bIdx} content={burstText} />
                        ))}
                      </div>

                      {/* Multimodal Photo / Voice Cards */}
                      {msg.mediaCards && msg.mediaCards.length > 0 && (
                        <div className="mt-3 space-y-2 max-w-md">
                          {msg.mediaCards.map((card, cIdx) =>
                            card.type === "photo" ? (
                              <div
                                key={cIdx}
                                className="p-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-secondary)] space-y-2"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                                    <span>📸</span>
                                    <span>{persona.name} 的情境实拍</span>
                                  </span>
                                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                    MOMENT
                                  </span>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
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
                                className="w-full px-3.5 py-2.5 rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-secondary)] flex items-center justify-between gap-3 text-left transition-all"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs shrink-0">
                                    {speakingId === `${msg.id}-v-${cIdx}` ? "🔊" : "▶"}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-[var(--text-primary)]">
                                      语音条 · {card.durationSec || 5}&Prime;
                                    </div>
                                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                      {card.caption}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                                  播放
                                </span>
                              </button>
                            )
                          )}
                        </div>
                      )}

                      {/* Grok Hover & Meta Action Bar */}
                      <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] text-[var(--text-muted)]">
                        {msg.mood && (
                          <span className="text-[var(--text-secondary)]">
                            {msg.mood}
                          </span>
                        )}
                        {msg.isDemoMode && (
                          <span
                            className="px-1.5 py-0.5 rounded bg-white/5 border border-[var(--border-subtle)] text-[10px]"
                            title="当前未配置外部 API Key，由内置人格推理引擎合成，可在左栏设置接入 Grok/DeepSeek/OpenAI"
                          >
                            内置人格引擎
                          </span>
                        )}

                        <div className="flex items-center gap-2.5 opacity-80 group-hover:opacity-100 transition-opacity">
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
                      </div>

                      {/* Inline OOC Correction Box */}
                      {correctingIndex === idx && (
                        <div className="mt-2.5 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-strong)] max-w-md space-y-2 animate-fade-in">
                          <div className="text-xs font-medium text-[var(--text-primary)]">
                            纠正 {persona.name} 的表达偏差：
                          </div>
                          <input
                            type="text"
                            value={correctionText}
                            onChange={(e) => setCorrectionText(e.target.value)}
                            placeholder="例如：她不会这么客气，应该先怼我一句..."
                            className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none"
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
                              className="px-3 py-1 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] font-semibold text-xs"
                            >
                              永久记住
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Live Streaming Assistant Turn */}
              {streaming && (
                <div className="flex items-start gap-3.5 animate-fade-in">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-strong)] flex items-center justify-center text-sm shrink-0 mt-0.5">
                    {persona.profile.avatarEmoji || persona.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <ThoughtSearchTrace
                      thought={streaming.thought}
                      thoughtDurationMs={streaming.thoughtDurationMs}
                      isStreamingThought={streaming.isStreamingThought}
                      isSearching={streaming.isSearching}
                      searchQuery={streaming.searchQuery}
                      searchResults={streaming.searchResults}
                    />
                    {streaming.reply ? (
                      <div className="text-[14.5px] leading-[1.7] text-[var(--text-primary)]">
                        <span className="whitespace-pre-wrap break-words">
                          {streaming.reply}
                        </span>
                        <span className="grok-cursor" />
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 py-1">
                        <span className="w-2 h-2 rounded-full bg-[var(--text-primary)] animate-pulse-dot" />
                        <span>{persona.name} 正在输入...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Docked Bottom Grok Capsule Composer */}
          <GrokComposer
            variant="dock"
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
          />
        </>
      )}
    </div>
  );
}
