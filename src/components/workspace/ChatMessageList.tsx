"use client";
import { thumbUrl } from "@/lib/media/thumb-url";

import { Fragment, memo, useEffect, useMemo, useState } from "react";
import {
  ConversationMessage,
  GroupChat,
  PersonaRecord,
  PersonaSummary,
} from "@/lib/storage/types";
import { MascotShapeId } from "./mascot-palette";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import {
  GroupMessageRow,
  GroupSystemTip,
  NewMessagesDivider,
} from "./GroupMessageRow";
import BotCreatedCardView from "./BotCreatedCardView";
import PageArtifactCard from "./PageArtifactCard";
import ThoughtSearchTrace from "./ThoughtSearchTrace";
import MediaPendingCard from "./MediaPendingCard";
import LineIcon from "./LineIcon";
import { GrokMessageBody, formatSmartImTimestamp } from "./chat-message-body";

export interface LightboxMedia {
  url: string;
  caption: string;
  kind: "photo" | "sticker";
}

interface ChatMessageListProps {
  messages: ConversationMessage[];
  persona: PersonaRecord;
  personas: PersonaSummary[];
  activeGroup?: GroupChat | null;
  newMessagesFromId?: string | null;
  onSelectPersona?: (slug: string) => void;
  onRetryMedia?: (messageId: string, cardIndex: number) => Promise<void>;
  onOpenGroup?: (groupId: string) => void;
  onQuickCorrect: (msgIndex: number, reason: string) => Promise<void>;
  setLightboxMedia: (media: LightboxMedia | null) => void;
}

const renderGroupBody = (text: string) => <GrokMessageBody content={text} />;

/**
 * 历史消息列表。单独 memo：你打字、AI 流式输出时它的 props 不变，整段列表不会重画。
 * 传进来的回调需要是稳定引用（ChatStage 里用 useStableCallback 包过）。
 */
