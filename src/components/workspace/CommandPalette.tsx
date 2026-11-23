"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode, PersonaSummary } from "@/lib/storage/types";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  personas: PersonaSummary[];
  activeSlug: string;
  onSelectPersona: (slug: string) => void;
  onChangeMode: (mode: PersonaMode) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  personas,
  activeSlug,
  onSelectPersona,
  onChangeMode,
  onToggleTheme,
  onOpenSettings,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();
  const matchedPersonas = personas.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.profile.mbti?.toLowerCase().includes(q)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)] font-mono">⌘K</span>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="快速切换角色、Grok 模式或前往页面..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)]"
          >
            ESC
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-3 text-xs">
          {/* Personas */}
          <div>
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              切换对话角色
            </div>
            {matchedPersonas.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => {
                  onSelectPersona(p.slug);
                  setQuery("");
                  onClose();
                }}
                className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition-colors ${
                  p.slug === activeSlug
                    ? "bg-white/10 text-[var(--text-primary)]"
                    : "hover:bg-white/5 text-[var(--text-secondary)]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{p.profile.avatarEmoji || "✨"}</span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {p.name}
                  </span>
                  {p.profile.mbti && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {p.profile.mbti}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {p.slug === activeSlug ? "当前在线" : "回车切换"}
                </span>
              </button>
            ))}
          </div>

          {/* Grok Modes */}
          <div>
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              切换 Grok 人格尺度
            </div>
            <div className="grid grid-cols-2 gap-1 px-1">
              {(Object.keys(PERSONA_MODES) as PersonaMode[]).map((mKey) => {
                const spec = PERSONA_MODES[mKey];
                return (
                  <button
                    key={mKey}
                    type="button"
                    onClick={() => {
                      onChangeMode(mKey);
                      onClose();
                    }}
                    className="px-3 py-2 rounded-xl hover:bg-white/5 text-left flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span>{spec.badge}</span>
                    <span>{spec.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              快捷指令
            </div>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-white/5 text-left flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <span>⚙️</span>
                <span>打开模型与 DeepSearch 联网设置</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-white/5 text-left flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <span>🌓</span>
                <span>切换深空黑曜石 / 极简亮色主题</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  router.push("/create");
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-white/5 text-left flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <span>✨</span>
                <span>前往角色灵魂蒸馏工作室 (/create)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  router.push("/gallery");
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-white/5 text-left flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <span>🪐</span>
                <span>浏览角色引力场广场 (/gallery)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
