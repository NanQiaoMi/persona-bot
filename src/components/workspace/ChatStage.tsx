"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import {
  ConversationMessage,
  MediaCard,
  PersonaMode,
  PersonaRecord,
  GroupChat,
  PersonaSummary,
  SearchResultItem,
} from "@/lib/storage/types";
import { MascotShapeId } from "./mascot-palette";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import GrokComposer from "./GrokComposer";
import {
  GroupMessageRow,
  GroupSystemTip,
  GroupTypingRow,
  NewMessagesDivider,
} from "./GroupMessageRow";
import PageArtifactCard from "./PageArtifactCard";
import SaveSceneAssetButton from "./SaveSceneAssetButton";
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
  onStopStreaming?: () => void;
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
  onSetReferencePhoto?: (imageUrl: string) => Promise<void>;
  isRefiningReference?: boolean;
  onRefineReferencePortrait?: (sourceImageUrl: string) => Promise<void>;
  /** 当前打开的群聊（挂在主 bot 下）；为空表示普通单聊 */
  activeGroup?: GroupChat | null;
  onOpenGroup?: (groupId: string) => void;
  onExitGroup?: () => void;
  /** 群聊：谁正在输入（自发闲聊播放时由外部设置） */
  groupTyping?: { slug: string; name: string } | null;
  /** 群聊：从这条消息开始是你还没看过的（显示「以下为新消息」） */
  newMessagesFromId?: string | null;
  /** 你切走期间还在生成的回复：切回来后显示「XX 正在输入…」直到写完 */
  backgroundTypingName?: string | null;
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

