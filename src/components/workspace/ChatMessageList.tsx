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
  // 聊天气泡右键「不像 TA」快捷纠偏
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
                  <div className="w-full py-2.5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] tracking-[0.01em] text-[var(--text-muted)] type-mono-num">
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
                              src={thumbUrl(msg.imageUrl)}
                              alt="用户上传图片"
                              loading="lazy"
                              decoding="async"
                              className="w-full max-h-56 object-cover"
                            />
                          </button>
                        )}
                        <div className="max-w-[74%] px-4 py-2.5 rounded-[20px] rounded-tr-[6px] bg-[var(--user-capsule)] text-[var(--user-capsule-text)] text-[14px] leading-[1.55] tracking-[-0.006em] shadow-xs">
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
                          <div className="mt-2 w-full max-w-[660px] rounded-[16px] border border-[var(--border-hairline,var(--border-subtle))] surface-card bg-[var(--surface-card,var(--bg-composer))] p-3 space-y-2 animate-fade-in">
                            {reports.map((rep) => (
                              <div
                                key={`${msg.id}-${rep.slug}`}
                                className="p-2.5 rounded-[12px] bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] flex items-start gap-2.5 text-xs"
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
                      {bursts.filter((b) => (b || "").trim()).map((burstText, bIdx) => (
                        <div
                          key={bIdx}
                          className="max-w-[85%] sm:max-w-[580px] rounded-[20px] rounded-tl-[6px] bg-[var(--bg-bubble-ai)] px-4 py-2.5 animate-msg-spring"
                        >
                          <GrokMessageBody content={burstText} />
                        </div>
                      ))}
                    </div>

                    {correctingIdx === idx && (
                      <div className="mt-1.5 w-full max-w-[420px] rounded-[16px] border border-[var(--border-hairline,var(--border-subtle))] surface-card bg-[var(--surface-card,var(--bg-composer))] p-3 space-y-2 text-xs animate-fade-in">
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
                                  className="block max-w-[300px] rounded-2xl overflow-hidden shadow-sm hover:scale-[1.015] transition-transform cursor-pointer"
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
                              className="w-full px-3.5 py-2.5 rounded-[16px] bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] grok-floating-pill flex items-center justify-between gap-3 text-left transition-surface hover:border-[var(--border-strong)] focus-ring cursor-pointer"
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
    </>
  );
}

export default memo(ChatMessageList);
