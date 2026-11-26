"use client";

import { useRouter } from "next/navigation";
import LineIcon from "@/components/workspace/LineIcon";
import { useEffect, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode, PersonaSummary } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  personas: PersonaSummary[];
  activeSlug: string;
  onSelectPersona: (slug: string) => void;
  onChangeMode: (mode: PersonaMode) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenCreateBot?: () => void;
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
  onOpenCreateBot,
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
      p.lastMessage?.toLowerCase().includes(q) ||
      p.profile.bio?.toLowerCase().includes(q) ||
      p.profile.mbti?.toLowerCase().includes(q)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[13vh] px-4 bg-black/35 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Search Bar */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--text-muted)] shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 Bot、聊天、设置..."
            className="flex-1 bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto px-3 py-2.5 space-y-4">
          {/* Bots List */}
          <div>
            <div className="px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              Bot
            </div>
            <div className="space-y-0.5">
              {matchedPersonas.map((p, idx) => {
                const mascot = getMascotConfigForPersona(
                  p.slug,
                  p.profile,
                  idx
                );
                const isMaster = Boolean(p.isMaster || p.slug === "master-bot");
                const isActive = p.slug === activeSlug;
                const snippet =
                  p.lastMessage?.trim() ||
                  p.profile.bio?.trim() ||
                  (isMaster
                    ? "主控总管 · 协同子 Bot 并汇总阶段性回报结果"
                    : "点击进入对话频道...");

                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => {
                      onSelectPersona(p.slug);
                      setQuery("");
                      onClose();
                    }}
                    className={`w-full px-3 py-2.5 rounded-[14px] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[var(--bg-hover)]"
                        : "hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <BlobMascot
                        shape={mascot.shape}
                        color={mascot.color}
                        image={mascot.image}
                        size={28}
                        trackPointer={false}
                        animated={false}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate">
                            {p.name}
                          </span>
                          {isMaster && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 text-[var(--text-muted)]">
                              主 Bot
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[var(--text-muted)] truncate mt-0.5">
                          {snippet}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                      )}
                      {idx < 9 && (
                        <span className="text-[11.5px] text-[var(--text-muted)] font-mono">
                          ⌘{idx + 1}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions Section */}
          <div>
            <div className="px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              操作
            </div>
            <div className="space-y-0.5 text-[13px]">
              {onOpenCreateBot && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCreateBot();
                  }}
                  className="w-full px-3 py-2.5 rounded-[14px] hover:bg-[var(--bg-hover)] flex items-center justify-between text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-[15px] text-[var(--text-secondary)]">
                      +
                    </span>
                    <span className="font-medium">新建 Bot</span>
                  </div>
                  <span className="text-[11.5px] text-[var(--text-muted)] font-mono">
                    ⌘N
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onOpenSettings();
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-[14px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <span className="w-7 text-center">⚙️</span>
                <span>打开设置与 API 密钥舱</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onToggleTheme();
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-[14px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <span className="w-7 text-center">🌓</span>
                <span>切换外观主题（浅色 / 深色）</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  router.push("/create");
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-[14px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <span className="w-7 text-center">✨</span>
                <span>聊天记录灵魂蒸馏工作室 (/create)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  router.push("/gallery");
                  onClose();
                }}
                className="w-full px-3 py-2 rounded-[14px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <span className="w-7 text-center">🪐</span>
                <span>角色广场 (/gallery)</span>
              </button>
            </div>
          </div>

          {/* Grok Modes */}
          <div>
            <div className="px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              切换当前人格尺度
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
                    className="px-3 py-2 rounded-[12px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <LineIcon name={spec.icon} size={14} />
                    <span>{spec.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