function formatSmartImTimestamp(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const timePart = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const targetDayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  if (targetDayStart === todayStart) return `今天 ${timePart}`;
  if (targetDayStart === yesterdayStart) return `昨天 ${timePart}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timePart}`;
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
  onStopStreaming,
  onQuickCorrect,
  onSelectPersona,
  activeGroup,
  onOpenGroup,
  onExitGroup,
  groupTyping,
  newMessagesFromId,
  backgroundTypingName,
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
  onSetReferencePhoto,
  isRefiningReference = false,
  onRefineReferencePortrait,
}: ChatStageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const dragCounterRef = useRef(0);
  const confirmClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [droppedImage, setDroppedImage] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [expandedReportsId, setExpandedReportsId] = useState<string | null>(null);
  const [sharedToast, setSharedToast] = useState(false);
  // 聊天气泡右键「不像 TA」快捷纠偏
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState("");
  const [correctionState, setCorrectionState] = useState<"idle" | "saving" | "done">("idle");
  const [lightboxMedia, setLightboxMedia] = useState<{
    url: string;
    caption: string;
    kind: "photo" | "sticker";
  } | null>(null);

  useEffect(() => {
    return () => {
      if (confirmClearTimerRef.current) {
        clearTimeout(confirmClearTimerRef.current);
      }
    };
  }, []);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDroppedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= 120;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom && messages.length > 0);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streaming]);

  useEffect(() => {
    if (correctingIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCorrectingIdx(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [correctingIdx]);

  const submitCorrection = async (msgIdx: number, reason: string) => {
    const text = reason.trim();
    if (!text || correctionState === "saving") return;
    setCorrectionState("saving");
    try {
      await onQuickCorrect(msgIdx, text);
      setCorrectionState("done");
      setTimeout(() => {
        setCorrectingIdx(null);
        setCorrectionState("idle");
        setCorrectionDraft("");
      }, 1200);
    } catch {
      setCorrectionState("idle");
    }
  };

  useEffect(() => {
    if (!lightboxMedia) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxMedia(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxMedia]);

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
  // 群聊：成员名（用于 @ 高亮）、头像图片、按名字找人（「X 正在输入」）
  const groupMembers = activeGroup
    ? (personas || []).filter((p) => activeGroup.memberSlugs.includes(p.slug))
    : [];
  const groupMemberNames = groupMembers.flatMap((p) => [p.name, p.name.split(/\s+/)[0]]);
  const groupAvatarImageOf = (slug: string) =>
    groupMembers.find((p) => p.slug === slug)?.profile.avatarImage;
  const groupTypingMember = (() => {
    if (!activeGroup) return null;
    if (groupTyping) return groupMembers.find((p) => p.slug === groupTyping.slug) || null;
    const name = streaming?.statusText?.match(/^(.+?)\s*正在输入/)?.[1]?.trim();
    return name ? groupMembers.find((p) => p.name === name) || null : null;
  })();
  const modeSpec = PERSONA_MODES[activeMode] || PERSONA_MODES.authentic;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFile}
      className="relative flex-1 flex flex-col h-screen bg-[var(--bg-primary)] min-w-0 overflow-hidden"
    >
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-3 z-40 rounded-3xl border-2 border-dashed border-[#18a999] bg-[var(--bg-elevated)]/85 backdrop-blur-md flex flex-col items-center justify-center gap-2 animate-fade-in">
          <span className="text-3xl">🖼️</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            松手即可发送图片给 {persona.name}
          </span>
        </div>
      )}
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
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  if (confirmClearTimerRef.current) {
                    clearTimeout(confirmClearTimerRef.current);
                  }
                  confirmClearTimerRef.current = setTimeout(() => {
                    setConfirmClear(false);
                  }, 3000);
                  return;
                }
                if (confirmClearTimerRef.current) {
                  clearTimeout(confirmClearTimerRef.current);
                }
                setConfirmClear(false);
                onClearHistory();
              }}
              className={`px-3.5 py-1.5 rounded-full border grok-floating-pill text-[11.5px] font-medium hover:-translate-y-0.5 transition-all cursor-pointer ${
                confirmClear
                  ? "bg-rose-500/12 border-rose-500/40 text-rose-500"
                  : "bg-[var(--bg-composer)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              title={confirmClear ? "再次点击确认清空当前对话" : "清空当前对话"}
            >
              {confirmClear ? "确认清空？" : "新对话"}
            </button>
          )}
        </div>

        {/* Center Floating Pill with Living BlobMascot（群聊时显示群名与成员） */}
        {activeGroup ? (
          <div className="pointer-events-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill">
            <button
              type="button"
              onClick={onExitGroup}
              className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1"
              title="返回主 bot"
              aria-label="返回主 bot"
            >
              ‹
            </button>
            <span className="text-[13.5px] font-semibold text-[var(--text-primary)] max-w-[180px] truncate">
              {activeGroup.name}
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {streaming ? (
                <span className="animate-text-shimmer font-medium">
                  {streaming.statusText || "群里有人在输入..."}
                </span>
              ) : (
                `${activeGroup.memberSlugs.length + 1} 人`
              )}
            </span>
          </div>
        ) : (
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
            {showInspector ? (
              "✕"
            ) : streaming ? (
              <span className="animate-text-shimmer font-medium">
                对方正在输入...
              </span>
            ) : (
              `♥ ${persona.intimacy}%`
            )}
          </span>
        </button>
        )}

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
        onScroll={handleScroll}
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
                        title: "让 鹿汐 和 陈野 联合分析",
                        sub: "跨 Bot 观点碰撞 + 汇总执行明细",
                        text: "让 鹿汐 和 陈野 帮我分析一下现在做个人 AI 助手最容易踩的 3 个坑，并给出可执行建议",
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
                        title: "聊聊今天的热门新鲜事",
                        sub: "实时翻一翻网上的最新动态给你锐评",
                        text: "帮我联网整理一下今天全网最值得聊的科技圈热搜清单，用你的性格锐评一下",
                        enableSearch: true,
                      },
                      {
                        icon: "💭",
                        badgeBg:
                          "bg-purple-500/12 text-purple-600 dark:text-purple-300",
                        title: "说说你现在心里在想啥",
                        sub: "听听 TA 没直说出口的真实小想法",
                        text: "说实话，你现在看到我打开这个窗口，心里第一反应是什么？",
                        enableSearch: false,
                      },
                      {
                        icon: "📸",
                        badgeBg:
                          "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
                        title: "发张你那边的随手拍",
                        sub: "看看 TA 此刻身边的日常画面",
                        text: "发张你现在手边的随手拍给我看看呗",
                        enableSearch: false,
                      },
                      {
                        icon: "🌙",
                        badgeBg:
                          "bg-rose-500/12 text-rose-600 dark:text-rose-300",
                        title: "忙完了一天，求安慰",
                        sub: "听几句贴合 TA 脾气的连环宽慰",
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
            <div className="space-y-5 pt-1">
              {messages.map((msg, idx) => {
                const isUser = msg.role === "user";
                const bursts =
                  !isUser && msg.bursts && msg.bursts.length > 0
                    ? msg.bursts
                    : [msg.content];
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const prevTs = prevMsg?.timestamp
                  ? new Date(prevMsg.timestamp).getTime()
                  : 0;
                const currTs = msg.timestamp
                  ? new Date(msg.timestamp).getTime()
                  : 0;
                const showTimeDivider =
                  idx === 0 ||
                  (prevTs > 0 &&
                    currTs > 0 &&
                    currTs - prevTs > 5 * 60 * 1000);

                const timeDividerNode = showTimeDivider ? (
                  <div className="w-full py-2 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] text-[var(--text-muted)]">
                      {formatSmartImTimestamp(msg.timestamp)}
                    </span>
                  </div>
                ) : null;

                const newDividerNode =
                  activeGroup && newMessagesFromId && msg.id === newMessagesFromId ? (
                    <NewMessagesDivider />
                  ) : null;

                // 群聊：拍一拍等系统提示居中显示
                if (activeGroup && msg.systemTip) {
                  return (
                    <Fragment key={msg.id || `${msg.timestamp}-${idx}`}>
                      {timeDividerNode}
                      {newDividerNode}
                      <GroupSystemTip text={msg.content} />
                    </Fragment>
                  );
                }

                // 群聊：微信群样式（左侧头像、名字、引用、@ 高亮）
                if (activeGroup && !isUser && msg.fromBot) {
                  const groupContinuation = Boolean(
                    !showTimeDivider &&
                      !newDividerNode &&
                      prevMsg &&
                      prevMsg.role === "assistant" &&
                      !prevMsg.systemTip &&
                      prevMsg.fromBot?.slug === msg.fromBot.slug
                  );
                  return (
                    <Fragment key={msg.id || `${msg.timestamp}-${idx}`}>
                      {timeDividerNode}
                      {newDividerNode}
                      <div className={`animate-msg-ai w-full ${groupContinuation ? "-mt-3" : ""}`}>
                        <GroupMessageRow
                          msg={msg}
                          showHeader={!groupContinuation}
                          memberNames={groupMemberNames}
                          avatarImageOf={groupAvatarImageOf}
                          onSelectPersona={onSelectPersona}
                          renderBody={(text) => <GrokMessageBody content={text} />}
                        />
                      </div>
                    </Fragment>
                  );
                }

                if (isUser) {
                  return (
                    <Fragment key={msg.id || `${msg.timestamp}-${idx}`}>
                      {timeDividerNode}
                      <div className="flex flex-col items-end animate-msg-user">
                        {msg.imageUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxMedia({
                                url: msg.imageUrl!,
                                caption: "我发送的图片",
                                kind: "photo",
                              })
                            }
                            className="mb-2 rounded-2xl overflow-hidden border border-[var(--border-strong)] max-w-xs shadow-sm hover:scale-[1.015] transition-transform cursor-pointer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={msg.imageUrl}
                              alt="用户上传图片"
                              className="w-full max-h-56 object-cover"
                            />
                          </button>
                        )}
                        <div className="max-w-[75%] px-4 py-2.5 rounded-[20px] rounded-tr-md bg-[var(--user-capsule)] text-[var(--user-capsule-text)] text-[14px] leading-relaxed shadow-xs">
                          <p className="whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </Fragment>
                  );
                }

                const reports = msg.interBotReports || [];
                const reportsOpen = expandedReportsId === msg.id;
                const isContinuation = Boolean(
                  !showTimeDivider &&
                    prevMsg &&
                    prevMsg.role === "assistant" &&
                    (prevMsg.fromBot?.slug || "") === (msg.fromBot?.slug || "")
                );

                return (
                  <Fragment key={msg.id || `${msg.timestamp}-${idx}`}>
                    {timeDividerNode}
                    <div
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

                    {/* 群聊：像微信群一样，只在气泡上方显示小头像 + 名字 */}
                    {activeGroup && msg.fromBot && !isContinuation && (
                      <button
                        type="button"
                        onClick={() => onSelectPersona?.(msg.fromBot!.slug)}
                        className="mb-1 inline-flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        title={`和 ${msg.fromBot.name} 单聊`}
                      >
                        <BlobMascot
                          shape={(msg.fromBot.shape as MascotShapeId) || "circle"}
                          color={msg.fromBot.color || "#1683FF"}
                          size={18}
                          trackPointer={false}
                          animated={false}
                        />
                        <span className="font-medium">{msg.fromBot.name}</span>
                      </button>
                    )}

                    {/* Incoming Relay Header ("消息来自 [mini mascot] {name}") */}
                    {!activeGroup && msg.fromBot && !isContinuation && (
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
                      personaName={msg.fromBot?.name || persona.name}
                      moodLabel={
                        msg.mood ||
                        persona.emotionState.moodLabel ||
                        persona.emotionState.primary
                      }
                      seedKey={msg.id}
                    />

                    {/* Multi-Bubble IM Style Grok Bot Reply Stack（右键打开「不像 TA」快捷纠偏） */}
                    <div
                      className="flex flex-col items-start gap-1.5 w-full"
                      onContextMenu={(e) => {
                        if (msg.isFollowup && !msg.content) return;
                        e.preventDefault();
                        setCorrectingIdx(correctingIdx === idx ? null : idx);
                        setCorrectionDraft("");
                        setCorrectionState("idle");
                      }}
                    >
                      {bursts.map((burstText, bIdx) => (
                        <div
                          key={bIdx}
                          className="max-w-[86%] sm:max-w-[580px] rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] px-4 py-2.5 animate-msg-spring"
                        >
                          <GrokMessageBody content={burstText} />
                        </div>
                      ))}
                    </div>

                    {correctingIdx === idx && (
                      <div className="mt-1.5 w-full max-w-[420px] rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-composer)] p-3 space-y-2 text-xs animate-fade-in">
                        {correctionState === "done" ? (
                          <div className="text-[#18a999] font-medium">已记下，下一轮 TA 就会改</div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-[var(--text-secondary)]">
                              <span className="font-medium text-[var(--text-primary)]">这句不像 TA？</span>
                              <button
                                type="button"
                                onClick={() => setCorrectingIdx(null)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                aria-label="关闭"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {["太像AI", "太油腻", "表情太多", "太长了", "老是反问", "不是TA会说的话"].map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  disabled={correctionState === "saving"}
                                  onClick={() => void submitCorrection(idx, chip)}
                                  className="px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] disabled:opacity-40 cursor-pointer"
                                >
                                  {chip}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                value={correctionDraft}
                                onChange={(e) => setCorrectionDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    void submitCorrection(idx, correctionDraft);
                                  }
                                }}
                                placeholder="或者说说 TA 平时会怎么说…"
                                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={!correctionDraft.trim() || correctionState === "saving"}
                                onClick={() => void submitCorrection(idx, correctionDraft)}
                                className="px-3 py-1.5 rounded-full bg-[#18a999] hover:bg-[#149688] disabled:opacity-40 text-white font-medium cursor-pointer"
                              >
                                {correctionState === "saving" ? "记录中" : "纠正"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Elevated White Interactive "Page" Artifact Card */}
                    {msg.pageCard && <PageArtifactCard card={msg.pageCard} />}

                    {msg.groupInvite && (
                      <button
                        type="button"
                        onClick={() => onOpenGroup?.(msg.groupInvite!.groupId)}
                        className="mt-1 w-full max-w-[320px] text-left rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-composer)] px-4 py-3 hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-all"
                      >
                        <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                          群聊 · {msg.groupInvite.name}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)] truncate">
                          {msg.groupInvite.memberNames.join("、")}
                        </div>
                        <div className="mt-2 text-[12px] font-medium text-[var(--accent,#1683FF)]">
                          进入群聊 ›
                        </div>
                      </button>
                    )}

                    {/* Multimodal Sticker / Photo / Voice Cards */}
                    {msg.mediaCards && msg.mediaCards.length > 0 && (
                      <div className="mt-2 space-y-2 w-full max-w-md">
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
                                  className="group/sticker inline-block rounded-2xl overflow-hidden hover:scale-[1.03] transition-transform cursor-pointer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={card.imageUrl}
                                    alt={card.caption}
                                    className="w-36 h-36 rounded-2xl object-contain"
                                  />
                                </button>
                              );
                            }

                            if (card.status === "generating") {
                              return (
                                <div
                                  key={cIdx}
                                  className="inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-[18px] rounded-tl-md bg-[var(--bg-bubble-ai)] border border-[var(--border-subtle)] animate-fade-in"
                                >
                                  <BlobMascot
                                    shape={mascotCfg.shape}
                                    color={mascotCfg.color}
                                    image={mascotCfg.image}
                                    size={20}
                                    trackPointer={false}
                                    state="working"
                                  />
                                  <span className="text-[12px] font-medium animate-text-shimmer">
                                    正在翻找表情包...
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={cIdx}
                                className="inline-flex flex-col gap-1 px-3.5 py-2.5 rounded-2xl bg-[var(--bg-bubble-ai)] text-xs"
                              >
                                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                  <span>🎭</span>
                                  <span>[{card.caption}]</span>
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
                            if (card.imageUrl) {
                              return (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() =>
                                    setLightboxMedia({
                                      url: card.imageUrl!,
                                      caption: card.caption,
                                      kind: "photo",
                                    })
                                  }
                                  className="block max-w-[300px] rounded-2xl overflow-hidden shadow-sm hover:scale-[1.015] transition-transform cursor-pointer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={card.imageUrl}
                                    alt={card.caption}
                                    className="w-full max-h-72 object-cover"
                                  />
                                </button>
                              );
                            }

                            if (card.status === "generating") {
                              return (
                                <div
                                  key={cIdx}
                                  className="inline-flex items-center gap-2.5 px-4 py-3 rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] border border-[var(--border-subtle)] animate-fade-in"
                                >
                                  <BlobMascot
                                    shape={mascotCfg.shape}
                                    color={mascotCfg.color}
                                    image={mascotCfg.image}
                                    size={22}
                                    trackPointer={false}
                                    state="working"
                                  />
                                  <span className="text-[12px] font-medium animate-text-shimmer">
                                    {persona.name} 正在拍照...
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={cIdx}
                                className="inline-flex flex-col gap-1 px-3.5 py-2.5 rounded-2xl bg-[var(--bg-bubble-ai)] text-xs text-[var(--text-muted)]"
                              >
                                <span>
                                  📸 {card.errorHint || "照片没发过来，稍后再拍给你"}
                                </span>
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
                    </div>
                  </Fragment>
                );
              })}

              {/* 群聊：显示具体是谁正在输入（带头像） */}
              {activeGroup && groupTypingMember && (
                <div className="animate-msg-ai w-full">
                  <GroupTypingRow
                    name={groupTypingMember.name}
                    shape={getMascotConfigForPersona(groupTypingMember.slug, groupTypingMember.profile).shape}
                    color={getMascotConfigForPersona(groupTypingMember.slug, groupTypingMember.profile).color}
                    image={groupTypingMember.profile.avatarImage}
                  />
                </div>
              )}

              {/* 切走期间还在生成的回复：切回来后继续显示正在输入 */}
              {!streaming && !(activeGroup && groupTypingMember) && backgroundTypingName && (
                <div className="flex items-start animate-msg-ai">
                  <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-[20px] rounded-tl-md bg-[var(--bg-bubble-ai)] border border-[var(--border-subtle)] animate-fade-in">
                    <div className="flex items-center gap-1" aria-hidden="true">
                      <span className="typing-dot" />
                      <span className="typing-dot typing-dot-2" />
                      <span className="typing-dot typing-dot-3" />
                    </div>
                    <span className="text-[12.5px] font-medium animate-text-shimmer">
                      {backgroundTypingName} 正在输入...
                    </span>
                  </div>
                </div>
              )}

              {/* Live Streaming Turn with Animated Thinking Mascot */}
              {streaming && !(activeGroup && groupTypingMember) && (
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
                    personaName={persona.name}
                    moodLabel={
                      persona.emotionState.moodLabel ||
                      persona.emotionState.primary
                    }
                    seedKey={`live-${messages.length}`}
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
            <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-black/60 text-white text-xs">
              <span className="max-w-xs truncate">{lightboxMedia.caption}</span>
              {lightboxMedia.kind === "photo" && onRefineReferencePortrait && (
                <button
                  type="button"
                  disabled={isRefiningReference}
                  onClick={() => void onRefineReferencePortrait(lightboxMedia.url)}
                  className="px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer bg-[#18a999] hover:bg-[#159385] text-white disabled:opacity-60"
                >
                  {isRefiningReference
                    ? "✨ 正在提炼标准参考图…"
                    : "✨ 提炼为标准参考图"}
                </button>
              )}
              {lightboxMedia.kind === "photo" && onSetReferencePhoto && (
                <button
                  type="button"
                  onClick={() => void onSetReferencePhoto(lightboxMedia.url)}
                  className={`px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                    persona.profile.referenceImageUrl === lightboxMedia.url
                      ? "bg-[#18a999] text-white"
                      : "bg-white/15 hover:bg-white/25 text-white"
                  }`}
                >
                  {persona.profile.referenceImageUrl === lightboxMedia.url
                    ? "✓ 已设为人物参考图"
                    : "⭐ 设为参考图"}
                </button>
              )}
              {lightboxMedia.kind === "photo" && (
                <SaveSceneAssetButton
                  key={lightboxMedia.url}
                  slug={persona.slug}
                  imageUrl={lightboxMedia.url}
                  defaultName={lightboxMedia.caption.slice(0, 14) || "固定场景"}
                  defaultDescription={lightboxMedia.caption}
                />
              )}
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

      {/* Scroll-to-Bottom Floating Pill */}
      {showScrollBottom && (
        <div className="pointer-events-none absolute bottom-[88px] inset-x-0 z-20 flex justify-center animate-fade-in">
          <button
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-[var(--bg-elevated)] backdrop-blur-xl border border-[var(--border-subtle)] grok-floating-pill text-[11.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            ↓ 回到最新消息
          </button>
        </div>
      )}

      {/* Floating Bottom Capsule Composer */}
      <GrokComposer
        personaName={activeGroup ? `群「${activeGroup.name}」` : persona.name}
        accentColor={mascotCfg.color}
        personas={personas}
        value={input}
        onChange={onChangeInput}
        onSend={onSend}
        onStop={onStopStreaming}
        externalImage={droppedImage}
        onClearExternalImage={() => setDroppedImage(null)}
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
