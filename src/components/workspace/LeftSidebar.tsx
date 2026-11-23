"use client";

import Link from "next/link";
import { useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaSummary } from "@/lib/storage/types";

interface LeftSidebarProps {
  personas: PersonaSummary[];
  activeSlug: string;
  onSelectPersona: (slug: string) => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export default function LeftSidebar({
  personas,
  activeSlug,
  onSelectPersona,
  onOpenImport,
  onOpenSettings,
  theme,
  onToggleTheme,
}: LeftSidebarProps) {
  const [filter, setFilter] = useState<"all" | "preset" | "custom">("all");
  const [search, setSearch] = useState("");

  const filtered = personas.filter((p) => {
    if (filter === "preset" && !p.isPreset) return false;
    if (filter === "custom" && p.isPreset) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.profile.mbti?.toLowerCase().includes(q) ||
        p.profile.personalityTags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <aside className="w-72 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center text-slate-950 font-black text-sm shadow-md shadow-emerald-500/20">
            G
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight">
                PersonaBot
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
                GROK 2.0
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              拟人灵魂 × 实时全能大脑
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-xs text-[var(--text-secondary)]"
            title={theme === "dark" ? "切换清爽亮色" : "切换深空暗色"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-xs text-[var(--text-secondary)]"
            title="模型与 DeepSearch 联网设置"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="p-3 space-y-2 border-b border-[var(--border-subtle)]">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px]">
          {[
            { id: "all", label: "全部角色" },
            { id: "preset", label: "Grok 标杆" },
            { id: "custom", label: "我的蒸馏" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as "all" | "preset" | "custom")}
              className={`py-1 rounded-lg font-medium transition-all ${
                filter === tab.id
                  ? "bg-[var(--bg-tertiary)] text-emerald-400 shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索角色、MBTI 或性格标签..."
          className="w-full px-3 py-1.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      {/* Persona List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-[var(--text-muted)]">
            <p className="mb-2">暂无匹配的角色</p>
            <Link
              href="/create"
              className="text-emerald-400 hover:underline font-medium"
            >
              + 立即蒸馏专属角色
            </Link>
          </div>
        ) : (
          filtered.map((p) => {
            const isActive = p.slug === activeSlug;
            const modeSpec = PERSONA_MODES[p.defaultMode] || PERSONA_MODES.authentic;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => onSelectPersona(p.slug)}
                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 border ${
                  isActive
                    ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm"
                    : "bg-transparent border-transparent hover:bg-white/5"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center text-lg shrink-0">
                  {p.profile.avatarEmoji || p.name.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                        {p.name}
                      </span>
                      {p.profile.mbti && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 text-[var(--text-secondary)]">
                          {p.profile.mbti}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-rose-400 font-medium shrink-0">
                      ♥ {p.intimacy}%
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    {p.lastMessage || p.profile.bio || "点击开启沉浸式对话"}
                  </p>

                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                      {modeSpec.badge} {modeSpec.shortLabel}
                    </span>
                    {p.emotionState?.moodLabel && (
                      <span className="text-[10px] text-emerald-400 truncate">
                        · {p.emotionState.moodLabel}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom Action Dock */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-2 bg-[var(--bg-primary)]/40">
        <Link
          href="/create"
          className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
        >
          <span>✨</span>
          <span>蒸馏 / 创建新角色</span>
        </Link>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenImport}
            className="py-1.5 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/60 hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-1"
          >
            <span>📥</span>
            <span>导入记录</span>
          </button>
          <Link
            href="/gallery"
            className="py-1.5 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/60 hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-1"
          >
            <span>🪐</span>
            <span>角色广场</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
