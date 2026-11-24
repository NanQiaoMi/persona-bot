"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import {
  ConversationMessage,
  MediaCard,
  PersonaMode,
  PersonaRecord,
  PersonaSummary,
  SearchResultItem,
} from "@/lib/storage/types";
import { MascotShapeId } from "./mascot-palette";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import GrokComposer from "./GrokComposer";
import PageArtifactCard from "./PageArtifactCard";
import ThoughtSearchTrace from "./ThoughtSearchTrace";

interface StreamingState {
  isSearching: boolean;
  searchQuery?: string;
  searchResults?: SearchResultItem[];
  statusText?: string;
  thought: string;
  thoughtDurationMs?: number;
  isStreamingThought: boolean;
  reply: string;
  bursts?: string[];
  mediaCards?: MediaCard[];
}

interface ChatStageProps {
  persona: PersonaRecord | null;
  personas?: PersonaSummary[];
  messages: ConversationMessage[];
  streaming: StreamingState | null;
  input: string;
  onChangeInput: (val: string) => void;
  onSend: (options?: {
    imageUrl?: string;
    requestPhoto?: boolean;
    requestSticker?: boolean;
    mentionedSlug?: string;
  }) => void;
  onQuickSend: (text: string, options?: { deepSearch?: boolean }) => void;
  onTriggerProactive: (hoursIdle?: number) => void;
  onClearHistory: () => void;
  onQuickCorrect: (msgIndex: number, reason: string) => Promise<void>;
  onRegenerate: (msgIndex: number, overrideMode?: PersonaMode) => void;
  onRelayToMaster?: (msg: ConversationMessage) => Promise<void>;
  onSelectPersona?: (slug: string) => void;
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
  onOpenAvatarPicker: () => void;
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

function GrokMessageBody({
  content,
  showCursor = false,
}: {
  content: string;
  showCursor?: boolean;
}) {
  const normalized = content.replace(/\n{3,}/g, "\n\n").trim();
  const blocks = normalized.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return (
    <div className="space-y-1.5 text-[14px] leading-[1.6] text-[var(--text-primary)]">
      {blocks.map((block, bIdx) => {
        const isLast = bIdx === blocks.length - 1;
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
            {showCursor && isLast && <span className="grok-cursor" />}
          </p>
        );
      })}
    </div>
  );
}

