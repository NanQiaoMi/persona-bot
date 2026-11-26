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
  accent,
}: {
  card: MediaCard;
  name: string;
  onRetry?: () => Promise<void> | void;
  /** 角色的颜色：波点用它的颜色（太深时改用主题文字色） */
  accent?: string;
}) {
  const [retrying, setRetrying] = useState(false);
  const state = getMediaVisualState(card);
  if (state === "ready") return null;
  const isSticker = card.type === "sticker";
  const busy = state === "generating" || retrying;
  // 生成中不给重试；其余状态都能手动重试（等网络时点了也会立刻试一次）
  const canRetry = Boolean(onRetry) && !busy;
  const busyText = isSticker
    ? name
      ? `${name} 正在找表情包…`
      : "正在找表情包…"
    : name
      ? `${name} 正在拍照…`
      : "正在拍照…";

  if (busy) {
    return (
      <div
        className="mt-1.5 inline-flex flex-col items-start gap-1"
        role="status"
        aria-live="polite"
        title={card.caption}
      >
        <span className="inline-flex items-center gap-1.5 text-[11.5px] leading-none text-[var(--text-muted)]">
          <span className="animate-text-shimmer font-medium">{busyText}</span>
        </span>
        <div
          className={`relative overflow-hidden rounded-2xl ${
            isSticker ? "w-[132px] h-[132px]" : "w-[220px] h-[164px]"
          }`}
          style={{ ["--media-dot" as string]: dotColor(accent) }}
        >
          <DotField
            cols={isSticker ? 8 : 13}
            rows={isSticker ? 8 : 10}
            animated
            clearCenter={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative mt-1.5 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] ${
        isSticker ? "w-[132px] h-[132px]" : "w-[220px] h-[164px]"
      }`}
      style={{ ["--media-dot" as string]: dotColor(accent) }}
      title={card.caption}
      role="status"
      aria-live="polite"
    >
      {/* 波点：非生成中静止淡显，中间留白给文字与按钮 */}
      <DotField cols={isSticker ? 8 : 13} rows={isSticker ? 8 : 10} animated={false} clearCenter />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)] shadow-sm"
        >
          <StateIcon state={state} />
        </span>
        <span
          className="max-w-full rounded-full px-2.5 py-0.5 text-[11.5px] leading-snug text-[var(--text-secondary)]"
          style={{ backgroundColor: "color-mix(in srgb, var(--bg-primary) 82%, transparent)" }}
        >
          {describeMediaState(card, name)}
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
    </div>
  );
}

/** 波点阵：每个点的呼吸按离中心的距离错开，连起来就是一圈圈向外荡开的波纹 */
function DotField({
  cols,
  rows,
  animated,
  clearCenter,
}: {
  cols: number;
  rows: number;
  animated: boolean;
  /** 中间留白给文字（等网络 / 失败时）；生成中铺满 */
  clearCenter: boolean;
}) {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const maxDist = Math.hypot(cx, cy);
  const dots = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      // 负的延迟：一出现就已经在动，且越外圈越晚，波纹向外走
      const delay = Math.round((dist - maxDist) * 120);
      dots.push(
        <span
          key={`${x}-${y}`}
          className={animated ? "media-dot media-dot--wave" : "media-dot"}
          style={animated ? { animationDelay: `${delay}ms` } : undefined}
        />
      );
    }
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 grid place-items-center p-2.5"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        ...(clearCenter
          ? {
              maskImage: "radial-gradient(ellipse at center, transparent 0, transparent 26%, #000 58%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, transparent 0, transparent 26%, #000 58%)",
            }
          : {}),
      }}
    >
      {dots}
    </div>
  );
}

/** 波点颜色：角色颜色；接近黑色（如主 bot）时改用主题的次要文字色，暗色主题下也看得见 */
function dotColor(hex?: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "var(--text-muted)";
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.18 ? "var(--text-muted)" : `#${m[1]}`;
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
