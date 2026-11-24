"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PersonaSummary } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";

interface LeftSidebarProps {
  personas: PersonaSummary[];
  activeSlug: string;
  isStreaming?: boolean;
  onSelectPersona: (slug: string) => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  onOpenCreateBot: () => void;
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
  onOpenCreateBot,
  theme,
  onToggleTheme,
  onCollapse,
}: LeftSidebarProps) {
  const router = useRouter();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  const masterBot = personas.find(
    (p) => p.isMaster || p.slug === "master-bot"
  );
  const masterSlug = masterBot?.slug || "master-bot";
  const isMasterActive = activeSlug === masterSlug;
  const masterMascot = getMascotConfigForPersona(
    masterSlug,
    masterBot?.profile,
    0
  );

  const subBots = personas.filter(
    (p) => !p.isMaster && p.slug !== "master-bot"
  );

  return (
    <aside className="relative w-[268px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col h-screen select-none">
      {/* Top Action Row */}
      <div className="px-4 pt-4 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title={theme === "dark" ? "切换清爽浅色 (Grok Bot)" : "切换深空暗色"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
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
            className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-xs text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
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

          <button
            type="button"
            onClick={onOpenCreateBot}
            className="w-8 h-8 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-sm text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            title="创建新 Bot"
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
          </button>
        </div>
      </div>

      {/* Centered Clickable Master Bot Card ("猫咪的bot") */}
      <div className="px-4 py-2 flex flex-col items-center justify-center">
        <button
          type="button"
          onClick={() => onSelectPersona(masterSlug)}
          className={`group w-full max-w-[148px] py-2.5 px-3 rounded-[20px] flex flex-col items-center justify-center transition-all cursor-pointer ${
            isMasterActive
              ? "bg-[var(--bg-composer)] grok-active-row ring-1 ring-[var(--border-subtle)]"
              : "hover:bg-black/[0.035] dark:hover:bg-white/[0.04]"
          }`}
          title="切换到主控 Bot（可统一指挥所有子 Bot 并接收汇报）"
        >
          <BlobMascot
            shape={masterMascot.shape}
            color={masterMascot.color}
            image={masterMascot.image}
            size={60}
            showOnlineDot
            trackPointer
            state={isMasterActive && isStreaming ? "working" : "idle"}
          />
          <span className="mt-2 text-[12.5px] font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-1">
            <span>{masterBot?.name || "猫咪的bot"}</span>
          </span>
          {isMasterActive && isStreaming && (
            <span className="text-[10.5px] text-[var(--text-muted)] mt-0.5">
              正在调度子 Bot...
            </span>
          )}
        </button>
      </div>

      {/* Sub-Bots Clean 2-Line List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
        {subBots.map((p, index) => {
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
              className={`group w-full text-left px-3 py-2.5 rounded-[16px] transition-all duration-200 flex items-center gap-3 cursor-pointer ${
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
                state={isActive && isStreaming ? "working" : "idle"}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate">
                    {p.name}
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--text-secondary)] truncate mt-0.5">
                  {snippet}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Dock: User Popover Avatar + Floating "连接应用" Pill */}
      <div className="relative p-3.5 flex items-center gap-2.5" ref={menuRef}>
        {accountMenuOpen && (
          <div className="absolute bottom-[62px] left-3.5 w-[224px] rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl p-1.5 z-40 animate-fade-in">
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                onOpenCreateBot();
              }}
              className="w-full px-3 py-2 rounded-[13px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] cursor-pointer"
            >
              <span>➕</span>
              <span>创建新 Bot</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                router.push("/create");
              }}
              className="w-full px-3 py-2 rounded-[13px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] cursor-pointer"
            >
              <span>✨</span>
              <span>聊天记录蒸馏工作室</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                router.push("/gallery");
              }}
              className="w-full px-3 py-2 rounded-[13px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] cursor-pointer"
            >
              <span>🪐</span>
              <span>角色引力场广场</span>
            </button>
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                onOpenSettings();
              }}
              className="w-full px-3 py-2 rounded-[13px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] cursor-pointer"
            >
              <span>⚙️</span>
              <span>设置与模型密钥舱</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                onToggleTheme();
              }}
              className="w-full px-3 py-2 rounded-[13px] hover:bg-[var(--bg-hover)] text-left flex items-center justify-between text-[13px] text-[var(--text-primary)] cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <span>{theme === "dark" ? "☀️" : "🌙"}</span>
                <span>{theme === "dark" ? "浅色极简模式" : "深空暗黑模式"}</span>
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAccountMenuOpen((prev) => !prev)}
          className="w-9 h-9 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center text-base hover:scale-105 active:scale-95 transition-transform shrink-0 cursor-pointer"
          title="个人菜单（广场 / 蒸馏 / 设置 / 主题）"
        >
          🐱
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex-1 py-2 px-3.5 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center justify-center gap-2 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
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