export default function ChatStage({
  persona,
  personas = [],
  messages,
  streaming,
  input,
  onChangeInput,
  onSend,
  onQuickSend,
  onTriggerProactive,
  onClearHistory,
  onQuickCorrect,
  onRegenerate,
  onRelayToMaster,
  onSelectPersona,
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
  onOpenAvatarPicker,
}: ChatStageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [relayedId, setRelayedId] = useState<string | null>(null);
  const [expandedReportsId, setExpandedReportsId] = useState<string | null>(null);
  const [sharedToast, setSharedToast] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{
    url: string;
    caption: string;
    kind: "photo" | "sticker";
  } | null>(null);

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
          <BlobMascot shape="circle" color="#0A0A0C" size={50} showOnlineDot state="thinking" />
          <span>正在连接 PersonaBot...</span>
        </div>
      </div>
    );
  }

  const mascotCfg = getMascotConfigForPersona(persona.slug, persona.profile);
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
      {/* Subtle Ambient Mascot Glow behind Floating Header */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-44 rounded-full blur-3xl opacity-[0.07] dark:opacity-[0.12] transition-colors duration-700"
        style={{ backgroundColor: mascotCfg.color }}
      />
      {/* Frosted Floating Header */}
      <header className="relative z-20 px-4 md:px-6 pt-3.5 pb-3 flex items-center justify-between grok-glass-header backdrop-blur-xl pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 min-w-[84px]">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all"
              title="展开侧边栏"
            >
              ◧
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="px-3.5 py-1.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill text-[11.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:-translate-y-0.5 transition-all"
              title="清空当前对话"
            >
              新对话
            </button>
          )}
        </div>

        {/* Center Floating Pill with Living BlobMascot */}
        <button
          type="button"
          onClick={onToggleInspector}
          className="pointer-events-auto inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
          title="点击滑出/收起角色灵魂状态舱"
        >
          <BlobMascot
            shape={mascotCfg.shape}
            color={mascotCfg.color}
            image={mascotCfg.image}
            size={24}
            trackPointer
            state={streaming ? "working" : "idle"}
          />
          <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">
            {persona.name}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {showInspector ? "✕" : `♥ ${persona.intimacy}%`}
          </span>
        </button>

        {/* Right Floating Share Pill */}
        <div className="pointer-events-auto flex items-center justify-end gap-2 min-w-[84px]">
          <button
            type="button"
            onClick={handleShare}
            className="px-4 py-1.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
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
            /* Pure Flat Apple-Grade Empty State with Click-to-Customize Living Mascot */
            <div className="pt-10 pb-8 flex flex-col items-center text-center space-y-6 animate-fade-in">
              <button
                type="button"
                onClick={onOpenAvatarPicker}
                className="group/hero relative flex flex-col items-center justify-center focus:outline-none"
                title="点击更换角色形状与颜色"
              >
                <div className="animate-float-gentle">
                  <BlobMascot
                    shape={mascotCfg.shape}
                    color={mascotCfg.color}
                    image={mascotCfg.image}
                    size={84}
                    trackPointer
                  />
                </div>
                <span className="mt-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[10.5px] text-[var(--text-muted)] opacity-0 group-hover/hero:opacity-100 transition-opacity">
                  点击定制形状与颜色
                </span>
              </button>

              <div className="space-y-2 max-w-md">
                <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  {persona.name}
                </h2>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {persona.profile.bio ||
                    "支持 DeepSearch 实时联网生成结构化页面、Think 内心潜台词与多档人格模式。"}
                </p>
                <div className="pt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
                  <span>
                    {modeSpec.badge} {modeSpec.shortLabel}
                  </span>
                  <span className="opacity-40">·</span>
                  <span>♥ 亲密度 {persona.intimacy}%</span>
                  <span className="opacity-40">·</span>
                  <span>{persona.emotionState.moodLabel || "在线"}</span>
                </div>
              </div>

              {/* 4 One-Click Interactive Starter Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl pt-1">
                {(persona.isMaster || persona.slug === "master-bot"
                  ? [
                      {
                        icon: "🧩",
                        badgeBg: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
                        title: "全军协同调研今日科技动态",
                        sub: "同时调度 3 个子 Bot 分头查证并汇总报告",
                        text: "请帮我调度大家分头梳理今天最值得关注的 AI 工具与开源动态，分别汇报关键亮点和待核查项",
                        enableSearch: true,
                      },
                      {
                        icon: "📋",
                        badgeBg:
                          "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
                        title: "让 艾拉 和 Zero 联合分析",
                        sub: "跨 Bot 观点碰撞 + 汇总执行明细",
                        text: "让 艾拉 和 Zero 帮我分析一下现在做个人 AI 助手最容易踩的 3 个坑，并给出可执行建议",
                        enableSearch: false,
                      },
                      {
                        icon: "🔍",
                        badgeBg:
                          "bg-purple-500/12 text-purple-600 dark:text-purple-300",
                        title: "开启联网核查追踪清单",
                        sub: "触发 DeepSearch 并记录覆盖来源",
                        text: "帮我联网核查 GitHub 上最近热门的开源 Agent 项目，保留来源并标注未覆盖项",
                        enableSearch: true,
                      },
                      {
                        icon: "⚡",
                        badgeBg:
                          "bg-rose-500/12 text-rose-600 dark:text-rose-300",
                        title: "检查全部子 Bot 当前状态",
                        sub: "拉取团队成员最新工作记忆摘要",
                        text: "向所有助手确认目前各自的专长与工作状态，给我一份简洁的总控状态简报",
                        enableSearch: false,
                      },
                    ]
                  : [
                      {
                        icon: "📊",
                        badgeBg: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
                        title: "联网整理今日热搜清单",
                        sub: "一键触发 DeepSearch + 内嵌「页面」卡片",
                        text: "帮我联网整理一下今天全网最值得聊的科技圈热搜清单，用你的性格锐评一下",
                        enableSearch: true,
                      },
                      {
                        icon: "💭",
                        badgeBg:
                          "bg-purple-500/12 text-purple-600 dark:text-purple-300",
                        title: "看看你此刻真实的内心 OS",
                        sub: "触发 Think 潜台词时间轴推演",
                        text: "说实话，你现在看到我打开这个窗口，心里第一反应是什么？",
                        enableSearch: false,
                      },
                      {
                        icon: "📸",
                        badgeBg:
                          "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
                        title: "发张你那边的随手拍",
                        sub: "生成角色实时情境镜头卡片",
                        text: "发张你现在手边的随手拍给我看看呗",
                        enableSearch: false,
                      },
                      {
                        icon: "🌙",
                        badgeBg:
                          "bg-rose-500/12 text-rose-600 dark:text-rose-300",
                        title: "忙完了一天，求安慰",
                        sub: "体验多段短句连发与情绪共鸣",
                        text: "今天工作累麻了，快按你的脾气哄我两句",
                        enableSearch: false,
                      },
                    ]
                ).map((chip) => (
                  <button
                    key={chip.title}
                    type="button"
                    onClick={() =>
                      onQuickSend(chip.text, { deepSearch: chip.enableSearch })
                    }
                    className="group/chip p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 text-left transition-all duration-200 flex items-start gap-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 ${chip.badgeBg}`}
                    >
                      {chip.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-[var(--text-primary)] flex items-center justify-between gap-1">
                        <span className="truncate">{chip.title}</span>
                        <span className="text-[var(--text-muted)] opacity-0 group-hover/chip:opacity-100 group-hover/chip:translate-x-0.5 transition-all">
                          →
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                        {chip.sub}
                      </div>
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
                  <BlobMascot
                    shape={mascotCfg.shape}
                    color={mascotCfg.color}
                    image={mascotCfg.image}
                    size={16}
                    animated={false}
                    trackPointer={false}
                  />
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
                      className="flex flex-col items-end animate-msg-user"
                    >
                      {msg.imageUrl && (
                        <div className="mb-2 rounded-2xl overflow-hidden border border-[var(--border-strong)] max-w-xs shadow-sm">
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
                const isMasterView =
                  Boolean(persona.isMaster) || persona.slug === "master-bot";
                const reports = msg.interBotReports || [];
                const reportsOpen = expandedReportsId === msg.id;
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const nextMsg =
                  idx < messages.length - 1 ? messages[idx + 1] : null;
                const isContinuation = Boolean(
                  prevMsg &&
                    prevMsg.role === "assistant" &&
                    (prevMsg.fromBot?.slug || "") === (msg.fromBot?.slug || "")
                );
                const hasNextAssistant = Boolean(
                  nextMsg &&
                    nextMsg.role === "assistant" &&
                    (nextMsg.fromBot?.slug || "") === (msg.fromBot?.slug || "")
                );
                const isIntermediate =
                  hasNextAssistant &&
                  !msg.mediaCards?.length &&
                  !msg.pageCard &&
                  correctingIndex !== idx;

                return (
                  <div
                    key={msg.id || `${msg.timestamp}-${idx}`}
                    className={`group flex flex-col items-start animate-msg-ai w-full ${
                      isContinuation ? "-mt-3" : ""
                    }`}
                  >
                    {/* Inter-Bot "N 条消息往来：" Compact Overlapping Chip Bar */}
                    {reports.length > 0 && (
                      <div className="w-full mb-2.5 flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReportsId(reportsOpen ? null : msg.id)
                          }
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full hover:bg-[var(--bg-secondary)] text-[12px] text-[var(--text-secondary)] transition-colors cursor-pointer"
                        >
                          <span>{reports.length} 条消息往来：</span>
                          <span className="inline-flex items-center -space-x-1.5">
                            {reports.slice(0, 4).map((rep) => (
                              <span
                                key={rep.slug}
                                className="inline-flex rounded-full ring-2 ring-[var(--bg-primary)]"
                              >
                                <BlobMascot
                                  shape={
                                    (rep.shape as MascotShapeId) || "circle"
                                  }
                                  color={rep.color || "#1683FF"}
                                  size={16}
                                  trackPointer={false}
                                  animated={false}
                                />
                              </span>
                            ))}
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">
                            {reports.length} 个 Bot
                          </span>
                        </button>

                        {reportsOpen && (
                          <div className="mt-2 w-full max-w-[660px] rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-composer)] p-3 space-y-2 animate-fade-in">
                            {reports.map((rep) => (
                              <div
                                key={`${msg.id}-${rep.slug}`}
                                className="p-2.5 rounded-xl bg-[var(--bg-secondary)] flex items-start gap-2.5 text-xs"
                              >
                                <BlobMascot
                                  shape={
                                    (rep.shape as MascotShapeId) || "circle"
                                  }
                                  color={rep.color || "#1683FF"}
                                  size={20}
                                  trackPointer={false}
                                  animated={false}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-[var(--text-primary)]">
                                      {rep.name}
                                    </span>
                                    {onSelectPersona && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onSelectPersona(rep.slug)
                                        }
                                        className="text-[11px] text-[#2563EB] hover:underline cursor-pointer"
                                      >
                                        前往频道 →
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                    {rep.summary}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Incoming Relay Header ("消息来自 [mini mascot] {name}") */}
                    {msg.fromBot && !isContinuation && (
                      <div className="w-full mb-2.5 flex flex-col items-center gap-2">
                        <div className="w-full flex items-center gap-3 text-[11px] text-[#2563EB]">
                          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                          <span>新</span>
                          <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                          <span>消息来自</span>
                          <BlobMascot
                            shape={
                              (msg.fromBot.shape as MascotShapeId) || "circle"
                            }
                            color={msg.fromBot.color || "#1683FF"}
                            size={16}
                            trackPointer={false}
                            animated={false}
                          />
                          <button
                            type="button"
                            onClick={() => onSelectPersona?.(msg.fromBot!.slug)}
                            className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            {msg.fromBot.name}
                          </button>
                        </div>
                      </div>
                    )}

                    <ThoughtSearchTrace
                      thought={msg.thought}
                      thoughtDurationMs={msg.thoughtDurationMs}
                      searchQuery={msg.searchQuery}
                      searchResults={msg.searchResults}
                    />

                    {/* Multi-Bubble IM Style Grok Bot Reply Stack */}
                    <div className="flex flex-col items-start gap-1.5 w-full">
                      {bursts.map((burstText, bIdx) => (
                        <div
                          key={bIdx}
                          className="max-w-[86%] sm:max-w-[580px] rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] px-4 py-2.5 animate-msg-spring"
                        >
                          <GrokMessageBody content={burstText} />
                        </div>
                      ))}
                    </div>

                    {/* Elevated White Interactive "Page" Artifact Card */}
                    {msg.pageCard && <PageArtifactCard card={msg.pageCard} />}

                    {/* Multimodal Sticker / Photo / Voice Cards */}
                    {msg.mediaCards && msg.mediaCards.length > 0 && (
                      <div className="mt-2.5 space-y-2.5 w-full max-w-md">
                        {msg.mediaCards.map((card, cIdx) => {
                          if (card.type === "sticker") {
                            if (card.imageUrl) {
                              return (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() =>
                                    setLightboxMedia({
                                      url: card.imageUrl!,
                                      caption: card.caption,
                                      kind: "sticker",
                                    })
                                  }
                                  title={card.caption}
                                  className="group/sticker inline-block rounded-2xl overflow-hidden bg-[var(--bg-composer)] border border-[var(--border-subtle)] p-1.5 shadow-sm hover:scale-[1.03] transition-transform cursor-pointer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={card.imageUrl}
                                    alt={card.caption}
                                    className="w-36 h-36 rounded-xl object-contain"
                                  />
                                </button>
                              );
                            }

                            if (card.status === "generating") {
                              return (
                                <div
                                  key={cIdx}
                                  className="w-40 h-36 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] flex flex-col items-center justify-center gap-2 p-3 text-center animate-fade-in"
                                >
                                  <BlobMascot
                                    shape={mascotCfg.shape}
                                    color={mascotCfg.color}
                                    size={30}
                                    trackPointer={false}
                                    state="working"
                                  />
                                  <span className="text-[11px] font-medium animate-text-shimmer">
                                    正在绘制表情包...
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={cIdx}
                                className="inline-flex flex-col gap-1 px-3.5 py-2.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] text-xs"
                              >
                                <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                                  <span>🎭</span>
                                  <span>表情包：{card.caption}</span>
                                </div>
                                {card.errorHint && (
                                  <span className="text-[11px] text-[var(--text-muted)]">
                                    {card.errorHint}
                                  </span>
                                )}
                              </div>
                            );
                          }

                          if (card.type === "photo") {
                            return (
                              <div
                                key={cIdx}
                                className="rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card overflow-hidden"
                              >
                                {card.imageUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxMedia({
                                        url: card.imageUrl!,
                                        caption: card.caption,
                                        kind: "photo",
                                      })
                                    }
                                    className="block w-full overflow-hidden bg-black/5 cursor-pointer"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={card.imageUrl}
                                      alt={card.caption}
                                      className="w-full max-h-72 object-cover hover:scale-[1.02] transition-transform"
                                    />
                                  </button>
                                ) : card.status === "generating" ? (
                                  <div className="h-44 w-full bg-[var(--bg-secondary)] flex flex-col items-center justify-center gap-2.5 animate-fade-in">
                                    <BlobMascot
                                      shape={mascotCfg.shape}
                                      color={mascotCfg.color}
                                      size={34}
                                      trackPointer={false}
                                      state="working"
                                    />
                                    <span className="text-xs font-medium animate-text-shimmer">
                                      正在使用 {card.model || "gpt-image-2.6"} 生成实拍图...
                                    </span>
                                  </div>
                                ) : null}
                                <div className="p-3.5 space-y-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-[var(--text-primary)]">
                                      📸 {persona.name} 的情境实拍
                                    </span>
                                    <span className="text-[10px] text-[var(--text-muted)]">
                                      {card.model || "MOMENT"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed">
                                    &ldquo;{card.caption}&rdquo;
                                  </p>
                                  {card.errorHint && !card.imageUrl && (
                                    <p className="text-[11px] text-[var(--text-muted)] pt-0.5">
                                      {card.errorHint}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() =>
                                speakMessage(`${msg.id}-v-${cIdx}`, card.caption)
                              }
                              className="w-full px-3.5 py-2.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-between gap-3 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
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
                          );
                        })}
                      </div>
                    )}

                    {/* Subtle Hover Action Row */}
                    <div
                      className={
                        isIntermediate
                          ? "h-0 overflow-hidden opacity-0 group-hover:h-auto group-hover:mt-1.5 group-hover:opacity-100 px-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)] transition-opacity"
                          : "mt-1.5 px-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)] opacity-75 group-hover:opacity-100 transition-opacity"
                      }
                    >
                      {msg.mood && <span>{msg.mood}</span>}
                      {msg.isFollowup && (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">
                          主动追发
                        </span>
                      )}
                      {msg.modelUsed && (
                        <span className="px-1.5 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] text-[10px] font-mono">
                          {msg.modelUsed}
                        </span>
                      )}
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
                      {!isMasterView && onRelayToMaster && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onRelayToMaster(msg);
                            setRelayedId(msg.id);
                            setTimeout(() => setRelayedId(null), 2000);
                          }}
                          className="hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          {relayedId === msg.id ? "✓ 已汇报给主 Bot" : "↗ 汇报给主 Bot"}
                        </button>
                      )}
                    </div>

                    {/* Inline Correction Popover */}
                    {correctingIndex === idx && (
                      <div className="mt-2 p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-strong)] grok-floating-card w-full max-w-md space-y-2 animate-msg-spring">
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

              {/* Live Streaming Turn with Animated Thinking Mascot */}
              {streaming && (
                <div
                  className={`flex flex-col items-start animate-msg-ai ${
                    messages[messages.length - 1]?.role === "assistant"
                      ? "-mt-3"
                      : ""
                  }`}
                >
                  <ThoughtSearchTrace
                    thought={streaming.thought}
                    thoughtDurationMs={streaming.thoughtDurationMs}
                    isStreamingThought={streaming.isStreamingThought}
                    isSearching={streaming.isSearching}
                    searchQuery={streaming.searchQuery}
                    searchResults={streaming.searchResults}
                  />
                  {streaming.reply ? (
                    <div className="flex flex-col items-start gap-1.5 w-full">
                      {(streaming.bursts && streaming.bursts.length > 0
                        ? streaming.bursts
                        : [streaming.reply]
                      ).map((bText, bIdx, arr) => (
                        <div
                          key={bIdx}
                          className="max-w-[86%] sm:max-w-[580px] rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] px-4 py-2.5 animate-msg-ai"
                        >
                          <GrokMessageBody
                            content={bText}
                            showCursor={bIdx === arr.length - 1}
                          />
                        </div>
                      ))}
                      {streaming.statusText && (
                        <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-[18px] rounded-tl-md bg-[var(--bg-bubble-ai)] border border-[var(--border-subtle)] animate-fade-in">
                          <BlobMascot
                            shape={mascotCfg.shape}
                            color={mascotCfg.color}
                            image={mascotCfg.image}
                            size={20}
                            trackPointer
                            state="working"
                          />
                          <div className="flex items-center gap-1" aria-hidden="true">
                            <span className="typing-dot" />
                            <span className="typing-dot typing-dot-2" />
                            <span className="typing-dot typing-dot-3" />
                          </div>
                          <span className="text-[12px] font-medium animate-text-shimmer">
                            {streaming.statusText}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] border border-[var(--border-subtle)] animate-fade-in">
                      <BlobMascot
                        shape={mascotCfg.shape}
                        color={mascotCfg.color}
                        image={mascotCfg.image}
                        size={24}
                        trackPointer
                        state="working"
                      />
                      <div className="flex items-center gap-1" aria-hidden="true">
                        <span className="typing-dot" />
                        <span className="typing-dot typing-dot-2" />
                        <span className="typing-dot typing-dot-3" />
                      </div>
                      <span className="text-[12.5px] font-medium animate-text-shimmer">
                        {streaming.statusText ||
                          (streaming.isSearching
                            ? `正在搜索 ${streaming.searchQuery || "全网信息"}...`
                            : `${persona.name} 正在输入...`)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image / Sticker Lightbox Preview */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md p-6 animate-fade-in"
          onClick={() => setLightboxMedia(null)}
        >
          <div
            className="relative max-w-2xl w-full flex flex-col items-center gap-3 animate-popover-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxMedia.url}
              alt={lightboxMedia.caption}
              className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain bg-white/5"
            />
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-black/60 text-white text-xs">
              <span className="max-w-md truncate">{lightboxMedia.caption}</span>
              <a
                href={lightboxMedia.url}
                download
                className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 font-medium"
              >
                下载原图
              </a>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                className="px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Capsule Composer */}
      <GrokComposer
        personaName={persona.name}
        accentColor={mascotCfg.color}
        personas={personas}
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
