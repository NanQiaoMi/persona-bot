"use client";

import { useState } from "react";
import LineIcon from "./LineIcon";
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
      ? `${(thoughtDurationMs / 1000).toFixed(1)}s`
      : "1.0s";
  const sourceCount = searchResults?.length || 0;

  const thoughtText = (thought || "").trim();
  const waitTitle = `${personaName || "TA"} 正在想…`;

  let primaryLabel = "";
  let metaBadges: string[] = [];
  if (isSearching) {
    primaryLabel = `正在顺手翻下「${searchQuery || "最新消息"}」...`;
  } else if (isStreamingThought) {
    primaryLabel = waitTitle;
  } else if (hasThought && hasSearch) {
    primaryLabel = "偷听心声";
    metaBadges = [`${sourceCount} 条来源`, secondsLabel];
  } else if (hasThought) {
    primaryLabel = "偷听了 TA 的心声";
    metaBadges = [secondsLabel];
  } else {
    primaryLabel = "顺手翻了联网资料";
    metaBadges = [`${sourceCount} 条来源`];
  }

  return (
    <div className="mb-2 max-w-2xl">
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setExpanded(!isOpen);
        }}
        aria-expanded={isOpen}
        className={`inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full bg-[var(--surface-panel)]/85 hover:bg-[var(--bg-tertiary)]/90 border text-[11.5px] tracking-[-0.006em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-interactive focus-ring cursor-pointer ${
          isLive
            ? "border-[var(--accent-teal)]/35"
            : "border-[var(--border-hairline)] hover:border-[var(--border-strong)]"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-3 h-3 text-[10px] ${
            isLive ? "animate-orbit-spin text-[var(--accent-teal)]" : "text-[var(--text-muted)]"
          }`}
          aria-hidden="true"
        >
          ✦
        </span>
        <span className="font-medium">{primaryLabel}</span>
        {metaBadges.length > 0 && (
          <span className="inline-flex items-center gap-1 ml-0.5">
            {metaBadges.map((badge) => (
              <span
                key={badge}
                className="type-mono-num px-1.5 py-[1px] rounded-full bg-black/[0.045] dark:bg-white/[0.07] text-[10px] font-medium text-[var(--text-muted)] leading-tight"
              >
                {badge}
              </span>
            ))}
          </span>
        )}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
          className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.25 6.25L8 10l3.75-3.75"
          />
        </svg>
      </button>

      <div
        aria-hidden={!isOpen}
        className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen
            ? "grid-rows-[1fr] opacity-100 mt-1.5"
            : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
        }`}
      >
        <div className="overflow-hidden">
          <div className="ml-3 pl-3.5 border-l border-[var(--border-hairline)] space-y-2 py-0.5">
            {hasSearch && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <LineIcon
                    name="search"
                    size={12}
                    className="text-[var(--accent-teal)]"
                  />
                  <span className="text-[var(--text-muted)]">顺手搜了下</span>
                  <span className="font-medium text-[var(--text-primary)] truncate max-w-[260px]">
                    {searchQuery || "最近动态"}
                  </span>
                  {sourceCount > 0 && (
                    <span className="type-mono-num px-1.5 py-[1px] rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-[10px] text-[var(--text-muted)]">
                      {sourceCount} 条
                    </span>
                  )}
                </div>
                {searchResults && searchResults.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {searchResults.map((item, idx) => (
                      <a
                        key={`${item.title}-${idx}`}
                        href={item.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        tabIndex={isOpen ? 0 : -1}
                        title={item.snippet}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[9px] bg-[var(--surface-card)]/75 hover:bg-[var(--surface-card)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-interactive focus-ring max-w-[260px]"
                      >
                        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-[5px] bg-black/[0.045] dark:bg-white/[0.08] text-[10px] font-medium type-mono-num text-[var(--text-muted)]">
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
              <div className="rounded-[13px] bg-[var(--surface-panel)]/65 border border-[var(--border-hairline)] px-3.5 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1.5 font-medium tracking-[-0.004em]">
                    <LineIcon name="thought" size={12} className="opacity-75" />
                    <span>{personaName ? `${personaName} 偷藏的小心思` : "偷听到的心声"}</span>
                  </span>
                  <span className="type-mono-num text-[10px] opacity-75">{secondsLabel}</span>
                </div>
                <div className="space-y-1 text-[12px] italic text-[var(--text-secondary)] leading-[1.6] tracking-[-0.004em] whitespace-pre-wrap">
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
        </div>
      </div>
    </div>
  );
}
