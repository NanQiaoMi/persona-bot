"use client";

import Link from "next/link";
import { PersonaSummary } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";

interface LeftSidebarProps {
  personas: PersonaSummary[];
  activeSlug: string;
  isStreaming?: boolean;
  onSelectPersona: (slug: string) => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onCollapse?: () => void;
}

export default function LeftSidebar({
  personas,
  activeSlug,
  isStreaming = false,
  onSelectPersona,
  onOpenSettings,
  onOpenCommandPalette,
  theme,
  onToggleTheme,
  onCollapse,
}: LeftSidebarProps) {
  return (
    <aside className="w-[268px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col h-screen select-none">
      {/* Top Action Row */}
      <div className="px-4 pt-4 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all"
            title={theme === "dark" ? "切换清爽浅色 (Grok Bot)" : "切换深空暗色"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all"
              title="收起侧边栏"
            >
              ◧
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all"
            title="搜索或切换 (⌘K)"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1010.5 18a7.5 7.5 0 006.15-3.35z"
              />
            </svg>
          </button>

          <Link
            href="/create"
            className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-sm text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all"
            title="蒸馏 / 创建新角色"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* Centered Living Glossy Black Grok Bot Mascot */}
      <div className="py-4 flex flex-col items-center justify-center">
        <BlobMascot
          shape="circle"
          color="#0A0A0C"
          size={62}
          showOnlineDot
          trackPointer
          state={isStreaming ? "thinking" : "idle"}
        />
        <span className="mt-2 text-[12px] font-semibold tracking-tight text-[var(--text-primary)]">
          PersonaBot
        </span>
        <span className="text-[10.5px] text-[var(--text-muted)]">
          {isStreaming ? "正在思考回复中..." : "Grok 拟人工作台"}
        </span>
      </div>

      {/* Clean 2-Line Topic / Persona List with Elevated Active Card */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1.5">
        {personas.map((p, index) => {
          const isActive = p.slug === activeSlug;
          const mascotCfg = getMascotConfigForPersona(p.slug, p.profile, index);
          const snippet =
            p.lastMessage ||
            p.profile.bio ||
            p.emotionState?.moodLabel ||
            "点击开启实时对话...";

          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => onSelectPersona(p.slug)}
              className={`group w-full text-left px-3 py-2.5 rounded-2xl transition-all duration-200 flex items-center gap-3 ${
                isActive
                  ? "bg-[var(--bg-composer)] grok-active-row scale-[1.01]"
                  : "bg-transparent hover:bg-black/[0.035] dark:hover:bg-white/[0.04]"
              }`}
            >
              <BlobMascot
                shape={mascotCfg.shape}
                color={mascotCfg.color}
                image={mascotCfg.image}
                size={34}
                trackPointer
                blinkDelayMs={index * 750}
                state={isActive && isStreaming ? "thinking" : "idle"}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate">
                    {p.name}
                  </span>
                  {p.profile.mbti && (
                    <span className="text-[10px] font-medium text-[var(--text-muted)] shrink-0">
                      {p.profile.mbti}
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-[var(--text-secondary)] truncate mt-0.5">
                  {snippet}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Dock: User Gallery Avatar + Floating "连接应用" Pill */}
      <div className="p-3.5 flex items-center gap-2.5">
        <Link
          href="/gallery"
          className="w-9 h-9 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-base hover:scale-105 active:scale-95 transition-transform shrink-0"
          title="角色引力场广场 (/gallery)"
        >
          🐱
        </Link>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex-1 py-2 px-3.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center gap-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          <span>连接应用</span>
          <span className="inline-flex items-center gap-0.5 text-[11px]">
            <span className="w-3.5 h-3.5 rounded-sm bg-sky-500/15 text-sky-500 inline-flex items-center justify-center text-[9px]">
              ⚡
            </span>
            <span className="w-3.5 h-3.5 rounded-sm bg-emerald-500/15 text-emerald-600 inline-flex items-center justify-center text-[9px]">
              🌐
            </span>
            <span className="w-3.5 h-3.5 rounded-sm bg-rose-500/15 text-rose-500 inline-flex items-center justify-center text-[9px]">
              ✦
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
