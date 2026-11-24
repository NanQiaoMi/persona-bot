"use client";

import { toPlainPreview } from "@/lib/text/preview";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/primitives";
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
  onOpenShortcuts?: () => void;
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
  onOpenShortcuts,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      alignTop
      hideCloseButton
      size="lg"
      ariaLabel="快速命令与角色切换"
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
          className="text-muted shrink-0"
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
          className="flex-1 bg-transparent text-[16px] text-primary placeholder:text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] px-2 py-0.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] text-muted hover:text-primary cursor-pointer"
        >
          ESC
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto px-3 py-2.5 space-y-4">
        {/* Bots List */}
        <div>
          <div className="px-3 py-1.5 text-[11px] font-medium text-muted">
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
                toPlainPreview(p.lastMessage) ||
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
                  className={`w-full px-3 py-2.5 rounded-[var(--r-md)] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
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
                        <span className="text-[14px] font-semibold text-primary truncate">
                          {p.name}
                        </span>
                        {isMaster && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-muted">
                            主 Bot
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted truncate mt-0.5">
                        {snippet}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-info" />
                    )}
                    {idx < 9 && (
                      <span className="text-[11px] text-muted font-mono">
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
          <div className="px-3 py-1.5 text-[11px] font-medium text-muted">
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
                className="w-full px-3 py-2.5 rounded-[var(--r-md)] hover:bg-[var(--bg-hover)] flex items-center justify-between text-primary transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-surface-raised flex items-center justify-center text-[16px] text-secondary">
                    +
                  </span>
                  <span className="font-medium">新建 Bot</span>
                </div>
                <span className="text-[11px] text-muted font-mono">
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
              className="w-full px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-secondary hover:text-primary cursor-pointer"
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
              className="w-full px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-secondary hover:text-primary cursor-pointer"
            >
              <span className="w-7 text-center">🌓</span>
              <span>切换外观主题（浅色 / 深色）</span>
            </button>

            {onOpenShortcuts && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                className="w-full px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--bg-hover)] text-left flex items-center justify-between gap-3 text-secondary hover:text-primary cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 text-center">⌨️</span>
                  <span>快捷键速查表</span>
                </div>
                <span className="text-[11px] text-muted font-mono">?</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                router.push("/create");
                onClose();
              }}
              className="w-full px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-secondary hover:text-primary cursor-pointer"
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
              className="w-full px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-3 text-secondary hover:text-primary cursor-pointer"
            >
              <span className="w-7 text-center">🪐</span>
              <span>角色广场 (/gallery)</span>
            </button>
          </div>
        </div>

        {/* Grok Modes */}
        <div>
          <div className="px-3 py-1.5 text-[11px] font-medium text-muted">
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
                  className="px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2 text-[13px] text-secondary hover:text-primary cursor-pointer"
                >
                  <span>{spec.badge}</span>
                  <span>{spec.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
