"use client";

import { useState } from "react";
import type { MediaCard } from "@/lib/storage/types";
import { describeMediaState, getMediaVisualState } from "@/lib/media/media-state";

/**
 * 照片 / 表情包还没出图时的占位卡：生成中 / 等网络恢复 / 稍后自动重试 / 失败可手动重试。
 * 单聊和群聊共用。
 */
export default function MediaPendingCard({
  card,
  name,
  onRetry,
}: {
  card: MediaCard;
  name: string;
  onRetry?: () => Promise<void> | void;
}) {
  const [retrying, setRetrying] = useState(false);
  const state = getMediaVisualState(card);
  if (state === "ready") return null;
  const isSticker = card.type === "sticker";
  const busy = state === "generating" || retrying;
  // 生成中不给重试；其余状态都能手动重试（等网络时点了也会立刻试一次）
  const canRetry = Boolean(onRetry) && !busy;

  return (
    <div
      className={`mt-1.5 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-secondary)] px-3 text-center ${
        isSticker ? "w-[132px] h-[132px]" : "w-[220px] h-[164px]"
      }`}
      title={card.caption}
      role="status"
      aria-live="polite"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-primary)] text-[var(--text-muted)] ${
          busy ? "animate-pulse" : ""
        }`}
      >
        <StateIcon state={retrying ? "generating" : state} />
      </span>
      <span
        className={`text-[11.5px] leading-snug text-[var(--text-muted)] ${busy ? "animate-text-shimmer" : ""}`}
      >
        {retrying ? (isSticker ? `${name} 正在找表情包…` : `${name} 正在拍照…`) : describeMediaState(card, name)}
      </span>
      {canRetry && (
        <button
          type="button"
          onClick={async () => {
            setRetrying(true);
            try {
              await onRetry?.();
            } finally {
              setRetrying(false);
            }
          }}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11.5px] text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <path d="M20 4v7h-7" />
          </svg>
          重试
        </button>
      )}
    </div>
  );
}

function StateIcon({ state }: { state: ReturnType<typeof getMediaVisualState> }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (state === "waiting") {
    // 断开的信号
    return (
      <svg {...common}>
        <path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 12 5c-.8 0-1.6.1-2.4.2" />
        <path d="M5.5 12.5a10 10 0 0 1 3-1.9M18.5 12.5a10 10 0 0 0-3.4-2" />
        <path d="M9 16a5 5 0 0 1 6 0" />
        <path d="M12 20h.01M3 3l18 18" />
      </svg>
    );
  }
  if (state === "retrying" || state === "failed") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v4.5M12 16h.01" />
      </svg>
    );
  }
  // 生成中：相机
  return (
    <svg {...common}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  );
}
