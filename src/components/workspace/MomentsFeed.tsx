"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MomentPost, PersonaRecord } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import SaveSceneAssetButton from "./SaveSceneAssetButton";
import { prepareMomentsForDisplay } from "@/lib/persona/moment-dedupe";

interface MomentsFeedProps {
  persona: PersonaRecord;
  refreshSignal?: number;
  onFeedLoaded?: (latestPostId?: string) => void;
}

function formatRelativeTime(iso: string, nowMs: number): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts) || nowMs <= 0) {
    return "刚刚";
  }
  const diffMin = Math.max(0, Math.floor((nowMs - ts) / 60000));
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay}天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function MomentsFeed({
  persona,
  refreshSignal = 0,
  onFeedLoaded,
}: MomentsFeedProps) {
  const [posts, setPosts] = useState<MomentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoPublishing, setAutoPublishing] = useState(false);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    caption: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const mascotCfg = getMascotConfigForPersona(persona.slug, persona.profile);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollCount = 0;
    let initialTopId: string | undefined;

    const pullMoments = () =>
      fetch(`/api/personas/${encodeURIComponent(persona.slug)}/moments`, {
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setNowMs(Date.now());
          if (data?.success && Array.isArray(data.posts)) {
            setPosts(data.posts);
            const nextTopId = data.posts[0]?.id as string | undefined;
            onFeedLoaded?.(nextTopId);

            const isAuto = Boolean(data.autoPublishing);
            setAutoPublishing(isAuto);

            if (initialTopId === undefined) {
              initialTopId = nextTopId;
              if (isAuto && !pollTimer) {
                pollTimer = setInterval(() => {
                  pollCount += 1;
                  if (pollCount > 8) {
                    if (pollTimer) clearInterval(pollTimer);
                    pollTimer = null;
                    setAutoPublishing(false);
                    return;
                  }
                  void pullMoments();
                }, 4500);
              }
            } else if (!isAuto || (nextTopId && nextTopId !== initialTopId)) {
              if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
              }
              setAutoPublishing(false);
            }
          } else {
            setNotice(data?.error || "朋友圈加载失败");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNotice("网络不太稳，稍后再刷新看看");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

    void pullMoments();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [persona.slug, refreshSignal, onFeedLoaded]);

  useEffect(() => {
    if (!lightboxImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxImage]);

  const handleToggleLike = async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const nextLiked = !p.likedByUser;
        const withoutMe = p.likes.filter((n) => n !== "我");
        return {
          ...p,
          likedByUser: nextLiked,
          likes: nextLiked ? ["我", ...withoutMe] : withoutMe,
        };
      })
    );

    try {
      const res = await fetch(
        `/api/personas/${encodeURIComponent(persona.slug)}/moments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle_like", postId }),
        }
      );
      const data = await res.json();
      if (data?.success && Array.isArray(data.posts)) {
        setPosts(data.posts);
      }
    } catch {
      // Keep optimistic toggle or let next refresh sync
    }
  };

  const handleSubmitComment = async (postId: string) => {
    const clean = commentDraft.trim();
    if (!clean || submittingComment) return;
    setSubmittingComment(true);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/personas/${encodeURIComponent(persona.slug)}/moments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "comment",
            postId,
            content: clean,
          }),
        }
      );
      const data = await res.json();
      if (data?.success && Array.isArray(data.posts)) {
        setPosts(data.posts);
        setCommentDraft("");
        setCommentingId(null);
      } else {
        setNotice(data?.error || "评论发送失败");
      }
    } catch {
      setNotice("网络异常，评论未发送");
    } finally {
      setSubmittingComment(false);
    }
  };

  const signature =
    persona.profile.bio ||
    (persona.profile.personalityTags.length > 0
      ? persona.profile.personalityTags.slice(0, 3).join(" · ")
      : "今天也要认真生活呀");

  return (
    <div className="space-y-3 animate-fade-in">
      {/* WeChat Moments Cover Header */}
      <div className="relative rounded-2xl overflow-visible border border-[var(--border-subtle)] bg-[var(--bg-composer)]">
        <div
          className="relative h-28 rounded-t-2xl overflow-hidden flex flex-col justify-between p-3"
          style={{
            background: `linear-gradient(135deg, ${mascotCfg.color}cc 0%, #1e293b 65%, #0f172a 100%)`,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.22),transparent_55%)] pointer-events-none" />

          <div className="relative flex items-center justify-between z-10">
            <span className="px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-[10px] text-white/90">
              朋友圈
            </span>
            {autoPublishing && (
              <span className="px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-[10px] text-white/85 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>正在更新动态…</span>
              </span>
            )}
          </div>

          <div className="relative flex items-end justify-end gap-2.5 z-10 translate-y-2">
            <span className="text-[13px] font-semibold text-white drop-shadow mb-2">
              {persona.name}
            </span>
            <div className="w-12 h-12 rounded-xl bg-[var(--bg-primary)] border-2 border-white/90 shadow-md flex items-center justify-center overflow-hidden shrink-0">
              {persona.profile.referenceImageUrl || mascotCfg.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={persona.profile.referenceImageUrl || mascotCfg.image}
                  alt={persona.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <BlobMascot
                  shape={mascotCfg.shape}
                  color={mascotCfg.color}
                  size={34}
                  trackPointer={false}
                />
              )}
            </div>
          </div>
        </div>

        <div className="px-3 pt-3 pb-2.5 text-right text-[10.5px] text-[var(--text-muted)] truncate">
          {signature}
        </div>
      </div>

      {notice && (
        <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-500 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[10px] opacity-80 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Feed List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((idx) => (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2 animate-pulse"
            >
              <div className="h-3 w-24 rounded bg-[var(--bg-secondary)]" />
              <div className="h-24 rounded-xl bg-[var(--bg-secondary)]" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="p-5 rounded-2xl border border-dashed border-[var(--border-subtle)] text-center space-y-2">
          <div className="text-[11.5px] text-[var(--text-muted)]">
            {persona.name} 正在整理近况，稍后就会自己发动态啦
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {prepareMomentsForDisplay(posts).map((post) => {
            const isCommenting = commentingId === post.id;
            const hasInteractions =
              post.likes.length > 0 || post.comments.length > 0;

            return (
              <article
                key={post.id}
                className="group/post p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] transition-colors hover:border-[var(--border-strong)]"
              >
                {/* 头部：头像 / 名字 / 心情 */}
                <header className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden shrink-0">
                    {persona.profile.referenceImageUrl || mascotCfg.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={persona.profile.referenceImageUrl || mascotCfg.image}
                        alt={post.authorName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BlobMascot
                        shape={mascotCfg.shape}
                        color={mascotCfg.color}
                        size={24}
                        trackPointer={false}
                        animated={false}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                      {post.authorName}
                    </div>
                    <div className="flex items-center gap-1 text-[10.5px] text-[var(--text-muted)] min-w-0">
                      <span className="shrink-0">{formatRelativeTime(post.createdAt, nowMs)}</span>
                      {post.location && (
                        <>
                          <span className="opacity-50">·</span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
                            <circle cx="12" cy="10" r="2.2" />
                          </svg>
                          <span className="truncate">{post.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {post.mood && (
                    <span className="px-2 h-5 inline-flex items-center rounded-full bg-[var(--bg-secondary)] text-[10px] text-[var(--text-muted)] shrink-0 max-w-[7em] truncate">
                      {post.mood}
                    </span>
                  )}
                </header>

                <p className="mt-2.5 text-[12.5px] leading-[1.7] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                  {post.content}
                </p>

                {/* 配图：单张 4:3，多张两列方图 */}
                {post.images.length > 0 && (
                  <div
                    className={
                      post.images.length === 1 ? "mt-2.5" : "mt-2.5 grid grid-cols-2 gap-1.5"
                    }
                  >
                    {post.images.map((imgUrl, i) => (
                      <button
                        key={`${post.id}-img-${i}`}
                        type="button"
                        onClick={() =>
                          setLightboxImage({
                            url: imgUrl,
                            caption: post.imageCaptions?.[i] || post.content.slice(0, 30),
                          })
                        }
                        className={`block w-full overflow-hidden rounded-xl bg-[var(--bg-secondary)] cursor-zoom-in ${
                          post.images.length === 1 ? "aspect-[4/3]" : "aspect-square"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgUrl}
                          alt={post.imageCaptions?.[i] || "朋友圈配图"}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover/post:scale-[1.015]"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* 点赞 / 评论 */}
                <div className="mt-2 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => void handleToggleLike(post.id)}
                    aria-pressed={post.likedByUser}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] transition-colors cursor-pointer ${
                      post.likedByUser
                        ? "text-rose-500 bg-rose-500/10"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={post.likedByUser ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" />
                    </svg>
                    {post.likedByUser ? "已赞" : "赞"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isCommenting) {
                        setCommentingId(null);
                      } else {
                        setCommentingId(post.id);
                        setCommentDraft("");
                      }
                    }}
                    aria-expanded={isCommenting}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 11.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.15-2.9-.43L5 19l1.1-3.1C4.8 14.7 4 13.2 4 11.5 4 7.9 7.6 5 12 5s8 2.9 8 6.5z" />
                    </svg>
                    评论
                  </button>
                </div>

                {/* 点赞名单与评论 */}
                {hasInteractions && (
                  <div className="mt-1.5 rounded-xl bg-[var(--bg-secondary)] px-3 py-2 space-y-1.5 text-[11.5px]">
                    {post.likes.length > 0 && (
                      <div className="flex items-start gap-1.5 leading-relaxed">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="mt-[3px] shrink-0 text-rose-400">
                          <path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" />
                        </svg>
                        <span className="font-medium text-[#576b95] dark:text-[#8fb0e6] break-words">
                          {post.likes.join("、")}
                        </span>
                      </div>
                    )}

                    {post.likes.length > 0 && post.comments.length > 0 && (
                      <div className="border-t border-[var(--border-subtle)]" />
                    )}

                    {post.comments.length > 0 && (
                      <ul className="space-y-1">
                        {post.comments.map((c) => (
                          <li key={c.id} className="leading-relaxed text-[var(--text-secondary)] break-words">
                            <span className="font-medium text-[#576b95] dark:text-[#8fb0e6]">
                              {c.authorName}
                            </span>
                            {c.replyToName && (
                              <>
                                <span className="text-[var(--text-muted)]"> 回复 </span>
                                <span className="font-medium text-[#576b95] dark:text-[#8fb0e6]">
                                  {c.replyToName}
                                </span>
                              </>
                            )}
                            <span className="text-[var(--text-muted)]">：</span>
                            <span className="text-[var(--text-primary)]">{c.content}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* 评论输入 */}
                {isCommenting && (
                  <div className="mt-2 flex items-center gap-1.5 animate-fade-in">
                    <input
                      type="text"
                      value={commentDraft}
                      disabled={submittingComment}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSubmitComment(post.id);
                        }
                      }}
                      placeholder={`评论 ${post.authorName}...`}
                      className="flex-1 min-w-0 h-8 px-3 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11.5px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)]"
                    />
                    <button
                      type="button"
                      disabled={!commentDraft.trim() || submittingComment}
                      onClick={() => void handleSubmitComment(post.id)}
                      className="h-8 px-3 rounded-full bg-[#18a999] hover:bg-[#149688] disabled:opacity-45 text-white text-[11.5px] font-medium shrink-0 cursor-pointer"
                    >
                      {submittingComment ? "回复中" : "发送"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Lightbox for Moment Photos（Portal 挂载到 body，避免被右侧栏 transform/overflow 裁切） */}
      {lightboxImage &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/75 backdrop-blur-md p-6 animate-fade-in"
            onClick={() => setLightboxImage(null)}
          >
            <div
              className="relative max-w-xl w-full flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.url}
                alt={lightboxImage.caption}
                className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain bg-white/5"
              />
              <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-black/60 text-white text-xs">
                <span className="max-w-xs truncate">{lightboxImage.caption}</span>
                <SaveSceneAssetButton
                  key={lightboxImage.url}
                  slug={persona.slug}
                  imageUrl={lightboxImage.url}
                  defaultName={lightboxImage.caption.slice(0, 14) || "常去场景"}
                  defaultDescription={lightboxImage.caption}
                />
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
