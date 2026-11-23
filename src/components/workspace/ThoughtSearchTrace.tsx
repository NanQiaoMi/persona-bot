"use client";

import { useState } from "react";
import { SearchResultItem } from "@/lib/storage/types";

interface ThoughtSearchTraceProps {
  thought?: string;
  searchQuery?: string;
  searchResults?: SearchResultItem[];
  isStreamingThought?: boolean;
  isSearching?: boolean;
}

export default function ThoughtSearchTrace({
  thought,
  searchQuery,
  searchResults,
  isStreamingThought,
  isSearching,
}: ThoughtSearchTraceProps) {
  const [showThought, setShowThought] = useState(true);
  const [showSearch, setShowSearch] = useState(false);

  const hasSearch = Boolean(
    isSearching || (searchResults && searchResults.length > 0)
  );
  const hasThought = Boolean(isStreamingThought || (thought && thought.trim()));

  if (!hasSearch && !hasThought) return null;

  return (
    <div className="mb-2 space-y-1.5 max-w-2xl">
      {/* DeepSearch Trace Bar */}
      {hasSearch && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/90 overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowSearch((prev) => !prev)}
            className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-500/20 text-sky-400 ${
                  isSearching ? "animate-spin" : ""
                }`}
              >
                🌐
              </span>
              <span className="font-medium text-sky-400">
                {isSearching
                  ? `DeepSearch 正在实时检索「${searchQuery || "最新热点"}」...`
                  : `DeepSearch 已检索 ${searchResults?.length || 0} 条实时脉搏`}
              </span>
              {searchQuery && !isSearching && (
                <span className="text-[var(--text-muted)] truncate">
                  · &ldquo;{searchQuery}&rdquo;
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--text-muted)] shrink-0">
              {showSearch ? "收起 ▲" : "查看来源 ▼"}
            </span>
          </button>

          {showSearch && searchResults && searchResults.length > 0 && (
            <div className="px-3 pb-2.5 pt-1 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-2">
              {searchResults.map((item, idx) => (
                <a
                  key={`${item.title}-${idx}`}
                  href={item.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-2 rounded-lg bg-[var(--bg-tertiary)]/70 hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] transition-all"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-medium text-[var(--text-primary)] truncate text-[11px]">
                      {item.title}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 shrink-0">
                      {item.source}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                    {item.snippet}
                  </p>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Think / Inner Monologue OS Card */}
      {hasThought && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-950/15 overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowThought((prev) => !prev)}
            className="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left hover:bg-purple-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full bg-purple-400 ${
                  isStreamingThought ? "animate-pulse-dot" : ""
                }`}
              />
              <span className="font-medium text-purple-300">
                💭 内心潜台词 (Think · Inner OS)
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {showThought ? "隐藏潜台词 ▲" : "窥探内心 ▼"}
            </span>
          </button>

          {showThought && (
            <div className="px-3 pb-2.5 pt-1 text-[12px] text-[var(--text-secondary)] italic leading-relaxed border-t border-purple-500/10">
              {thought || "正在推演情绪与潜台词..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
