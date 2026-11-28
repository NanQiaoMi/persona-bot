"use client";

import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GroupChat, PersonaSummary } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import PortConfigPopover, {
  GatewayStatus,
  StatusDot,
  statusLabel,
  testGateway,
} from "./PortConfigPopover";

interface LeftSidebarProps {
  personas: PersonaSummary[];
  activeSlug: string;
  isStreaming?: boolean;
  draftsBySlug?: Record<string, string>;
  /** 单聊未读（角色主动发来、你还没看的条数） */
  unreadBySlug?: Record<string, number>;
  onSelectPersona: (slug: string) => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  onOpenCreateBot: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onCollapse?: () => void;
  groups?: GroupChat[];
  activeGroupId?: string | null;
  onSelectGroup?: (groupId: string) => void;
  onCreateGroup?: () => void;
  onDeleteGroup?: (groupId: string) => void;
}

function formatSidebarTime(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return "刚刚";

  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  if (dayStart === todayStart) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (dayStart === yesterdayStart) return "昨天";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const EMPTY_UNREAD: Record<string, number> = {};
const GROUPS_COLLAPSED_KEY = "personabot:groups-collapsed";
const GROUPS_COLLAPSED_EVENT = "personabot:groups-collapsed-change";

function subscribeGroupsCollapsed(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === GROUPS_COLLAPSED_KEY || e.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(GROUPS_COLLAPSED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(GROUPS_COLLAPSED_EVENT, callback);
  };
}

function getGroupsCollapsedSnapshot(): "expanded" | "collapsed" | null {
  try {
    const saved = localStorage.getItem(GROUPS_COLLAPSED_KEY);
    if (saved === "1") return "collapsed";
    if (saved === "0") return "expanded";
  } catch {
    // ignore storage errors
  }
  return null;
}

function getGroupsCollapsedServerSnapshot(): "expanded" | "collapsed" | null {
  return null;
}

function LeftSidebar({
  personas,
  activeSlug,
  isStreaming = false,
  draftsBySlug = {},
  unreadBySlug = EMPTY_UNREAD,
  onSelectPersona,
  onOpenSettings,
  onOpenCommandPalette,
  onOpenCreateBot,
  theme,
  onToggleTheme,
  onCollapse,
  groups = [],
  activeGroupId = null,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup,
}: LeftSidebarProps) {
  const router = useRouter();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [portOpen, setPortOpen] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>("unknown");
  const storedGroupCollapsePref = useSyncExternalStore(
    subscribeGroupsCollapsed,
    getGroupsCollapsedSnapshot,
    getGroupsCollapsedServerSnapshot
  );
  const [localGroupCollapsePref, setLocalGroupCollapsePref] = useState<
    "expanded" | "collapsed" | null
  >(null);
  const groupCollapsePref = localGroupCollapsePref ?? storedGroupCollapsePref;
  const closePort = useCallback(() => setPortOpen(false), []);

  const isGroupsCollapsed =
    groupCollapsePref !== null
      ? groupCollapsePref === "collapsed"
      : groups.length === 0;

  const totalGroupUnread = groups.reduce(
    (sum, g) => sum + (g.id !== activeGroupId ? g.unreadCount || 0 : 0),
    0
  );

  const toggleGroupsCollapsed = () => {
    const nextCollapsed = !isGroupsCollapsed;
    const nextPref = nextCollapsed ? "collapsed" : "expanded";
    setLocalGroupCollapsePref(nextPref);
    try {
      localStorage.setItem(GROUPS_COLLAPSED_KEY, nextCollapsed ? "1" : "0");
      window.dispatchEvent(new Event(GROUPS_COLLAPSED_EVENT));
    } catch {
      // ignore storage errors
    }
  };

  // 打开工作台时测一次网关，入口按钮上的小圆点显示连没连上
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = await res.json();
        const url = data?.settings?.llmBaseUrl;
        if (!url || cancelled) return;
        const r = await testGateway(url);
        if (!cancelled) setGatewayStatus(r.status);
      } catch {
        // 测不了就保持「未检测」
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
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
  const isMasterActive = activeSlug === masterSlug && !activeGroupId;
  const masterMascot = getMascotConfigForPersona(
    masterSlug,
    masterBot?.profile,
    0
  );

  const subBots = personas.filter(
    (p) => !p.isMaster && p.slug !== "master-bot"
  );

  return (
    <aside className="relative w-[264px] shrink-0 border-r border-[var(--border-hairline,var(--border-subtle))] bg-[var(--surface-panel,var(--bg-secondary))] flex flex-col h-dvh select-none">
      {/* Top Action Row */}
      <div className="px-3.5 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "切换清爽浅色" : "切换深空暗色"}
            className="w-8 h-8 rounded-full bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.28)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card-hover,var(--surface-card))] hover:border-[var(--border-strong)] active:scale-[0.95] transition-interactive focus-ring cursor-pointer"
            title={theme === "dark" ? "切换清爽浅色 (Grok Bot)" : "切换深空暗色"}
          >
            {theme === "dark" ? (
              <svg
                className="w-[15px] h-[15px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path
                  strokeLinecap="round"
                  d="M12 2.5v2M12 19.5v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2.5 12h2M19.5 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                />
              </svg>
            ) : (
              <svg
                className="w-[15px] h-[15px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="收起侧边栏"
              className="w-8 h-8 rounded-full bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.28)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card-hover,var(--surface-card))] hover:border-[var(--border-strong)] active:scale-[0.95] transition-interactive focus-ring cursor-pointer"
              title="收起侧边栏"
            >
              <svg
                className="w-[15px] h-[15px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
                <path d="M9.5 4.5v15" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="搜索或切换"
            className="w-8 h-8 rounded-full bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.28)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card-hover,var(--surface-card))] hover:border-[var(--border-strong)] active:scale-[0.95] transition-interactive focus-ring cursor-pointer"
            title="搜索或切换 (⌘K)"
          >
            <svg
              className="w-[15px] h-[15px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
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
            aria-label="创建新 Bot"
            className="w-8 h-8 rounded-full bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.28)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card-hover,var(--surface-card))] hover:border-[var(--border-strong)] active:scale-[0.95] transition-interactive focus-ring cursor-pointer"
            title="创建新 Bot"
          >
            <svg
              className="w-[15px] h-[15px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.85}
              aria-hidden="true"
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
      <div className="px-3.5 pt-1 pb-3 mb-2 border-b border-[var(--border-hairline,var(--border-subtle))] flex flex-col items-center justify-center">
        <button
          type="button"
          onClick={() => onSelectPersona(masterSlug)}
          className={`group w-full max-w-[164px] py-2.5 px-3.5 rounded-[16px] flex flex-col items-center justify-center active:scale-[0.98] transition-interactive focus-ring cursor-pointer ${
            isMasterActive
              ? "bg-[var(--surface-active,var(--bg-composer))] shadow-[var(--active-row-shadow)]"
              : "hover:bg-[var(--bg-hover)]"
          }`}
          title="切换到主控 Bot（可统一指挥所有子 Bot 并接收汇报）"
        >
          <BlobMascot
            shape={masterMascot.shape}
            color={masterMascot.color}
            image={masterMascot.image}
            size={58}
            showOnlineDot
            trackPointer
            state={isMasterActive && isStreaming ? "working" : "idle"}
          />
          <span className="mt-2 text-[12.5px] font-semibold tracking-[-0.012em] text-[var(--text-primary)] flex items-center gap-1">
            <span>{masterBot?.name || "猫咪的bot"}</span>
          </span>
          {isMasterActive && isStreaming && (
            <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
                style={{ backgroundColor: masterMascot.color }}
              />
              <span>正在调度子 Bot...</span>
            </span>
          )}
        </button>
      </div>

      {/* Group Chats (群聊) */}
      {(groups.length > 0 || onCreateGroup) && (
        <div className="px-3 pb-2.5 mb-2 border-b border-[var(--border-hairline,var(--border-subtle))] shrink-0">
          <div className="flex items-center justify-between px-1.5">
            <button
              type="button"
              onClick={toggleGroupsCollapsed}
              aria-expanded={!isGroupsCollapsed}
              title={isGroupsCollapsed ? "展开群聊" : "收起群聊"}
              className="group/sec flex items-center gap-1.5 py-0.5 px-1.5 -ml-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-interactive focus-ring cursor-pointer"
            >
              <svg
                className={`w-3 h-3 shrink-0 transition-transform duration-200 ease-[var(--ease-standard)] ${
                  isGroupsCollapsed ? "" : "rotate-90"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span className="type-section text-[11px] font-semibold tracking-[0.04em]">
                群聊
              </span>
              {groups.length > 0 && (
                <span className="type-mono-num tabular-nums text-[10.5px] font-normal text-[var(--text-muted)]/75">
                  {groups.length}
                </span>
              )}
              {isGroupsCollapsed && totalGroupUnread > 0 && (
                <span
                  className="min-w-[17px] h-[17px] px-1 rounded-full bg-[#FA5151] text-white text-[9.5px] font-semibold leading-[17px] text-center tabular-nums type-mono-num shadow-[0_1px_2px_rgba(250,81,81,0.3)] animate-fade-in"
                  aria-label={`${totalGroupUnread} 条群聊未读`}
                >
                  {totalGroupUnread > 99 ? "99+" : totalGroupUnread}
                </span>
              )}
            </button>
            {onCreateGroup && (
              <button
                type="button"
                onClick={onCreateGroup}
                aria-label="发起群聊"
                title="发起群聊"
                className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-[0.94] transition-interactive focus-ring cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
            )}
          </div>

          <div
            aria-hidden={isGroupsCollapsed}
            className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-[var(--ease-standard)] ${
              isGroupsCollapsed
                ? "grid-rows-[0fr] opacity-0 invisible pointer-events-none"
                : "grid-rows-[1fr] opacity-100 visible"
            }`}
          >
            <div className="overflow-hidden">
              <div className="pt-1.5">
                {groups.length === 0 ? (
                  <p className="px-1.5 pb-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                    在主 bot 里说「拉个群聊聊…」也能建群
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {groups.map((group) => {
                      const isActive = activeGroupId === group.id;
                      const members = group.memberSlugs
                        .map((slug) => personas.find((p) => p.slug === slug))
                        .filter((p): p is PersonaSummary => Boolean(p))
                        .slice(0, 3);
                      return (
                        <div
                          key={group.id}
                          className={`group relative rounded-[12px] transition-surface ${
                            isActive
                              ? "bg-[var(--surface-active,var(--bg-composer))] shadow-[var(--active-row-shadow)]"
                              : "bg-transparent hover:bg-[var(--bg-hover)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectGroup?.(group.id)}
                            className="w-full text-left px-2.5 py-2 pr-8 flex items-center gap-2.5 focus-ring rounded-[12px] active:scale-[0.99] transition-transform duration-150 cursor-pointer"
                          >
                            <div className="flex items-center shrink-0">
                              {members.map((m, i) => {
                                const cfg = getMascotConfigForPersona(
                                  m.slug,
                                  m.profile,
                                  i
                                );
                                return (
                                  <span
                                    key={m.slug}
                                    className={`rounded-full bg-[var(--surface-panel,var(--bg-secondary))] ring-[1.5px] ${
                                      isActive
                                        ? "ring-[var(--surface-active,var(--bg-composer))]"
                                        : "ring-[var(--surface-panel,var(--bg-secondary))]"
                                    } ${i > 0 ? "-ml-2" : ""}`}
                                    style={{ zIndex: members.length - i }}
                                  >
                                    <BlobMascot
                                      shape={cfg.shape}
                                      color={cfg.color}
                                      image={cfg.image}
                                      size={22}
                                      trackPointer={false}
                                      animated={false}
                                    />
                                  </span>
                                );
                              })}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12.5px] font-semibold tracking-[-0.008em] text-[var(--text-primary)] truncate">
                                {group.name}
                              </div>
                              {group.lastMessage && (
                                <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                                  {!isActive && (group.unreadCount || 0) > 0 && (
                                    <span className="text-[var(--text-muted)] tabular-nums">
                                      [{group.unreadCount}条]{" "}
                                    </span>
                                  )}
                                  {group.lastMessage}
                                </p>
                              )}
                            </div>
                            {/* 未读：像微信一样的红色数字角标 */}
                            {!isActive && (group.unreadCount || 0) > 0 && (
                              <span
                                className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#FA5151] text-white text-[10px] font-semibold leading-[18px] text-center tabular-nums type-mono-num shadow-[0_1px_2px_rgba(250,81,81,0.28)] group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity duration-150"
                                aria-label={`${group.unreadCount} 条未读`}
                              >
                                {(group.unreadCount || 0) > 99 ? "99+" : group.unreadCount}
                              </span>
                            )}
                          </button>
                          {onDeleteGroup && (
                            <button
                              type="button"
                              aria-label="删除群聊"
                              title="删除群聊"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    "确定删除这个群聊吗？聊天记录也会一起删除"
                                  )
                                ) {
                                  onDeleteGroup(group.id);
                                }
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[var(--text-muted)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-500 hover:bg-rose-500/10 transition-interactive focus-ring cursor-pointer"
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Bots Clean 2-Line List */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5">
        <div className="px-2 pt-0.5 pb-1 flex items-center justify-between">
          <span className="type-section text-[11px] font-semibold tracking-[0.04em]">
            角色
          </span>
          {subBots.length > 0 && (
            <span className="type-mono-num tabular-nums text-[10.5px] text-[var(--text-muted)]/75">
              {subBots.length}
            </span>
          )}
        </div>
        {subBots.map((p, index) => {
          const isActive = p.slug === activeSlug;
          const isBotTyping = isActive && isStreaming;
          const draftText = !isActive ? (draftsBySlug[p.slug] || "").trim() : "";
          const mascotCfg = getMascotConfigForPersona(p.slug, p.profile, index);
          const cleanLastMessage = (p.lastMessage || "")
            .replace(/^\[来自主控\s*Bot[^\]]*\]\s*/i, "")
            .trim();
          const snippet = isBotTyping
            ? "正在输入..."
            : draftText ||
              cleanLastMessage ||
              p.profile.bio ||
              p.emotionState?.moodLabel ||
              "点击开启实时对话...";
          const timeLabel = formatSidebarTime(p.lastActive);
          const unread = !isActive ? unreadBySlug[p.slug] || 0 : 0;

          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => onSelectPersona(p.slug)}
              className={`group relative w-full text-left px-2.5 py-2 rounded-[12px] transition-interactive flex items-center gap-2.5 active:scale-[0.99] focus-ring cursor-pointer ${
                isActive
                  ? "bg-[var(--surface-active,var(--bg-composer))] shadow-[var(--active-row-shadow)]"
                  : "bg-transparent hover:bg-[var(--bg-hover)]"
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full transition-all duration-150"
                  style={{ backgroundColor: mascotCfg.color }}
                />
              )}
              <BlobMascot
                shape={mascotCfg.shape}
                color={mascotCfg.color}
                image={mascotCfg.image}
                size={34}
                trackPointer
                blinkDelayMs={index * 750}
                state={isBotTyping ? "working" : "idle"}
                className="mascot-calm"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[13px] font-semibold tracking-[-0.008em] text-[var(--text-primary)] truncate">
                    {p.name}
                  </span>
                  {isBotTyping ? (
                    <span
                      className="w-2 h-2 rounded-full animate-pulse-dot shrink-0"
                      style={{ backgroundColor: mascotCfg.color }}
                    />
                  ) : (
                    timeLabel && (
                      <span className="type-mono-num tabular-nums text-[10.5px] text-[var(--text-muted)] shrink-0">
                        {timeLabel}
                      </span>
                    )
                  )}
                </div>
                <p
                  className={`text-[11.5px] truncate mt-0.5 ${
                    isBotTyping
                      ? "animate-text-shimmer font-medium"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {draftText && (
                    <span className="text-rose-500 font-medium mr-1">
                      [草稿]
                    </span>
                  )}
                  {!draftText && unread > 1 && (
                    <span className="text-[var(--text-muted)] tabular-nums">
                      [{unread}条]{" "}
                    </span>
                  )}
                  {snippet}
                </p>
              </div>
              {/* 单聊未读：TA 主动发来、你还没看 */}
              {unread > 0 && (
                <span
                  className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#FA5151] text-white text-[10px] font-semibold leading-[18px] text-center tabular-nums type-mono-num shadow-[0_1px_2px_rgba(250,81,81,0.28)]"
                  aria-label={`${unread} 条未读`}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Dock: User Popover Avatar + 「配置端口」入口 */}
      <div
        className="relative px-3.5 py-3 border-t border-[var(--border-hairline,var(--border-subtle))] flex items-center gap-2"
        ref={menuRef}
      >
        {accountMenuOpen && (
          <div className="absolute bottom-[60px] left-3.5 w-[224px] rounded-[16px] border border-[var(--border-hairline,var(--border-subtle))] surface-popover bg-[var(--surface-popover,var(--bg-elevated))] backdrop-blur-2xl shadow-[var(--popover-shadow,0_16px_40px_rgba(0,0,0,0.16))] p-1.5 z-40 animate-popover-in">
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                onOpenCreateBot();
              }}
              className="w-full px-2.5 py-2 rounded-[10px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] transition-surface focus-ring cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              <span>创建新 Bot</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                router.push("/create");
              }}
              className="w-full px-2.5 py-2 rounded-[10px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] transition-surface focus-ring cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              <span>聊天记录蒸馏工作室</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                router.push("/gallery");
              }}
              className="w-full px-2.5 py-2 rounded-[10px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] transition-surface focus-ring cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="7.5" />
                <ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-24 12 12)" />
              </svg>
              <span>角色引力场广场</span>
            </button>
            <div className="my-1 border-t border-[var(--border-hairline,var(--border-subtle))]" />
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                onOpenSettings();
              }}
              className="w-full px-2.5 py-2 rounded-[10px] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 text-[13px] text-[var(--text-primary)] transition-surface focus-ring cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>设置与模型密钥舱</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                onToggleTheme();
              }}
              className="w-full px-2.5 py-2 rounded-[10px] hover:bg-[var(--bg-hover)] text-left flex items-center justify-between text-[13px] text-[var(--text-primary)] transition-surface focus-ring cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                {theme === "dark" ? (
                  <svg
                    className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path
                      strokeLinecap="round"
                      d="M12 2.5v2M12 19.5v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2.5 12h2M19.5 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                )}
                <span>{theme === "dark" ? "浅色极简模式" : "深空暗黑模式"}</span>
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAccountMenuOpen((prev) => !prev)}
          aria-expanded={accountMenuOpen}
          className={`w-9 h-9 rounded-full bg-[var(--surface-card,var(--bg-composer))] border shadow-[var(--pill-shadow)] flex items-center justify-center text-base hover:bg-[var(--surface-card-hover,var(--surface-card))] hover:border-[var(--border-strong)] active:scale-[0.95] transition-interactive focus-ring shrink-0 cursor-pointer ${
            accountMenuOpen
              ? "border-[var(--border-strong)] bg-[var(--surface-active,var(--bg-composer))]"
              : "border-[var(--border-hairline,var(--border-subtle))]"
          }`}
          title="个人菜单（广场 / 蒸馏 / 设置 / 主题）"
        >
          🐱
        </button>

        <button
          type="button"
          data-port-trigger
          aria-expanded={portOpen}
          onClick={() => {
            setAccountMenuOpen(false);
            setPortOpen((prev) => !prev);
          }}
          title="配置模型网关等服务的地址与端口"
          className={`flex-1 h-9 px-3.5 rounded-full bg-[var(--surface-card,var(--bg-composer))] border shadow-[var(--pill-shadow)] flex items-center justify-center gap-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-card-hover,var(--surface-card))] hover:border-[var(--border-strong)] active:scale-[0.98] transition-interactive focus-ring cursor-pointer ${
            portOpen
              ? "border-[var(--border-strong)] bg-[var(--surface-active,var(--bg-composer))]"
              : "border-[var(--border-hairline,var(--border-subtle))]"
          }`}
        >
          <StatusDot status={gatewayStatus} />
          <span>配置端口</span>
          <span className="text-[10.5px] font-normal text-[var(--text-muted)] tabular-nums">
            {statusLabel(gatewayStatus)}
          </span>
        </button>
        {portOpen && (
          <PortConfigPopover
            onClose={closePort}
            onOpenFullSettings={onOpenSettings}
            onStatusChange={setGatewayStatus}
            initialStatus={gatewayStatus}
          />
        )}
      </div>
    </aside>
  );
}

export default memo(LeftSidebar);
