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
    summaryText = `正在实时检索「${searchQuery || "全网动态"}」...`;
  } else if (isStreamingThought) {
    summaryText = "正在深度推演情绪与潜台词...";
  } else if (hasThought && hasSearch) {
    summaryText = `思考了 ${secondsLabel} · 查阅了 ${sourceCount} 个来源`;
  } else if (hasThought) {
    summaryText = `思考了 ${secondsLabel}`;
  } else {
    summaryText = `已查阅 ${sourceCount} 个实时来源`;
  }

  return (
    <div className="mb-3 max-w-2xl">
      {/* Compact Grok Pill Trigger */}
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setExpanded(!isOpen);
        }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-strong)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
      >
        <span
          className={`inline-flex items-center justify-center w-3.5 h-3.5 text-[11px] ${
            isLive ? "animate-orbit-spin text-zinc-100" : "text-[var(--text-muted)]"
          }`}
        >
          ✦
        </span>
        <span className="font-medium tracking-tight">{summaryText}</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-0.5">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* Expandable Vertical Timeline */}
      {isOpen && (
        <div className="mt-2.5 ml-2 pl-4 border-l border-[var(--border-strong)] space-y-3 animate-fade-in">
          {hasSearch && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                <span>
                  DeepSearch 关键词：
                  <span className="text-[var(--text-primary)] font-medium ml-1">
                    {searchQuery || "实时话题"}
                  </span>
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
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)]/80 hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all max-w-[260px]"
                    >
                      <span className="text-[10px] font-mono px-1 rounded bg-white/10 text-[var(--text-primary)]">
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
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span
                  className={`w-1.5 h-1.5 rounded-full bg-purple-400 ${
                    isStreamingThought ? "animate-pulse-dot" : ""
                  }`}
                />
                <span>内心潜台词 (Inner OS)</span>
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
