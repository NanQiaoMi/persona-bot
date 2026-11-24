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
}

export default function ThoughtSearchTrace({
  thought,
  thoughtDurationMs,
  searchQuery,
  searchResults,
  isStreamingThought,
  isSearching,
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

  let summaryText = "";
  if (isSearching) {
    summaryText = `正在顺手翻下「${searchQuery || "最新消息"}」...`;
  } else if (isStreamingThought) {
    summaryText = "心里正嘀咕怎么回你...";
  } else if (hasThought && hasSearch) {
    summaryText = `翻了 ${sourceCount} 条资料 · 偷偷想了 ${secondsLabel}`;
  } else if (hasThought) {
    summaryText = `偷偷想了 ${secondsLabel}`;
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
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised hover:bg-surface-sunken border text-[12px] text-secondary hover:text-primary transition-colors cursor-pointer ${
          isLive ? "border-brand/35" : "border-[var(--border-subtle)]"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-3 h-3 text-[11px] ${
            isLive ? "animate-orbit-spin text-brand" : "text-muted"
          }`}
        >
          ✦
        </span>
        <span className="font-medium">{summaryText}</span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className={`w-3 h-3 text-muted transition-transform duration-[var(--motion-base)] ${
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
        <div className="mt-2 ml-2 pl-3.5 border-l-2 border-[var(--border-subtle)] space-y-2.5 animate-fade-in">
          {hasSearch && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-secondary">
                🌐 顺手搜了下：
                <span className="font-medium text-primary">
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-sm)] bg-surface-raised hover:bg-surface-sunken border border-[var(--border-subtle)] text-[11px] text-secondary hover:text-primary transition-colors max-w-[260px]"
                    >
                      <span className="text-[11px] font-mono px-1 rounded-[var(--r-sm)] bg-black/5 dark:bg-white/10 text-primary">
                        {idx + 1}
                      </span>
                      <span className="truncate">{item.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasThought && (
            <div className="rounded-[var(--r-lg)] bg-surface-raised/75 border border-dashed border-[var(--border-strong)] px-3.5 py-2.5 space-y-1">
              <div className="text-[11px] text-muted">
                💭 心里嘀咕
              </div>
              <div className="space-y-1 text-[12px] italic text-secondary leading-relaxed whitespace-pre-wrap">
                {(thought || "正在想怎么回你...")
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
