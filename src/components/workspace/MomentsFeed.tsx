"use client";

import { useEffect, useState } from "react";
import { MomentPost, PersonaRecord } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import SaveSceneAssetButton from "./SaveSceneAssetButton";

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
          {posts.map((post) => {
            const isCommenting = commentingId === post.id;
            const hasInteractions =
              post.likes.length > 0 || post.comments.length > 0;

            return (
              <article
                key={post.id}
                className="p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5"
              >
                {/* Header & Content */}
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden shrink-0">
                    {persona.profile.referenceImageUrl || mascotCfg.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={
                          persona.profile.referenceImageUrl || mascotCfg.image
                        }
                        alt={post.authorName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BlobMascot
                        shape={mascotCfg.shape}
                        color={mascotCfg.color}
                        size={22}
                        trackPointer={false}
                        animated={false}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-[#576b95] dark:text-[#7fa3e0] truncate">
                        {post.authorName}
                      </span>
                      {post.mood && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-secondary)] text-[9.5px] text-[var(--text-muted)] shrink-0">
                          {post.mood}
                        </span>
                      )}
                    </div>

                    <p className="text-[12px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                      {post.content}
                    </p>

                    {/* Images */}
                    {post.images.length > 0 && (
                      <div
                        className={
                          post.images.length === 1
                            ? "pt-0.5"
                            : "grid grid-cols-2 gap-1.5 pt-0.5"
                        }
                      >
                        {post.images.map((imgUrl, i) => (
                          <button
                            key={`${post.id}-img-${i}`}
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: imgUrl,
                                caption:
                                  post.imageCaptions?.[i] ||
                                  post.content.slice(0, 30),
                              })
                            }
                            className="block w-full rounded-xl overflow-hidden border border-[var(--border-subtle)] cursor-zoom-in text-left"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imgUrl}
                              alt={post.imageCaptions?.[i] || "朋友圈配图"}
                              className={
                                post.images.length === 1
                                  ? "w-full max-h-44 object-cover"
                                  : "w-full h-24 object-cover"
                              }
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Location & Time + Like/Comment Toolbar */}
                    <div className="flex items-center justify-between gap-2 pt-0.5 text-[10.5px] text-[var(--text-muted)]">
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className="shrink-0">
                          {formatRelativeTime(post.createdAt, nowMs)}
                        </span>
                        {post.location && (
                          <span className="truncate text-[#576b95]/85 dark:text-[#7fa3e0]/85">
                            · {post.location}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleLike(post.id)}
                          className={`px-2 py-0.5 rounded-md border text-[10.5px] transition-colors cursor-pointer ${
                            post.likedByUser
                              ? "border-rose-400/50 bg-rose-500/10 text-rose-500 font-medium"
                              : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {post.likedByUser ? "❤️ 已赞" : "🤍 赞"}
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
                          className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[10.5px] text-[var(--text-secondary)] transition-colors cursor-pointer"
                        >
                          💬 评论
                        </button>
                      </div>
                    </div>

                    {/* WeChat Gray Likes & Comments Box */}
                    {hasInteractions && (
                      <div className="rounded-xl bg-[var(--bg-secondary)]/85 px-2.5 py-2 space-y-1.5 text-[11px]">
                        {post.likes.length > 0 && (
                          <div className="flex items-start gap-1.5 text-[#576b95] dark:text-[#7fa3e0] leading-relaxed">
                            <span className="text-[10px] shrink-0 mt-0.5">
                              ♡
                            </span>
                            <span className="font-medium break-words">
                              {post.likes.join("，")}
                            </span>
                          </div>
                        )}

                        {post.likes.length > 0 && post.comments.length > 0 && (
                          <div className="border-t border-[var(--border-subtle)]" />
                        )}

                        {post.comments.length > 0 && (
                          <div className="space-y-1">
                            {post.comments.map((c) => (
                              <div
                                key={c.id}
                                className="leading-relaxed text-[var(--text-primary)] break-words"
                              >
                                <span className="font-medium text-[#576b95] dark:text-[#7fa3e0]">
                                  {c.authorName}
                                </span>
                                {c.replyToName && (
                                  <span className="text-[var(--text-muted)]">
                                    {" "}
                                    回复{" "}
                                    <span className="font-medium text-[#576b95] dark:text-[#7fa3e0]">
                                      {c.replyToName}
                                    </span>
                                  </span>
                                )}
                                <span>：{c.content}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline Comment Composer */}
                    {isCommenting && (
                      <div className="flex items-center gap-1.5 pt-1 animate-fade-in">
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
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[#18a999]"
                        />
                        <button
                          type="button"
                          disabled={!commentDraft.trim() || submittingComment}
                          onClick={() => void handleSubmitComment(post.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#18a999] hover:bg-[#149688] disabled:opacity-45 text-white text-[11px] font-medium shrink-0 cursor-pointer"
                        >
                          {submittingComment ? "回复中" : "发送"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Lightbox for Moment Photos */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md p-6 animate-fade-in"
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
        </div>
      )}
    </div>
  );
}
