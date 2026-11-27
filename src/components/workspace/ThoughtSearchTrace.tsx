"use client";

import { useState } from "react";
import { SearchResultItem } from "@/lib/storage/types";

interface ThoughtSearchTraceProps {
  thought?: string;
  thoughtDurationMs?: number;
  searchQuery?: string;
  searchResults?: SearchResultItem[];
  isStreamingThought?: boolean;
  isSearching?: boolean;
  personaName?: string;
  /** 兼容旧调用方：不再用于挑选模板话术 */
  moodLabel?: string;
  seedKey?: string;
}

// 内心戏只显示模型真实写出的内容；等待时只显示「正在想…」，不再用任何写死的模板话术顶替

export default function ThoughtSearchTrace({
  thought,
  thoughtDurationMs,
  searchQuery,
  searchResults,
  isStreamingThought,
  isSearching,
  personaName,
}: ThoughtSearchTraceProps) {
  const isLive = Boolean(isSearching || isStreamingThought);
  const [expanded, setExpanded] = useState(isLive);
  const [userToggled, setUserToggled] = useState(false);

  const hasSearch = Boolean(
    isSearching || (searchResults && searchResults.length > 0)
  );
  const hasThought = Boolean(isStreamingThought || (thought && thought.trim()));

  if (!hasSearch && !hasThought) return null;

  const isOpen = userToggled ? expanded : isLive;
  const secondsLabel =
    thoughtDurationMs && thoughtDurationMs > 0
      ? `${(thoughtDurationMs / 1000).toFixed(1)} 秒`
      : "1.0 秒";
  const sourceCount = searchResults?.length || 0;

  const thoughtText = (thought || "").trim();
  const waitTitle = `${personaName || "TA"} 正在想…`;

  let summaryText = "";
  if (isSearching) {
    summaryText = `正在顺手翻下「${searchQuery || "最新消息"}」...`;
  } else if (isStreamingThought) {
    summaryText = waitTitle;
  } else if (hasThought && hasSearch) {
    summaryText = `翻了 ${sourceCount} 条资料 · 偷听心声 (${secondsLabel})`;
  } else if (hasThought) {
    summaryText = `偷听了 TA 的心声 · ${secondsLabel}`;
  } else {
    summaryText = `顺手翻了 ${sourceCount} 条资料`;
  }

  return (
    <div className="mb-2 max-w-2xl">
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setExpanded(!isOpen);
        }}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] hover:bg-[var(--bg-tertiary)] border text-[11.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-surface focus-ring cursor-pointer ${
          isLive ? "border-[#18a999]/40" : "border-[var(--border-hairline,var(--border-subtle))]"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-3 h-3 text-[10px] ${
            isLive ? "animate-orbit-spin text-[#18a999]" : "text-[var(--text-muted)]"
          }`}
        >
          ✦
        </span>
        <span className="font-medium tracking-[-0.004em]">{summaryText}</span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6l4 4 4-4"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-2 ml-2.5 pl-3.5 border-l border-[var(--border-strong)] space-y-2.5 animate-fade-in">
          {hasSearch && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-[var(--text-secondary)]">
                🌐 顺手搜了下：
                <span className="font-medium text-[var(--text-primary)]">
                  {searchQuery || "最近动态"}
                </span>
              </div>
              {searchResults && searchResults.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {searchResults.map((item, idx) => (
                    <a
                      key={`${item.title}-${idx}`}
                      href={item.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      title={item.snippet}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] bg-[var(--surface-card,var(--bg-secondary))] hover:bg-[var(--surface-card-hover,var(--bg-tertiary))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-surface focus-ring max-w-[260px]"
                    >
                      <span className="text-[10px] font-mono type-mono-num px-1 rounded bg-black/5 dark:bg-white/10 text-[var(--text-primary)]">
                        {idx + 1}
                      </span>
                      <span className="truncate">{item.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {thoughtText && (
            <div className="rounded-[14px] bg-[var(--surface-panel,var(--bg-secondary))]/80 border border-[var(--border-hairline,var(--border-subtle))] px-3.5 py-2.5 space-y-1">
              <div className="text-[11px] text-[var(--text-muted)]">
                💭 {personaName ? `${personaName} 偷藏的小心思` : "偷听到的心声"}
              </div>
              <div className="space-y-1 text-[12px] italic text-[var(--text-secondary)] leading-[1.55] whitespace-pre-wrap">
                {thoughtText
                  .split(/\n+/)
                  .map((beat) => beat.trim())
                  .filter(Boolean)
                  .map((beat, idx) => (
                    <p key={idx}>{beat}</p>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
