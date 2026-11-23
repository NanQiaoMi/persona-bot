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
  onCollapse?: () => void;
}

export default function LeftSidebar({
  personas,
  activeSlug,
  onSelectPersona,
  onOpenImport,
  onOpenSettings,
  theme,
  onToggleTheme,
  onCollapse,
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
      {/* Minimal Grok Brand Header */}
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] flex items-center justify-center font-black text-sm tracking-tighter">
            𝕏
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight">
                PersonaBot
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full border border-[var(--border-strong)] text-[var(--text-secondary)] font-medium">
                GROK
              </span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              灵魂蒸馏 × 实时大脑
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-xs text-[var(--text-secondary)]"
            title={theme === "dark" ? "切换清爽亮色" : "切换黑曜石暗色"}
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
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center text-xs text-[var(--text-secondary)]"
              title="收起侧边栏"
            >
              ◧
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search */}
      <div className="p-3 space-y-2 border-b border-[var(--border-subtle)]">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px]">
          {[
            { id: "all", label: "全部" },
            { id: "preset", label: "Grok 标杆" },
            { id: "custom", label: "我的蒸馏" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as "all" | "preset" | "custom")}
              className={`py-1 rounded-lg font-medium transition-all ${
                filter === tab.id
                  ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-sm"
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
          placeholder="搜索角色或标签..."
          className="w-full px-3 py-1.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
        />
      </div>

      {/* Persona List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-[var(--text-muted)]">
            <p className="mb-2">暂无匹配的角色</p>
            <Link
              href="/create"
              className="text-[var(--text-primary)] underline font-medium"
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
                    ? "bg-[var(--bg-tertiary)] border-[var(--border-strong)] shadow-sm"
                    : "bg-transparent border-transparent hover:bg-white/5"
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-base shrink-0">
                  {p.profile.avatarEmoji || p.name.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-xs text-[var(--text-primary)] truncate">
                        {p.name}
                      </span>
                      {p.profile.mbti && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {p.profile.mbti}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                      ♥ {p.intimacy}%
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    {p.lastMessage || p.profile.bio || "点击开启沉浸对话"}
                  </p>

                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[var(--text-muted)]">
                    <span>
                      {modeSpec.badge} {modeSpec.shortLabel}
                    </span>
                    {p.emotionState?.moodLabel && (
                      <span className="truncate">· {p.emotionState.moodLabel}</span>
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
          className="w-full py-2 px-3 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all"
        >
          <span>✦</span>
          <span>蒸馏 / 创建新角色</span>
        </Link>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenImport}
            className="py-1.5 px-2.5 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-1"
          >
            <span>📥</span>
            <span>导入记录</span>
          </button>
          <Link
            href="/gallery"
            className="py-1.5 px-2.5 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-1"
          >
            <span>🪐</span>
            <span>角色广场</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
