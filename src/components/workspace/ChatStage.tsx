"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import LineIcon from "./LineIcon";
import {
  ConversationMessage,
  MediaCard,
  PersonaMode,
  PersonaRecord,
  GroupChat,
  PersonaSummary,
  SearchResultItem,
} from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import GrokComposer from "./GrokComposer";
import { GroupTypingRow } from "./GroupMessageRow";
import SaveSceneAssetButton from "./SaveSceneAssetButton";
import ThoughtSearchTrace from "./ThoughtSearchTrace";
import ChatMessageList, { type LightboxMedia } from "./ChatMessageList";
import { GrokMessageBody } from "./chat-message-body";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";

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
  /** 照片 / 表情包没发出来时手动重试（群聊消息传 groupMsg 以便用发图成员的形象） */
  onRetryMedia?: (messageId: string, cardIndex: number) => Promise<void>;
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

export default function ChatStage({
  persona,
  personas = [],
  messages,
  streaming,
  input,
  onChangeInput,
  onSend,
  onQuickSend,
  onRetryMedia,
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
  const [sharedToast, setSharedToast] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(null);
  // 传给 memo 列表的回调：引用固定，内部总是调最新版本
  const stableSelectPersona = useStableCallback((slug: string) => onSelectPersona?.(slug));
  const stableRetryMedia = useStableCallback(
    (messageId: string, cardIndex: number) => onRetryMedia?.(messageId, cardIndex) ?? Promise.resolve()
  );
  const stableOpenGroup = useStableCallback((groupId: string) => onOpenGroup?.(groupId));
  const stableQuickCorrect = useStableCallback((msgIndex: number, reason: string) =>
    onQuickCorrect(msgIndex, reason)
  );

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

  // 新消息落下时平滑滚到底
  useEffect(() => {
    if (scrollRef.current && isNearBottomRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // 流式输出时每帧都在变：直接跟到底，不反复重启平滑滚动动画
  useEffect(() => {
    const el = scrollRef.current;
    if (el && streaming && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [streaming]);

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
      // 启动动画盖住这里；只有跳过 / 超时后才会看到这个轻量占位
      <div
        role="status"
        aria-label="正在加载角色"
        className="flex-1 flex items-center justify-center bg-[var(--bg-primary)]"
      >
        <div className="flex flex-col items-center gap-3 animate-pulse motion-reduce:animate-none">
          <div className="h-10 w-10 rounded-full bg-[var(--bg-tertiary)]" />
          <div className="h-2.5 w-32 rounded-full bg-[var(--bg-tertiary)]" />
          <div className="h-2.5 w-20 rounded-full bg-[var(--bg-tertiary)]" />
        </div>
      </div>
    );
  }

  const mascotCfg = getMascotConfigForPersona(persona.slug, persona.profile);
  // 首页快捷列表的悬停图标色：角色颜色太深（如主 bot 的黑色）时改用主题文字色，暗色主题下也看得清
  const rowAccentColor = isVeryDark(mascotCfg.color)
    ? "var(--text-primary)"
    : mascotCfg.color;
  // 群聊：成员名（用于 @ 高亮）、头像图片、按名字找人（「X 正在输入」）
  const groupMembers = activeGroup
    ? (personas || []).filter((p) => activeGroup.memberSlugs.includes(p.slug))
    : [];
  // 群里 @ 的候选：本群成员，再加上主 bot（@ 它可以直接建新 Bot 拉进群）
  const masterPersona = activeGroup ? (personas || []).find((p) => p.slug === "master-bot") : undefined;
  const groupMentionables = masterPersona ? [...groupMembers, masterPersona] : groupMembers;
  const groupTypingMember = (() => {
    if (!activeGroup) return null;
    if (groupTyping) return groupMembers.find((p) => p.slug === groupTyping.slug) || null;
    const name = streaming?.statusText?.match(/^(.+?)\s*正在输入/)?.[1]?.trim();
    return name ? groupMembers.find((p) => p.name === name) || null : null;
  })();

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFile}
      className="relative flex-1 flex flex-col h-dvh bg-[var(--surface-canvas,var(--bg-primary))] min-w-0 overflow-hidden"
    >
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-3 z-40 rounded-3xl border-2 border-dashed border-[#18a999] bg-[var(--surface-popover,var(--bg-elevated))] backdrop-blur-md flex flex-col items-center justify-center gap-2 animate-fade-in">
          <span className="text-3xl">🖼️</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            松手即可发送图片给 {persona.name}
          </span>
        </div>
      )}
      {/* Subtle Ambient Mascot Glow behind Floating Header */}
      <div
        aria-hidden="true"
        // 用径向渐变画柔光，不再用 64px 高斯模糊滤镜（效果相近，省掉整块离屏模糊）
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-60 opacity-[0.08] dark:opacity-[0.13]"
        style={{
          background: `radial-gradient(closest-side, ${mascotCfg.color}, transparent)`,
        }}
      />
      {/* Frosted Floating Header */}
      <header className="relative z-20 px-4 md:px-6 h-[54px] flex items-center justify-between gap-2 bg-[var(--bg-primary)]/78 backdrop-blur-xl backdrop-saturate-150 hairline-b transition-surface pointer-events-none">
        <div className="pointer-events-auto flex-1 min-w-0 flex items-center gap-1.5">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="w-8 h-8 rounded-full bg-[var(--surface-card)]/90 border border-[var(--border-hairline)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.28)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)] hover:border-[var(--border-strong)] active:scale-[0.96] transition-interactive focus-ring cursor-pointer shrink-0"
              title="展开侧边栏"
              aria-label="展开侧边栏"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                <path d="M9.5 4.5v15" />
              </svg>
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
              className={`h-8 px-3 rounded-full border shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.24)] text-[11.5px] font-medium tracking-[-0.008em] active:scale-[0.97] transition-interactive focus-ring cursor-pointer whitespace-nowrap shrink-0 ${
                confirmClear
                  ? "bg-rose-500/10 border-rose-500/35 text-rose-500 dark:text-rose-400"
                  : "bg-[var(--surface-card)]/90 border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)] hover:border-[var(--border-strong)]"
              }`}
              title={confirmClear ? "再次点击确认清空当前对话" : "清空当前对话"}
            >
              {confirmClear ? "确认清空？" : "新对话"}
            </button>
          )}
        </div>

        {/* Center Floating Pill with Living BlobMascot（群聊时显示群名与成员） */}
        {activeGroup ? (
          <div className="pointer-events-auto shrink-0 max-w-[54vw] sm:max-w-[320px] inline-flex items-center gap-2 h-9 px-3 rounded-full bg-[var(--surface-card)]/92 border border-[var(--border-hairline)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.3)] transition-surface">
            <button
              type="button"
              onClick={onExitGroup}
              className="w-5 h-5 -ml-1 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-interactive focus-ring rounded-full cursor-pointer shrink-0"
              title="返回主 bot"
              aria-label="返回主 bot"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <span className="text-[13px] font-semibold tracking-[-0.015em] text-[var(--text-primary)] truncate">
              {activeGroup.name}
            </span>
            <span aria-hidden="true" className="w-px h-3 bg-[var(--border-hairline)] shrink-0" />
            <span className="type-mono-num text-[11px] font-medium tracking-[-0.005em] text-[var(--text-muted)] shrink-0">
              {streaming ? (
                <span className="animate-text-shimmer">
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
          className="pointer-events-auto shrink-0 max-w-[54vw] sm:max-w-[320px] inline-flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full bg-[var(--surface-card)]/92 border border-[var(--border-hairline)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.3)] hover:bg-[var(--surface-card-hover)] hover:border-[var(--border-strong)] active:scale-[0.985] transition-interactive focus-ring cursor-pointer"
          title="点击滑出/收起角色灵魂状态舱"
        >
          <BlobMascot
            shape={mascotCfg.shape}
            color={mascotCfg.color}
            image={mascotCfg.image}
            size={21}
            trackPointer
            state={streaming ? "working" : "idle"}
          />
          <span className="text-[13px] font-semibold tracking-[-0.015em] text-[var(--text-primary)] truncate">
            {persona.name}
          </span>
          <span aria-hidden="true" className="w-px h-3 bg-[var(--border-hairline)] shrink-0" />
          <span className="type-mono-num text-[11px] font-medium tracking-[-0.005em] text-[var(--text-muted)] shrink-0">
            {showInspector ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : streaming ? (
              <span className="animate-text-shimmer">
                对方正在输入...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                <span className="text-[10px] text-[var(--accent-rose)]/85" aria-hidden="true">♥</span>
                <span>{persona.intimacy}%</span>
              </span>
            )}
          </span>
        </button>
        )}

        {/* Right Floating Share Pill */}
        <div className="pointer-events-auto flex-1 min-w-0 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handleShare}
            className={`h-8 px-3 rounded-full border shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.24)] text-[11.5px] font-medium tracking-[-0.008em] active:scale-[0.97] transition-interactive focus-ring cursor-pointer whitespace-nowrap shrink-0 ${
              sharedToast
                ? "bg-[var(--accent-teal)]/10 border-[var(--accent-teal)]/35 text-[var(--accent-teal)]"
                : "bg-[var(--surface-card)]/90 border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card-hover)] hover:border-[var(--border-strong)]"
            }`}
          >
            {sharedToast ? "已复制 ✓" : "分享"}
          </button>
        </div>
      </header>

      {/* Scrollable Chat Stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-8 pt-2 pb-8"
      >
        <div className="max-w-[740px] mx-auto">
          {messages.length === 0 && !streaming ? (
            /* Pure Flat Apple-Grade Empty State with Click-to-Customize Living Mascot */
            <div className="pt-16 sm:pt-20 pb-10 flex flex-col items-center text-center gap-8 animate-fade-in">
              <div className="flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  onClick={onOpenAvatarPicker}
                  className="group/hero relative flex flex-col items-center justify-center focus-ring rounded-2xl p-1 cursor-pointer"
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
                  <span className="mt-2 px-2.5 py-0.5 rounded-full bg-[var(--surface-panel)]/90 backdrop-blur-md border border-[var(--border-hairline)] text-[10.5px] tracking-[-0.004em] text-[var(--text-muted)] opacity-0 group-hover/hero:opacity-100 transition-opacity duration-150">
                    点击定制形状与颜色
                  </span>
                </button>

                <h2 className="text-[22px] font-semibold tracking-[-0.025em] leading-tight text-[var(--text-primary)]">
                  {persona.name}
                </h2>
              </div>

              {/* 一键开聊：无卡片浮动细线列表 */}
              <div
                className="w-full max-w-[440px] pt-1"
                style={{ ["--row-accent" as string]: rowAccentColor }}
              >
                {(persona.isMaster || persona.slug === "master-bot"
                  ? ([
                      {
                        icon: "team",
                        title: "全军协同调研今日科技动态",
                        sub: "同时调度 3 个子 Bot 分头查证并汇总报告",
                        text: "请帮我调度大家分头梳理今天最值得关注的 AI 工具与开源动态，分别汇报关键亮点和待核查项",
                        enableSearch: true,
                      },
                      {
                        icon: "split",
                        title: "让 鹿汐 和 陈野 联合分析",
                        sub: "跨 Bot 观点碰撞 + 汇总执行明细",
                        text: "让 鹿汐 和 陈野 帮我分析一下现在做个人 AI 助手最容易踩的 3 个坑，并给出可执行建议",
                        enableSearch: false,
                      },
                      {
                        icon: "search",
                        title: "开启联网核查追踪清单",
                        sub: "触发 DeepSearch 并记录覆盖来源",
                        text: "帮我联网核查 GitHub 上最近热门的开源 Agent 项目，保留来源并标注未覆盖项",
                        enableSearch: true,
                      },
                      {
                        icon: "pulse",
                        title: "检查全部子 Bot 当前状态",
                        sub: "拉取团队成员最新工作记忆摘要",
                        text: "向所有助手确认目前各自的专长与工作状态，给我一份简洁的总控状态简报",
                        enableSearch: false,
                      },
                    ] as const)
                  : ([
                      {
                        icon: "trend",
                        title: "聊聊今天的热门新鲜事",
                        sub: "实时翻一翻网上的最新动态给你锐评",
                        text: "帮我联网整理一下今天全网最值得聊的科技圈热搜清单，用你的性格锐评一下",
                        enableSearch: true,
                      },
                      {
                        icon: "thought",
                        title: "说说你现在心里在想啥",
                        sub: "听听 TA 没直说出口的真实小想法",
                        text: "说实话，你现在看到我打开这个窗口，心里第一反应是什么？",
                        enableSearch: false,
                      },
                      {
                        icon: "camera",
                        title: "发张你那边的随手拍",
                        sub: "看看 TA 此刻身边的日常画面",
                        text: "发张你现在手边的随手拍给我看看呗",
                        enableSearch: false,
                      },
                      {
                        icon: "moon",
                        title: "忙完了一天，求安慰",
                        sub: "听几句贴合 TA 脾气的连环宽慰",
                        text: "今天工作累麻了，快按你的脾气哄我两句",
                        enableSearch: false,
                      },
                    ] as const)
                ).map((chip, idx) => (
                  <Fragment key={chip.title}>
                    {idx > 0 && (
                      <div
                        aria-hidden="true"
                        className="mx-3.5 h-px bg-[var(--border-hairline)] opacity-70"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onQuickSend(chip.text, { deepSearch: chip.enableSearch })
                      }
                      className="group/chip w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-left transition-interactive hover:bg-[var(--bg-hover)] active:scale-[0.995] focus-ring cursor-pointer"
                    >
                      <LineIcon
                        name={chip.icon}
                        size={15}
                        className="shrink-0 text-[var(--text-muted)] opacity-75 group-hover/chip:opacity-100 group-hover/chip:text-[var(--row-accent)] transition-colors duration-150"
                      />
                      <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                        <span className="text-[13px] font-medium tracking-[-0.012em] text-[var(--text-primary)] shrink-0">
                          {chip.title}
                        </span>
                        <span className="text-[12px] tracking-[-0.004em] text-[var(--text-muted)] truncate opacity-85 group-hover/chip:opacity-100 group-hover/chip:text-[var(--text-secondary)] transition-all duration-150">
                          {chip.sub}
                        </span>
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="shrink-0 text-[var(--text-muted)] opacity-25 group-hover/chip:opacity-80 group-hover/chip:translate-x-0.5 transition-all duration-150"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  </Fragment>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-3">
              <ChatMessageList
                messages={messages}
                persona={persona}
                personas={personas}
                activeGroup={activeGroup}
                newMessagesFromId={newMessagesFromId}
                onSelectPersona={stableSelectPersona}
                onRetryMedia={onRetryMedia ? stableRetryMedia : undefined}
                onOpenGroup={stableOpenGroup}
                onQuickCorrect={stableQuickCorrect}
                setLightboxMedia={setLightboxMedia}
              />

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
                  <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-[20px] rounded-tl-[6px] bg-[var(--bg-bubble-ai)] border border-[var(--border-hairline)] shadow-[0_1px_2px_rgba(0,0,0,0.025)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_2px_8px_rgba(0,0,0,0.2)] animate-fade-in">
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
                      ? "-mt-2.5"
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
                          className={`max-w-[85%] sm:max-w-[580px] rounded-[20px] ${
                            bIdx === 0 ? "rounded-tl-[6px]" : "rounded-tl-[10px]"
                          } bg-[var(--bg-bubble-ai)] border border-[var(--border-hairline)] shadow-[0_1px_2px_rgba(0,0,0,0.025)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_2px_8px_rgba(0,0,0,0.2)] px-4 py-2.5 animate-msg-ai`}
                        >
                          <GrokMessageBody
                            content={bText}
                            showCursor={bIdx === arr.length - 1}
                          />
                        </div>
                      ))}
                      {streaming.statusText && (
                        <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-[18px] rounded-tl-[6px] bg-[var(--bg-bubble-ai)] border border-[var(--border-hairline)] shadow-[0_1px_2px_rgba(0,0,0,0.025)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] animate-fade-in">
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
                    <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-[20px] rounded-tl-[6px] bg-[var(--bg-bubble-ai)] border border-[var(--border-hairline)] shadow-[0_1px_2px_rgba(0,0,0,0.025)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_2px_8px_rgba(0,0,0,0.2)] animate-fade-in">
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
        <div className="pointer-events-none absolute bottom-[92px] inset-x-0 z-20 flex justify-center animate-fade-in">
          <button
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full surface-popover border border-[var(--border-hairline)] text-[11.5px] font-medium tracking-[-0.008em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] active:scale-[0.97] transition-interactive focus-ring cursor-pointer"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
            <span>回到最新消息</span>
          </button>
        </div>
      )}

      {/* Floating Bottom Capsule Composer */}
      <GrokComposer
        personaName={activeGroup ? `群「${activeGroup.name}」` : persona.name}
        accentColor={mascotCfg.color}
        personas={activeGroup ? groupMentionables : personas}
        mentionAllCount={activeGroup ? groupMembers.length : undefined}
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

/** 颜色是否接近黑色（相对亮度低于 0.08） */
function isVeryDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.08;
}