function ChatMessageList({
  messages,
  persona,
  personas,
  activeGroup,
  newMessagesFromId,
  onSelectPersona,
  onRetryMedia,
  onOpenGroup,
  onQuickCorrect,
  setLightboxMedia,
}: ChatMessageListProps) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [expandedReportsId, setExpandedReportsId] = useState<string | null>(null);
  const [copiedMsgKey, setCopiedMsgKey] = useState<string | null>(null);
  // 聊天气泡右键 / 悬停纠偏「不像 TA」
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState("");
  const [correctionState, setCorrectionState] = useState<"idle" | "saving" | "done">("idle");

  useEffect(() => {
    if (correctingIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCorrectingIdx(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [correctingIdx]);

  const copyMessageText = async (key: string, text: string) => {
    const clean = text.trim();
    if (!clean || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(clean);
      setCopiedMsgKey(key);
      setTimeout(() => {
        setCopiedMsgKey((curr) => (curr === key ? null : curr));
      }, 1500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

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

  const mascotCfg = getMascotConfigForPersona(persona.slug, persona.profile);
  const { groupMemberNames, groupAvatarImageOf } = useMemo(() => {
    const members = activeGroup
      ? personas.filter((p) => activeGroup.memberSlugs.includes(p.slug))
      : [];
    return {
      groupMemberNames: members.flatMap((p) => [p.name, p.name.split(/\s+/)[0]]),
      groupAvatarImageOf: (slug: string) =>
        members.find((p) => p.slug === slug)?.profile.avatarImage,
    };
  }, [activeGroup, personas]);

  return (
    <>
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
                  <div className="w-full pt-3 pb-1.5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-medium tracking-[0.02em] text-[var(--text-muted)]/85 type-mono-num select-none">
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
                      <div className={`animate-msg-ai w-full ${groupContinuation ? "-mt-2.5" : ""}`}>
                        <GroupMessageRow
                          msg={msg}
                          showHeader={!groupContinuation}
                          memberNames={groupMemberNames}
                          avatarImageOf={groupAvatarImageOf}
                          onSelectPersona={onSelectPersona}
                          renderBody={renderGroupBody}
                          onRetryMedia={onRetryMedia}
                          botCreatedExists={
                            msg.botCreated
                              ? personas.some((p) => p.slug === msg.botCreated!.slug)
                              : undefined
                          }
                        />
                      </div>
                    </Fragment>
                  );
                }

                if (isUser) {
                  const userMsgKey = msg.id || `u-${idx}`;
                  const isUserCopied = copiedMsgKey === userMsgKey;
                  const isUserContinuation = Boolean(
                    !showTimeDivider &&
                      !newDividerNode &&
                      prevMsg &&
                      prevMsg.role === "user"
                  );
                  return (
                    <Fragment key={msg.id || `${msg.timestamp}-${idx}`}>
                      {timeDividerNode}
                      {newDividerNode}
                      <div
                        className={`group/msg flex flex-col items-end animate-msg-user ${
                          isUserContinuation ? "-mt-2.5" : ""
                        }`}
                      >
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
                            className="mb-2 rounded-2xl overflow-hidden border border-[var(--border-hairline)] hover:border-[var(--border-strong)] max-w-xs shadow-[0_2px_10px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] hover:scale-[1.015] transition-interactive cursor-pointer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl(msg.imageUrl)}
                              alt="用户上传图片"
                              loading="lazy"
                              decoding="async"
                              className="w-full max-h-56 object-cover"
                            />
                          </button>
                        )}
                        <div className="flex items-end justify-end gap-1.5 w-full">
                          {msg.content.trim() && (
                            <div className="hidden sm:inline-flex items-center p-0.5 rounded-full bg-[var(--surface-card)]/90 backdrop-blur-md border border-[var(--border-hairline)] shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.28)] opacity-0 translate-y-0.5 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:translate-y-0 group-hover/msg:pointer-events-auto focus-within:opacity-100 focus-within:translate-y-0 focus-within:pointer-events-auto transition-all duration-150 shrink-0 mb-0.5">
                              <button
                                type="button"
                                onClick={() => void copyMessageText(userMsgKey, msg.content)}
                                title={isUserCopied ? "已复制" : "复制消息"}
                                aria-label={isUserCopied ? "已复制" : "复制消息"}
                                className={`w-6 h-6 rounded-full flex items-center justify-center hover:bg-[var(--bg-hover)] active:scale-[0.94] transition-interactive cursor-pointer ${
                                  isUserCopied
                                    ? "text-[var(--accent-teal)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                }`}
                              >
                                {isUserCopied ? (
                                  <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="9" y="9" width="11" height="11" rx="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          )}
                          <div className="max-w-[80%] sm:max-w-[74%] px-4 py-2.5 rounded-[20px] rounded-tr-[6px] bg-[var(--user-capsule)] text-[var(--user-capsule-text)] border border-black/[0.08] dark:border-white/[0.1] shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_10px_rgba(0,0,0,0.28)] text-[14px] leading-[1.6] tracking-[-0.006em]">
                            <p className="whitespace-pre-wrap break-words">
                              {msg.content}
                            </p>
                          </div>
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
                const visibleBursts = bursts.filter((b) => (b || "").trim());
                const aiMsgKey = msg.id || `a-${idx}`;
                const isAiCopied = copiedMsgKey === aiMsgKey;
                const canCorrect = !(msg.isFollowup && !msg.content);

                return (
                  <Fragment key={msg.id || `${msg.timestamp}-${idx}`}>
                    {timeDividerNode}
                    <div
                      className={`group/msg flex flex-col items-start animate-msg-ai w-full ${
                        isContinuation ? "-mt-2.5" : ""
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
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--surface-panel)]/85 text-[11.5px] text-[var(--text-secondary)] transition-interactive cursor-pointer"
                        >
                          <span className="type-mono-num">{reports.length} 条消息往来</span>
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
                          <span className="type-mono-num font-medium text-[var(--text-primary)]">
                            {reports.length} 个 Bot
                          </span>
                        </button>

                        {reportsOpen && (
                          <div className="mt-2 w-full max-w-[660px] rounded-[16px] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_-4px_rgba(0,0,0,0.35)] p-3 space-y-2 animate-fade-in">
                            {reports.map((rep) => (
                              <div
                                key={`${msg.id}-${rep.slug}`}
                                className="p-2.5 rounded-[12px] bg-[var(--surface-panel)]/75 border border-[var(--border-hairline)] flex items-start gap-2.5 text-xs"
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
                                        className="text-[11px] font-medium text-[var(--accent-cyan)] hover:underline cursor-pointer"
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
                        className="mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        title={`和 ${msg.fromBot.name} 单聊`}
                      >
                        <BlobMascot
                          shape={(msg.fromBot.shape as MascotShapeId) || "circle"}
                          color={msg.fromBot.color || "#1683FF"}
                          size={18}
                          trackPointer={false}
                          animated={false}
                        />
                        <span>{msg.fromBot.name}</span>
                      </button>
                    )}

                    {/* Incoming Relay Header ("消息来自 [mini mascot] {name}") */}
                    {!activeGroup && msg.fromBot && !isContinuation && (
                      <div className="w-full mb-2.5 flex flex-col items-center gap-2">
                        <div className="w-full flex items-center gap-3 text-[10.5px] font-medium tracking-[0.02em] text-[var(--accent-cyan)]">
                          <div className="h-px flex-1 bg-[var(--border-hairline)]" />
                          <span>新</span>
                          <div className="h-px flex-1 bg-[var(--border-hairline)]" />
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
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
                            className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
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

                    {/* Multi-Bubble IM Style Grok Bot Reply Stack（悬停静默操作栏 / 右键快捷纠偏） */}
                    {visibleBursts.length > 0 && (
                      <div
                        className="flex items-end gap-1.5 w-full"
                        onContextMenu={(e) => {
                          if (!canCorrect) return;
                          e.preventDefault();
                          setCorrectingIdx(correctingIdx === idx ? null : idx);
                          setCorrectionDraft("");
                          setCorrectionState("idle");
                        }}
                      >
                        <div className="max-w-[85%] sm:max-w-[580px] flex flex-col items-start gap-1.5 min-w-0">
                          {visibleBursts.map((burstText, bIdx) => (
                            <div
                              key={bIdx}
                              className={`max-w-full rounded-[20px] ${
                                bIdx === 0 ? "rounded-tl-[6px]" : "rounded-tl-[10px]"
                              } bg-[var(--bg-bubble-ai)] border border-[var(--border-hairline)] shadow-[0_1px_2px_rgba(0,0,0,0.025)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_2px_8px_rgba(0,0,0,0.2)] px-4 py-2.5 animate-msg-spring`}
                            >
                              <GrokMessageBody content={burstText} />
                            </div>
                          ))}
                        </div>

                        <div
                          className={`hidden sm:inline-flex items-center gap-0.5 p-0.5 rounded-full bg-[var(--surface-card)]/90 backdrop-blur-md border border-[var(--border-hairline)] shadow-[0_1px_4px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.28)] transition-all duration-150 shrink-0 mb-0.5 ${
                            correctingIdx === idx
                              ? "opacity-100 translate-y-0 pointer-events-auto"
                              : "opacity-0 translate-y-0.5 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:translate-y-0 group-hover/msg:pointer-events-auto focus-within:opacity-100 focus-within:translate-y-0 focus-within:pointer-events-auto"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              void copyMessageText(aiMsgKey, visibleBursts.join("\n"))
                            }
                            title={isAiCopied ? "已复制" : "复制回复"}
                            aria-label={isAiCopied ? "已复制" : "复制回复"}
                            className={`w-6 h-6 rounded-full flex items-center justify-center hover:bg-[var(--bg-hover)] active:scale-[0.94] transition-interactive cursor-pointer ${
                              isAiCopied
                                ? "text-[var(--accent-teal)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            {isAiCopied ? (
                              <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg width="11.5" height="11.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="9" y="9" width="11" height="11" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>
                          {canCorrect && (
                            <button
                              type="button"
                              onClick={() => {
                                setCorrectingIdx(correctingIdx === idx ? null : idx);
                                setCorrectionDraft("");
                                setCorrectionState("idle");
                              }}
                              title="纠偏：这句不像 TA"
                              aria-label="纠偏：这句不像 TA"
                              className={`w-6 h-6 rounded-full flex items-center justify-center hover:bg-[var(--bg-hover)] active:scale-[0.94] transition-interactive cursor-pointer ${
                                correctingIdx === idx
                                  ? "text-[var(--accent-teal)] bg-[var(--accent-teal)]/10"
                                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              <LineIcon name="shield" size={11.5} strokeWidth={1.8} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {correctingIdx === idx && (
                      <div className="mt-2 w-full max-w-[420px] rounded-[16px] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[0_6px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_-4px_rgba(0,0,0,0.45)] p-3.5 space-y-2.5 text-xs animate-fade-in">
                        {correctionState === "done" ? (
                          <div className="text-[var(--accent-teal)] font-medium">已记下，下一轮 TA 就会改</div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-[var(--text-secondary)]">
                              <span className="font-medium tracking-[-0.01em] text-[var(--text-primary)]">这句不像 TA？</span>
                              <button
                                type="button"
                                onClick={() => setCorrectingIdx(null)}
                                className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-interactive cursor-pointer"
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
                                  className="px-2.5 py-1 rounded-full bg-[var(--surface-panel)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] text-[11.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-interactive cursor-pointer"
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
                                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-hairline)] focus:border-[var(--border-strong)] focus:outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-surface"
                              />
                              <button
                                type="button"
                                disabled={!correctionDraft.trim() || correctionState === "saving"}
                                onClick={() => void submitCorrection(idx, correctionDraft)}
                                className="px-3.5 py-1.5 rounded-full bg-[var(--accent-teal)] hover:brightness-105 disabled:opacity-40 text-white font-medium transition-interactive cursor-pointer"
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

                    {msg.botCreated && (
                      <BotCreatedCardView
                        card={msg.botCreated}
                        exists={personas.some((p) => p.slug === msg.botCreated!.slug)}
                        onOpen={onSelectPersona}
                      />
                    )}

                    {msg.groupInvite && (
                      <button
                        type="button"
                        onClick={() => onOpenGroup?.(msg.groupInvite!.groupId)}
                        className="mt-1.5 w-full max-w-[320px] text-left rounded-[18px] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] px-4 py-3 hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-interactive cursor-pointer"
                      >
                        <div className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] truncate">
                          群聊 · {msg.groupInvite.name}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)] truncate">
                          {msg.groupInvite.memberNames.join("、")}
                        </div>
                        <div className="mt-2 text-[12px] font-medium text-[var(--accent-cyan)]">
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
                                    src={thumbUrl(card.imageUrl)}
                                    alt={card.caption}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-36 h-36 rounded-2xl object-contain"
                                  />
                                </button>
                              );
                            }

                            return (
                              <MediaPendingCard
                                key={cIdx}
                                card={card}
                                name={persona.name}
                                accent={mascotCfg.color}
                                onRetry={onRetryMedia ? () => onRetryMedia(msg.id, cIdx) : undefined}
                              />
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
                                  className="block max-w-[300px] rounded-2xl overflow-hidden border border-[var(--border-hairline)] shadow-[0_2px_10px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] hover:border-[var(--border-strong)] hover:scale-[1.015] transition-interactive cursor-pointer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={thumbUrl(card.imageUrl)}
                                    alt={card.caption}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full max-h-72 object-cover"
                                  />
                                </button>
                              );
                            }

                            return (
                              <MediaPendingCard
                                key={cIdx}
                                card={card}
                                name={persona.name}
                                accent={mascotCfg.color}
                                onRetry={onRetryMedia ? () => onRetryMedia(msg.id, cIdx) : undefined}
                              />
                            );
                          }

                          return (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() =>
                                speakMessage(`${msg.id}-v-${cIdx}`, card.caption)
                              }
                              className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--surface-card)] border border-[var(--border-hairline)] shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex items-center justify-between gap-3 text-left transition-interactive hover:border-[var(--border-strong)] hover:bg-[var(--surface-card-hover)] focus-ring cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-7 h-7 rounded-full bg-[var(--accent-teal)]/12 text-[var(--accent-teal)] flex items-center justify-center text-xs shrink-0">
                                  {speakingId === `${msg.id}-v-${cIdx}` ? "🔊" : "▶"}
                                </span>
                                <div className="min-w-0">
                                  <div className="type-mono-num text-xs font-semibold text-[var(--text-primary)]">
                                    语音条 · {card.durationSec || 5}&Prime;
                                  </div>
                                  <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                    {card.caption}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[11px] text-[var(--accent-teal)] font-medium shrink-0">
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
    </>
  );
}

export default memo(ChatMessageList);
