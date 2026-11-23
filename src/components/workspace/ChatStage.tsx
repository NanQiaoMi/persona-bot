"use client";

import { useEffect, useRef, useState } from "react";
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
  thinkMode: boolean;
  onToggleThink: () => void;
  deepSearch: boolean;
  onToggleDeepSearch: () => void;
  activeMode: PersonaMode;
  onChangeMode: (mode: PersonaMode) => void;
  showInspector: boolean;
  onToggleInspector: () => void;
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
  thinkMode,
  onToggleThink,
  deepSearch,
  onToggleDeepSearch,
  activeMode,
  onChangeMode,
  showInspector,
  onToggleInspector,
}: ChatStageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);

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

  if (!persona) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3 text-xs text-[var(--text-muted)]">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
          <span>正在唤醒角色灵魂与 Grok 大脑...</span>
        </div>
      </div>
    );
  }

  const modeSpec = PERSONA_MODES[activeMode] || PERSONA_MODES.authentic;

  return (
    <div className="flex-1 flex flex-col h-screen bg-[var(--bg-primary)] min-w-0">
      {/* Top Status Bar */}
      <header className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/80 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-strong)] flex items-center justify-center text-xl shrink-0">
            {persona.profile.avatarEmoji || persona.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-sm text-[var(--text-primary)] truncate">
                {persona.name}
              </h2>
              {persona.profile.mbti && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                  {persona.profile.mbti}
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                {persona.emotionState.moodLabel || persona.emotionState.primary}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                {modeSpec.badge} {modeSpec.shortLabel}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
              {persona.profile.bio || "五层人格与实时全能大脑已就绪"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Intimacy Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs">
            <span className="text-rose-400">♥</span>
            <div className="w-16 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${persona.intimacy}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold">{persona.intimacy}%</span>
          </div>

          <button
            type="button"
            onClick={() => onTriggerProactive()}
            disabled={Boolean(streaming)}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-all"
            title="让角色根据当前时间与情绪主动找你破冰"
          >
            ⚡ 主动破冰
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-rose-500/15 text-[var(--text-secondary)] hover:text-rose-300 border border-[var(--border-subtle)] text-xs transition-all"
              title="清空当前对话记录"
            >
              清空
            </button>
          )}

          <button
            type="button"
            onClick={onToggleInspector}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              showInspector
                ? "bg-[var(--bg-tertiary)] border-emerald-500/40 text-emerald-300"
                : "bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
            }`}
          >
            {showInspector ? "隐藏状态舱" : "状态舱 面板"}
          </button>
        </div>
      </header>

      {/* Messages Stream Stage */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5"
      >
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Empty State / Grok Starter Deck */}
          {messages.length === 0 && !streaming && (
            <div className="py-12 px-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 text-center space-y-5 animate-fade-in">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-strong)] flex items-center justify-center text-3xl shadow-lg">
                {persona.profile.avatarEmoji || "⚡"}
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  与 {persona.name} 开启 Grok 级沉浸对话
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {persona.profile.bio ||
                    "支持 DeepSearch 实时联网聊热搜、Think 窥探角色真实内心潜台词、4 档人格模式随时切换。"}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl mx-auto pt-2">
                {[
                  "🌐 今天全网有什么离谱热搜或新鲜事？用你的性格跟我锐评一下",
                  "💭 说实话，你今天看到我找你聊天，心里第一反应是什么？",
                  "📸 发张你现在手边的随手拍或者自拍看看呗",
                  "🌙 我今天工作累麻了，快按你的方式哄我两句",
                ].map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => onChangeInput(promptText.replace(/^[^\s]+\s/, ""))}
                    className="px-3.5 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-emerald-500/15 border border-[var(--border-subtle)] hover:border-emerald-500/40 text-xs text-[var(--text-secondary)] hover:text-emerald-300 transition-all text-left"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rendered Conversation Messages */}
          {messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            const bursts =
              !isUser && msg.bursts && msg.bursts.length > 0
                ? msg.bursts
                : [msg.content];

            return (
              <div
                key={msg.id || `${msg.timestamp}-${idx}`}
                className={`flex ${
                  isUser ? "justify-end" : "justify-start"
                } animate-fade-in`}
              >
                {!isUser && (
                  <div className="w-9 h-9 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center text-base mr-3 shrink-0 mt-1">
                    {persona.profile.avatarEmoji || persona.name.charAt(0)}
                  </div>
                )}

                <div className={`max-w-[82%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Assistant DeepSearch & Inner Monologue Trace */}
                  {!isUser && (
                    <ThoughtSearchTrace
                      thought={msg.thought}
                      searchQuery={msg.searchQuery}
                      searchResults={msg.searchResults}
                    />
                  )}

                  {/* User Uploaded Image */}
                  {isUser && msg.imageUrl && (
                    <div className="mb-2 rounded-2xl overflow-hidden border border-[var(--border-strong)] max-w-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.imageUrl}
                        alt="用户上传图片"
                        className="w-full max-h-56 object-cover"
                      />
                    </div>
                  )}

                  {/* Burst Bubbles */}
                  <div className="space-y-1.5">
                    {bursts.map((burstText, bIdx) => (
                      <div
                        key={bIdx}
                        className={`relative group px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                          isUser
                            ? "bg-emerald-500 text-slate-950 font-medium rounded-tr-sm"
                            : "bg-[var(--ai-bubble)] text-[var(--ai-bubble-text)] border border-[var(--border-subtle)] rounded-tl-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{burstText}</p>
                      </div>
                    ))}
                  </div>

                  {/* Multimodal Photo / Voice Cards */}
                  {!isUser && msg.mediaCards && msg.mediaCards.length > 0 && (
                    <div className="mt-2 space-y-2 w-full max-w-md">
                      {msg.mediaCards.map((card, cIdx) =>
                        card.type === "photo" ? (
                          <div
                            key={cIdx}
                            className="p-3.5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-[var(--bg-secondary)] to-purple-950/30 space-y-2"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                                <span>📸</span>
                                <span>{persona.name} 的实时情境镜头</span>
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                LIVE SNAPSHOT
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-primary)] leading-relaxed italic">
                              &ldquo;{card.caption}&rdquo;
                            </p>
                          </div>
                        ) : (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => speakMessage(`${msg.id}-v-${cIdx}`, card.caption)}
                            className="w-full px-3.5 py-2.5 rounded-2xl border border-sky-500/30 bg-sky-950/20 hover:bg-sky-950/35 flex items-center justify-between gap-3 text-left transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-xs shrink-0">
                                {speakingId === `${msg.id}-v-${cIdx}` ? "🔊" : "▶️"}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-sky-300">
                                  语音条 · {card.durationSec || 5}&Prime;
                                </div>
                                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                  {card.caption}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] text-sky-400 shrink-0">
                              点击播放
                            </span>
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* Footer Meta & Actions (Time, Mood, TTS Play, OOC Correct) */}
                  <div className="flex items-center gap-2.5 mt-1 px-1 text-[10px] text-[var(--text-muted)]">
                    <span>
                      {msg.timestamp
                        ? new Date(msg.timestamp).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                    {!isUser && msg.mood && (
                      <span className="text-emerald-400/90">· {msg.mood}</span>
                    )}
                    {!isUser && msg.isDemoMode && (
                      <span
                        className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        title="当前未配置外部大模型 API Key，由内置人格推理引擎生成，可在左栏设置中接入 Grok/DeepSeek/OpenAI"
                      >
                        内置人格引擎
                      </span>
                    )}
                    {!isUser && (
                      <>
                        <button
                          type="button"
                          onClick={() => speakMessage(msg.id, msg.content)}
                          className="hover:text-sky-400 transition-colors"
                          title="朗读这条回复"
                        >
                          {speakingId === msg.id ? "🔊 播报中" : "🔈 听语音"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectingIndex(
                              correctingIndex === idx ? null : idx
                            );
                            setCorrectionText("");
                          }}
                          className="hover:text-emerald-400 transition-colors"
                        >
                          ✎ 纠偏人设
                        </button>
                      </>
                    )}
                  </div>

                  {/* Inline Correction Popover */}
                  {!isUser && correctingIndex === idx && (
                    <div className="mt-2 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-strong)] w-full max-w-md space-y-2 animate-fade-in">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        觉得这句话不像 {persona.name}？写下纠偏规则：
                      </div>
                      <input
                        type="text"
                        value={correctionText}
                        onChange={(e) => setCorrectionText(e.target.value)}
                        placeholder="例如：她不会这么客气，应该先损我一句..."
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCorrectingIndex(null)}
                          className="px-2.5 py-1 rounded text-xs text-[var(--text-muted)]"
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
                          className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs"
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
            <div className="flex justify-start animate-fade-in">
              <div className="w-9 h-9 rounded-xl bg-[var(--bg-tertiary)] border border-emerald-500/40 flex items-center justify-center text-base mr-3 shrink-0 mt-1">
                {persona.profile.avatarEmoji || persona.name.charAt(0)}
              </div>
              <div className="max-w-[82%] flex flex-col">
                <ThoughtSearchTrace
                  thought={streaming.thought}
                  isStreamingThought={streaming.isStreamingThought}
                  isSearching={streaming.isSearching}
                  searchQuery={streaming.searchQuery}
                  searchResults={streaming.searchResults}
                />
                {streaming.reply ? (
                  <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm bg-[var(--ai-bubble)] text-[var(--ai-bubble-text)] border border-emerald-500/30 text-sm leading-relaxed">
                    <p className="whitespace-pre-wrap">{streaming.reply}</p>
                  </div>
                ) : (
                  <div className="px-4 py-2.5 rounded-2xl bg-[var(--ai-bubble)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>{persona.name} 正在组织语言...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Grok Capsule Composer */}
      <GrokComposer
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
    </div>
  );
}
