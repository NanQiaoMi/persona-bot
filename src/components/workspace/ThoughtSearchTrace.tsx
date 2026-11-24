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
    summaryText = `正在检索「${searchQuery || "全网动态"}」...`;
  } else if (isStreamingThought) {
    summaryText = "正在思考潜台词...";
  } else if (hasThought && hasSearch) {
    summaryText = `思考了 ${secondsLabel} · 查阅了 ${sourceCount} 个来源`;
  } else if (hasThought) {
    summaryText = `思考了 ${secondsLabel}`;
  } else {
    summaryText = `已查阅 ${sourceCount} 个来源`;
  }

  return (
    <div className="mb-2 max-w-2xl">
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setExpanded(!isOpen);
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border text-[11.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer ${
          isLive ? "border-[#18a999]/35" : "border-[var(--border-subtle)]"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-3 h-3 text-[10px] ${
            isLive ? "animate-orbit-spin text-[#18a999]" : "text-[var(--text-muted)]"
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
        <div className="mt-2 ml-2 pl-3.5 border-l-2 border-[var(--border-subtle)] space-y-2.5 animate-fade-in">
          {hasSearch && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-[var(--text-secondary)]">
                🌐 DeepSearch 检索词：
                <span className="font-medium text-[var(--text-primary)]">
                  {searchQuery || "实时动态"}
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all max-w-[260px]"
                    >
                      <span className="text-[10px] font-mono px-1 rounded bg-black/5 dark:bg-white/10 text-[var(--text-primary)]">
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
            <div className="space-y-0.5">
              <div className="text-[11px] text-[var(--text-muted)]">
                💭 内心潜台词 (Inner OS)
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {thought || "正在组织潜台词..."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
