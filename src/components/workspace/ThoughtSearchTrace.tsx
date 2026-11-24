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
  moodLabel?: string;
  seedKey?: string;
}

const LIVE_WAIT_TITLES_DEFAULT = [
  "打了一行字又删掉了...",
  "盯着屏幕偷偷翘嘴角...",
  "纠结要不要顺着你说...",
  "一边晃腿一边想怎么回...",
  "心里的小剧场正在开演...",
  "手指悬在键盘上犹豫两秒...",
];

const LIVE_WAIT_TITLES_PLAYFUL = [
  "嘴角压不住了，忍住忍住...",
  "正翻着白眼组织语言...",
  "脑子里闪过三个损你的点...",
  "憋着坏笑打字中...",
];

const LIVE_WAIT_TITLES_SOFT = [
  "耳尖微热，假装很淡定...",
  "看着你的消息心软了一下...",
  "把太肉麻的话咽回去了...",
  "想回快点又怕显得太在意...",
];

const LIVE_WAIT_BEATS = [
  "（打了一半又觉得太直白，删掉重写一句傲娇点的…）",
  "（先装作若无其事，其实嘴角已经悄悄翘起来了…）",
  "（啧，这话听着有点欠揍，但好像又挺戳心窝的…）",
  "（手指在发送键上停了半秒，还是决定顺着话茬逗逗你…）",
  "（心里已经绕了三道弯，表面上还得端着一副淡定样…）",
];

function pickBySeed(pool: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length] || pool[0];
}

export default function ThoughtSearchTrace({
  thought,
  thoughtDurationMs,
  searchQuery,
  searchResults,
  isStreamingThought,
  isSearching,
  personaName,
  moodLabel,
  seedKey = "default",
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

  const moodText = moodLabel || "";
  const waitPool = /毒舌|抬杠|反杀|傲娇|坏笑/.test(moodText)
    ? [...LIVE_WAIT_TITLES_PLAYFUL, ...LIVE_WAIT_TITLES_DEFAULT]
    : /温柔|偏爱|心动|软|害羞|宠/.test(moodText)
      ? [...LIVE_WAIT_TITLES_SOFT, ...LIVE_WAIT_TITLES_DEFAULT]
      : LIVE_WAIT_TITLES_DEFAULT;

  const waitTitle = pickBySeed(waitPool, `${personaName || ""}:${seedKey}`);
  const waitBeat = pickBySeed(LIVE_WAIT_BEATS, `${seedKey}:${moodText}`);

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
            <div className="rounded-2xl bg-[var(--bg-secondary)]/75 border border-dashed border-[var(--border-strong)] px-3.5 py-2.5 space-y-1">
              <div className="text-[11px] text-[var(--text-muted)]">
                💭 {personaName ? `${personaName} 偷藏的小心思` : "偷听到的心声"}
              </div>
              <div className="space-y-1 text-xs italic text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {(thought || waitBeat)
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
