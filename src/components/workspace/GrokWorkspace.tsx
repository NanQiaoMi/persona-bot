"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImportModal from "@/components/ImportModal";
import SettingsModal from "@/components/settings/SettingsModal";
import {
  ConversationMessage,
  GroupChat,
  MediaCard,
  PendingFollowup,
  PersonaMode,
  PersonaRecord,
  PersonaSummary,
  SearchResultItem,
} from "@/lib/storage/types";
import AvatarPickerModal from "./AvatarPickerModal";
import ChatStage from "./ChatStage";
import { createFrameBatcher } from "@/lib/chat/frame-batcher";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { hasPendingMedia } from "@/lib/media/media-state";
import { MEDIA_POLL_MIN_MS, nextMediaPollDelay } from "@/lib/media/media-fingerprint";
import {
  buildStreamRequestBody,
  channelKey,
  mergeServerWithLocalPending,
  pruneSavedPendingMessages,
  type PendingBurstSnapshot,
} from "@/lib/chat/switch-sync";
import CommandPalette from "./CommandPalette";
import CreateBotModal from "./CreateBotModal";
import CreateGroupModal from "./CreateGroupModal";
import LeftSidebar from "./LeftSidebar";
import RightInspector from "./RightInspector";
import SplashScreen, { shouldShowSplash } from "./SplashScreen";

interface GrokWorkspaceProps {
  initialSlug?: string;
}

export default function GrokWorkspace({ initialSlug }: GrokWorkspaceProps) {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  // 启动动画：整个页面只播一次；客户端路由切换回来时直接跳过
  // 只决定要不要挂载；退场与工作台浮现由 SplashScreen 自己驱动，不回传状态，避免整个工作台重渲染
  const [showSplash] = useState(() => shouldShowSplash());
  const [splashSteps, setSplashSteps] = useState({ personas: false, groups: false, detail: false });
  const markSplashStep = useCallback((step: "personas" | "groups" | "detail") => {
    setSplashSteps((prev) => (prev[step] ? prev : { ...prev, [step]: true }));
  }, []);
  const [activeSlug, setActiveSlug] = useState<string>(
    initialSlug || "lu-xi"
  );
  const [activePersona, setActivePersona] = useState<PersonaRecord | null>(
    null
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draftsBySlug, setDraftsBySlug] = useState<Record<string, string>>({});
  const input = draftsBySlug[activeSlug] || "";
  // 侧栏只显示「其它会话」的草稿：当前会话打字时这份数据不变，侧栏就不用跟着重画
  const otherDraftsKey = JSON.stringify(
    Object.entries(draftsBySlug).filter(([slug, text]) => slug !== activeSlug && text.trim())
  );
  const sidebarDrafts = useMemo<Record<string, string>>(
    () => Object.fromEntries(JSON.parse(otherDraftsKey) as [string, string][]),
    [otherDraftsKey]
  );
  const setInput = useCallback(
    (val: string) => {
      setDraftsBySlug((prev) => ({ ...prev, [activeSlug]: val }));
    },
    [activeSlug]
  );
  const [thinkMode, setThinkMode] = useState(true);
  const [deepSearch, setDeepSearch] = useState(false);
  const [activeMode, setActiveMode] = useState<PersonaMode>("fun");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [autoNudgeEnabled, setAutoNudgeEnabled] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [refiningRefSlugs, setRefiningRefSlugs] = useState<
    Record<string, boolean>
  >({});
  const [refineRefNotice, setRefineRefNotice] = useState<
    Record<string, string | null>
  >({});
  const [growthNoticeBySlug, setGrowthNoticeBySlug] = useState<
    Record<string, string | null>
  >({});
  const [unreadMomentsBySlug, setUnreadMomentsBySlug] = useState<
    Record<string, boolean>
  >({});
  const [momentsRefreshSignalBySlug, setMomentsRefreshSignalBySlug] = useState<
    Record<string, number>
  >({});
  const refiningRefSlugsRef = useRef<Record<string, boolean>>({});
  const prevProfileMetaRef = useRef<
    Record<string, { tags: string[]; appearanceAnchor?: string }>
  >({});
  const latestMomentIdRef = useRef<Record<string, string>>({});
  const momentCheckTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const followupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleNudgeCountRef = useRef<number>(0);
  const activeSlugRef = useRef(activeSlug);
  const streamingRef = useRef(false);
  // 连发合并：发出一条后先等一小会儿，期间再发的消息合并成同一轮让对方一起回
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstStartedAtRef = useRef<number>(0);
  const [pendingBurst, setPendingBurst] = useState(false);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const inputRef = useRef("");
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const activeGroupIdRef = useRef<string | null>(null);
  const activeGroup = activeGroupId
    ? groups.find((g) => g.id === activeGroupId) || null
    : null;
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamSessionIdRef = useRef(0);
  const detailLoadIdRef = useRef(0);
  const pendingBurstDataRef = useRef<PendingBurstSnapshot | null>(null);
  const pendingLocalMsgsByChannelRef = useRef<Record<string, ConversationMessage[]>>({});
  const clientInflightCountByChannelRef = useRef<Record<string, number>>({});
  const runStreamRequestRef = useRef<
    | ((
        history: ConversationMessage[],
        mode: PersonaMode,
        options?: { kickoff?: boolean }
      ) => Promise<void>)
    | null
  >(null);

  const recordLocalUserMessage = useCallback((key: string, msg: ConversationMessage) => {
    const prev = pendingLocalMsgsByChannelRef.current[key] || [];
    pendingLocalMsgsByChannelRef.current[key] = [...prev, msg].slice(-10);
  }, []);

  const applyServerMessages = useCallback(
    (key: string, serverMessages: ConversationMessage[], fallbackEmpty = false) => {
      const remaining = pruneSavedPendingMessages(
        pendingLocalMsgsByChannelRef.current[key] || [],
        serverMessages
      );
      if (remaining.length > 0) {
        pendingLocalMsgsByChannelRef.current[key] = remaining;
      } else {
        delete pendingLocalMsgsByChannelRef.current[key];
      }
      setMessages((prev) => {
        if (serverMessages.length === 0 && remaining.length === 0) {
          return fallbackEmpty ? [] : prev;
        }
        return mergeServerWithLocalPending(prev, serverMessages, remaining);
      });
    },
    []
  );

  const trackClientInflight = useCallback((key: string, promise: Promise<unknown>) => {
    clientInflightCountByChannelRef.current[key] =
      (clientInflightCountByChannelRef.current[key] || 0) + 1;
    void promise.finally(() => {
      const next = (clientInflightCountByChannelRef.current[key] || 1) - 1;
      if (next <= 0) delete clientInflightCountByChannelRef.current[key];
      else clientInflightCountByChannelRef.current[key] = next;
    });
  }, []);

  const [streaming, setStreaming] = useState<{
    isSearching: boolean;
    searchQuery?: string;
    searchResults?: SearchResultItem[];
    statusText?: string;
    thought: string;
    thoughtDurationMs?: number;
    isStreamingThought: boolean;
    reply: string;
    bursts?: string[];
    mediaCards?: MediaCard[];
  } | null>(null);

  const flushPendingBurst = useCallback((options?: { background?: boolean }) => {
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    const snapshot = pendingBurstDataRef.current;
    pendingBurstDataRef.current = null;
    queueMicrotask(() => setPendingBurst(false));
    if (!snapshot) return;

    const sameTarget =
      activeGroupIdRef.current === snapshot.groupId &&
      (Boolean(snapshot.groupId) || activeSlugRef.current === snapshot.slug);

    if (!options?.background && sameTarget && runStreamRequestRef.current) {
      void runStreamRequestRef.current(snapshot.messages, snapshot.mode);
      return;
    }

    // 切走对话或后台发送：不绑定当前页 AbortController，收到响应头再 cancel body 让服务端跳延迟并立刻存档生图
    const key = channelKey({ slug: snapshot.slug, groupId: snapshot.groupId });
    const req = fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildStreamRequestBody(snapshot)),
    })
      .then((res) => {
        void res.body?.cancel().catch(() => {});
      })
      .catch(() => {});
    trackClientInflight(key, req);
  }, [trackClientInflight]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("personabot-theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
      queueMicrotask(() => setTheme(saved));
    }
  }, []);

  useEffect(() => {
    activeSlugRef.current = activeSlug;
    if (activeSlug !== "master-bot" && activeGroupIdRef.current) {
      // 群聊挂在主 bot 下：切到其它角色（如快捷键）时自动退出群聊
      activeGroupIdRef.current = null;
      queueMicrotask(() => setActiveGroupId(null));
    }
    idleNudgeCountRef.current = 0;
    flushPendingBurst({ background: true });
    streamSessionIdRef.current += 1;
    // 切走时不 abort 底层 POST 请求，避免刚发出的消息在到达服务端前被掐断；流读取循环会自行 reader.cancel()
    streamAbortRef.current = null;
    queueMicrotask(() => setStreaming(null));
    if (followupTimerRef.current) {
      clearTimeout(followupTimerRef.current);
      followupTimerRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    momentCheckTimersRef.current.forEach((t) => clearTimeout(t));
    momentCheckTimersRef.current = [];
    return () => {
      flushPendingBurst({ background: true });
      streamSessionIdRef.current += 1;
      streamAbortRef.current = null;
      if (followupTimerRef.current) {
        clearTimeout(followupTimerRef.current);
        followupTimerRef.current = null;
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      momentCheckTimersRef.current.forEach((t) => clearTimeout(t));
      momentCheckTimersRef.current = [];
    };
  }, [activeSlug, flushPendingBurst]);

  /**
   * 安排「这一轮」真正发出去的时间：每来一条新消息就重新等 BURST_WINDOW_MS；
   * 到点时如果还在输入框里打字，再多等一会儿，但总等待不超过 BURST_MAX_WAIT_MS。
   */
  const scheduleBurstFlush = useCallback((isFirstInBurst: boolean) => {
    const BURST_WINDOW_MS = 1600;
    const TYPING_EXTEND_MS = 1200;
    const BURST_MAX_WAIT_MS = 7000;
    if (isFirstInBurst) burstStartedAtRef.current = Date.now();
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    setPendingBurst(true);
    const slugAtSchedule = activeSlugRef.current;
    const groupAtSchedule = activeGroupIdRef.current;

    const tick = (delay: number) => {
      burstTimerRef.current = setTimeout(() => {
        if (
          activeSlugRef.current !== slugAtSchedule ||
          activeGroupIdRef.current !== groupAtSchedule
        ) {
          flushPendingBurst({ background: true });
          return;
        }
        const waited = Date.now() - burstStartedAtRef.current;
        if (inputRef.current.trim() && waited < BURST_MAX_WAIT_MS) {
          tick(TYPING_EXTEND_MS);
          return;
        }
        flushPendingBurst({ background: false });
      }, delay);
    };
    tick(BURST_WINDOW_MS);
  }, [flushPendingBurst]);

  const clearScheduledFollowup = useCallback(() => {
    if (followupTimerRef.current) {
      clearTimeout(followupTimerRef.current);
      followupTimerRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const loadPersonaList = useCallback(async () => {
    try {
      const res = await fetch("/api/personas");
      const data = await res.json();
      if (data.success && Array.isArray(data.personas)) {
        setPersonas(data.personas);
      }
    } catch (err) {
      console.error("Failed to load personas:", err);
    }
  }, []);

  const checkMomentsUpdate = useCallback(
    async (slug: string, options?: { markUnreadIfChanged?: boolean }) => {
      try {
        const res = await fetch(
          `/api/personas/${encodeURIComponent(slug)}/moments`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!data?.success || !Array.isArray(data.posts)) return;
        const topId = data.posts[0]?.id as string | undefined;
        if (!topId) return;
        const prevTopId = latestMomentIdRef.current[slug];
        if (!prevTopId) {
          latestMomentIdRef.current[slug] = topId;
          return;
        }
        if (topId !== prevTopId) {
          latestMomentIdRef.current[slug] = topId;
          if (options?.markUnreadIfChanged) {
            setUnreadMomentsBySlug((prev) => ({ ...prev, [slug]: true }));
          }
          setMomentsRefreshSignalBySlug((prev) => ({
            ...prev,
            [slug]: (prev[slug] || 0) + 1,
          }));
        }
      } catch {
        // Ignore silent moments polling error
      }
    },
    []
  );

  const handleClearUnreadMoments = useCallback(() => {
    setUnreadMomentsBySlug((prev) =>
      prev[activeSlug] ? { ...prev, [activeSlug]: false } : prev
    );
  }, [activeSlug]);

  const handleMomentsFeedLoaded = useCallback(
    (latestPostId?: string) => {
      if (latestPostId) {
        latestMomentIdRef.current[activeSlug] = latestPostId;
      }
      setUnreadMomentsBySlug((prev) =>
        prev[activeSlug] ? { ...prev, [activeSlug]: false } : prev
      );
    },
    [activeSlug]
  );

  // 每个群你看过的最后一条消息 id（存在本地浏览器，用来算侧栏未读）
  const groupSeenRef = useRef<Record<string, string>>({});
  const groupSeenLoadedRef = useRef(false);
  const saveGroupSeen = useCallback(() => {
    try {
      window.localStorage.setItem("personabot-group-seen", JSON.stringify(groupSeenRef.current));
    } catch {
      // 本地存储不可用时只是没有未读数
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      if (!groupSeenLoadedRef.current && typeof window !== "undefined") {
        groupSeenLoadedRef.current = true;
        try {
          groupSeenRef.current = JSON.parse(window.localStorage.getItem("personabot-group-seen") || "{}") || {};
        } catch {
          groupSeenRef.current = {};
        }
      }
      const res = await fetch(
        `/api/groups?seen=${encodeURIComponent(JSON.stringify(groupSeenRef.current))}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.groups)) {
        // 第一次见到的群：以现在为起点开始计未读，不把历史消息都算成未读；
        // 还是空的群记成 ''，之后群友发的第一批消息就会显示未读（以前空群会一直漏掉）
        let changed = false;
        for (const g of data.groups as GroupChat[]) {
          if (typeof groupSeenRef.current[g.id] !== "string") {
            groupSeenRef.current[g.id] = g.lastMessageId || "";
            g.unreadCount = 0;
            changed = true;
          }
          if (g.id === activeGroupIdRef.current) g.unreadCount = 0;
        }
        if (changed) saveGroupSeen();
        setGroups(data.groups);
      }
    } catch (err) {
      console.error("Failed to load groups:", err);
    }
  }, [saveGroupSeen]);

  const loadActivePersonaDetail = useCallback(async (slug: string) => {
    const myLoadId = ++detailLoadIdRef.current;
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/personas/${encodeURIComponent(slug)}`, { cache: "no-store" }),
        fetch(`/api/conversations?slug=${encodeURIComponent(slug)}&limit=100`, { cache: "no-store" }),
      ]);
      const pData = await pRes.json();
      const cData = await cRes.json();
      if (detailLoadIdRef.current !== myLoadId || activeSlugRef.current !== slug) {
        return;
      }

      if (pData.success && pData.persona) {
        const nextPersona = pData.persona as PersonaRecord;
        const prevMeta = prevProfileMetaRef.current[slug];
        const nextTags = nextPersona.profile.personalityTags || [];
        const nextAnchor = nextPersona.profile.appearanceAnchor;
        if (prevMeta) {
          const addedTags = nextTags.filter((t) => !prevMeta.tags.includes(t));
          const anchorAutoChanged =
            Boolean(nextAnchor) &&
            nextAnchor !== prevMeta.appearanceAnchor &&
            !nextPersona.profile.appearanceAnchorLocked;
          const parts: string[] = [];
          if (addedTags.length > 0) {
            parts.push(`新增性格标签「${addedTags.join("、")}」`);
          }
          if (anchorAutoChanged) {
            parts.push("已同步更新外貌与画风锚点");
          }
          if (parts.length > 0) {
            setGrowthNoticeBySlug((prev) => ({
              ...prev,
              [slug]: parts.join("；"),
            }));
          }
        }
        prevProfileMetaRef.current[slug] = {
          tags: nextTags,
          appearanceAnchor: nextAnchor,
        };
        setActivePersona(nextPersona);
        setActiveMode(nextPersona.defaultMode || "authentic");
      }
      if (activeGroupIdRef.current) {
        // 群聊里只刷新主 bot 资料，消息列表由群聊自己管理
      } else if (cData.success && Array.isArray(cData.messages)) {
        applyServerMessages(channelKey({ slug }), cData.messages as ConversationMessage[], true);
      } else {
        applyServerMessages(channelKey({ slug }), [], true);
      }
      void checkMomentsUpdate(slug, { markUnreadIfChanged: false });
    } catch (err) {
      console.error("Failed to load active persona:", err);
    }
  }, [applyServerMessages, checkMomentsUpdate]);

  const requestMediaRecover = useCallback(async (target: { slug?: string; groupId?: string }) => {
    try {
      await fetch("/api/media/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
    } catch {
      // 补生成失败不影响聊天
    }
  }, []);

  const checkInflightOnce = useCallback(async (target: { slug?: string; groupId?: string }) => {
    try {
      const query = target.groupId
        ? `groupId=${encodeURIComponent(target.groupId)}`
        : `slug=${encodeURIComponent(target.slug || "")}`;
      const res = await fetch(`/api/chat/inflight?${query}`, { cache: "no-store" });
      const data = await res.json();
      return Boolean(data?.inflight);
    } catch {
      return false;
    }
  }, []);

  // 切回来时如果这里还有回复在生成（你中途切走过），显示「正在输入」并持续刷新，直到写完
  const [backgroundTyping, setBackgroundTyping] = useState<string | null>(null);
  const inflightWatchRef = useRef(0);
  const watchInflight = useCallback(
    async (target: { slug?: string; groupId?: string }, label: string) => {
      const watchId = ++inflightWatchRef.current;
      const stillHere = () =>
        inflightWatchRef.current === watchId &&
        (target.groupId
          ? activeGroupIdRef.current === target.groupId
          : !activeGroupIdRef.current && activeSlugRef.current === target.slug);
      const query = target.groupId
        ? `groupId=${encodeURIComponent(target.groupId)}`
        : `slug=${encodeURIComponent(target.slug || "")}`;
      const key = channelKey(target);
      const reload = async (): Promise<ConversationMessage[] | null> => {
        const res = await fetch(
          target.groupId
            ? `/api/groups/${encodeURIComponent(target.groupId)}`
            : `/api/conversations?slug=${encodeURIComponent(target.slug || "")}&limit=100`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (stillHere() && data?.success && Array.isArray(data.messages)) {
          const list = data.messages as ConversationMessage[];
          applyServerMessages(key, list, false);
          return list;
        }
        return null;
      };
      try {
        for (let i = 0; i < 90 && stillHere(); i += 1) {
          // 你自己正在发消息、页面在实时接收时，交给实时推送显示
          if (streamingRef.current) break;
          const res = await fetch(`/api/chat/inflight?${query}`, { cache: "no-store" });
          const data = await res.json();
          if (!stillHere()) return;
          if (!data?.inflight) {
            if ((clientInflightCountByChannelRef.current[key] || 0) > 0 && i < 5) {
              setBackgroundTyping(label);
              await new Promise((r) => setTimeout(r, 400));
              continue;
            }
            const latest = await reload();
            if (latest && latest.some((m) => hasPendingMedia(m.mediaCards))) {
              void requestMediaRecover(target);
            }
            break;
          }
          setBackgroundTyping(data.label || label);
          await reload();
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch {
        // 查询失败不影响正常使用
      } finally {
        if (inflightWatchRef.current === watchId) setBackgroundTyping(null);
      }
    },
    [applyServerMessages, requestMediaRecover]
  );

  // ── 照片 / 表情包的补生成与重试 ──────────────────────────────
  // 打开单聊 / 群聊时，请服务端把卡住或到点重试的图片重新排队（连不上生图服务时会标记「网络恢复后自动补发」）
  useEffect(() => {
    void requestMediaRecover(activeGroupId ? { groupId: activeGroupId } : { slug: activeSlug });
  }, [activeSlug, activeGroupId, requestMediaRecover]);

  // 还有图片在等结果时轮询进度：先问轻量的 /api/media/status 拿指纹，变了才拉完整消息；
  // 没变化时间隔从 4 秒逐步放慢到 15 秒，页面在后台时暂停；每 20 秒再请服务端检查一次要不要补发
  const mediaPending = messages.some((m) => hasPendingMedia(m.mediaCards));
  const mediaStreaming = Boolean(streaming);
  useEffect(() => {
    if (!mediaPending || mediaStreaming) return;
    const target = activeGroupId ? { groupId: activeGroupId } : { slug: activeSlug };
    const key = channelKey(target);
    const query = target.groupId
      ? `groupId=${encodeURIComponent(target.groupId)}`
      : `slug=${encodeURIComponent(target.slug || "")}`;
    const startedAt = Date.now();
    let lastRecoverAt = Date.now();
    let lastFingerprint: string | null = null;
    let delay = MEDIA_POLL_MIN_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = (ms: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };

    const fetchFullMessages = async () => {
      try {
        const res = await fetch(
          target.groupId
            ? `/api/groups/${encodeURIComponent(target.groupId)}`
            : `/api/conversations?slug=${encodeURIComponent(target.slug || "")}&limit=100`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (cancelled || !data?.success || !Array.isArray(data.messages)) return;
        applyServerMessages(key, data.messages as ConversationMessage[], false);
      } catch {
        // 下次再刷
      }
    };

    const tick = async () => {
      if (cancelled) return;
      // 最多盯 15 分钟，避免一直刷新
      if (Date.now() - startedAt > 15 * 60_000) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        schedule(delay);
        return;
      }
      if (Date.now() - lastRecoverAt >= 20_000) {
        lastRecoverAt = Date.now();
        void requestMediaRecover(target);
      }
      let changed = true;
      try {
        const res = await fetch(`/api/media/status?${query}`, { cache: "no-store" });
        const data = await res.json();
        if (data?.success && typeof data.fingerprint === "string") {
          changed = data.fingerprint !== lastFingerprint;
          lastFingerprint = data.fingerprint;
        }
      } catch {
        // 拿不到指纹就当作有变化，退回拉完整消息
      }
      if (cancelled) return;
      if (changed) await fetchFullMessages();
      delay = nextMediaPollDelay(delay, changed);
      schedule(delay);
    };

    // 切回页面时立刻查一次，并把间隔重置为 4 秒
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      delay = MEDIA_POLL_MIN_MS;
      schedule(0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(delay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mediaPending, mediaStreaming, activeSlug, activeGroupId, applyServerMessages, requestMediaRecover]);

  // 你点了「重试」：立刻重新生成这一张（不受自动重试次数限制）
  const handleRetryMedia = useCallback(
    async (messageId: string, cardIndex: number) => {
      const groupId = activeGroupIdRef.current;
      const channelSlug = activeSlugRef.current;
      const target = messages.find((m) => m.id === messageId);
      const slug = groupId ? target?.fromBot?.slug : channelSlug;
      const personaSlug = !groupId && target?.fromBot?.slug ? target.fromBot.slug : undefined;
      if (!target || !slug) return;
      const isSameView = () =>
        activeGroupIdRef.current === groupId &&
        (Boolean(groupId) || activeSlugRef.current === channelSlug);
      const patchCard = (patch: Partial<MediaCard>) => {
        if (!isSameView()) return;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId || !m.mediaCards?.[cardIndex]) return m;
            const cards = [...m.mediaCards];
            cards[cardIndex] = { ...cards[cardIndex], ...patch };
            return { ...m, mediaCards: cards };
          })
        );
      };
      patchCard({ status: "generating", waitingForNetwork: undefined, errorHint: undefined });
      try {
        const res = await fetch("/api/media/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            ...(personaSlug ? { personaSlug } : {}),
            messageId,
            cardIndex,
            groupId: groupId || undefined,
            manual: true,
          }),
        });
        const data = await res.json();
        if (data?.card) patchCard(data.card);
        else patchCard({ status: "error", errorHint: data?.error || "还是没发出来" });
      } catch {
        patchCard({ status: "error", errorHint: "网络不太好，还是没发出来" });
      }
    },
    [messages]
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      await Promise.all([
        loadPersonaList().then(() => markSplashStep("personas")),
        loadGroups().then(() => markSplashStep("groups")),
      ]);
      if (!active) return;
      if (!activeGroupIdRef.current) {
        // 先查 inflight 再拉聊天记录：避免服务端刚结束 inflight、消息却没拉到的竞态漏刷
        const key = channelKey({ slug: activeSlug });
        const isInflight = await checkInflightOnce({ slug: activeSlug });
        if (!active || activeGroupIdRef.current || activeSlugRef.current !== activeSlug) return;
        await loadActivePersonaDetail(activeSlug);
        markSplashStep("detail");
        const shouldWatch =
          isInflight ||
          (clientInflightCountByChannelRef.current[key] || 0) > 0 ||
          (pendingLocalMsgsByChannelRef.current[key]?.length || 0) > 0;
        if (active && !activeGroupIdRef.current && activeSlugRef.current === activeSlug && shouldWatch) {
          void watchInflight({ slug: activeSlug }, "对方");
        }
      } else {
        await loadActivePersonaDetail(activeSlug);
        markSplashStep("detail");
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [activeSlug, loadPersonaList, loadGroups, loadActivePersonaDetail, checkInflightOnce, watchInflight, markSplashStep]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowCreateBot(true);
      } else if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (personas[idx]) {
          e.preventDefault();
          setActiveSlug(personas[idx].slug);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [personas]);

  useEffect(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (!autoNudgeEnabled) return;
    if (pendingBurst) return;
    if (activeGroupId) return;
    if (streaming) return;
    if (followupTimerRef.current) return;
    if (input.trim().length > 0) return;
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;
    if (idleNudgeCountRef.current >= 2) return;

    const nextCount = idleNudgeCountRef.current + 1;
    const delayMs = nextCount === 1 ? 45_000 : 120_000;
    const targetSlug = activeSlug;

    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (activeSlugRef.current !== targetSlug) return;
      idleNudgeCountRef.current = nextCount;
      void fetch("/api/chat/proactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: targetSlug,
          idleFollowup: true,
          idleSeconds: Math.round(delayMs / 1000),
          nudgeCount: nextCount,
          persist: true,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (
            data?.success &&
            data.message &&
            activeSlugRef.current === targetSlug
          ) {
            setMessages((prev) => [...prev, data.message as ConversationMessage]);
            void loadPersonaList();
          }
        })
        .catch(() => {
          // Ignore background idle nudge error
        });
    }, delayMs);

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [
    autoNudgeEnabled,
    pendingBurst,
    activeSlug,
    activeGroupId,
    messages,
    streaming,
    input,
    loadPersonaList,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (streaming && activePersona) {
      document.title = `${activePersona.name} 正在输入... · PersonaBot`;
    } else if (activePersona) {
      document.title = `${activePersona.name} — PersonaBot`;
    } else {
      document.title = "PersonaBot — Grok Bot 拟人桌面工作台";
    }
  }, [streaming, activePersona]);

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("personabot-theme", next);
    }
  };

  // 群里自己聊起来：记录你最后一次说话/打字的时间，按节奏播放角色们的自发闲聊
  const lastUserActivityRef = useRef<number>(0);
  const ambientInFlightRef = useRef(false);
  const [groupTyping, setGroupTyping] = useState<{ slug: string; name: string } | null>(null);
  const [newMessagesFromId, setNewMessagesFromId] = useState<string | null>(null);
  const pendingBurstRef = useRef(false);
  const ambientPlaybackRef = useRef<{
    groupId: string;
    items: Array<{ msg: ConversationMessage; delay: number }>;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const appendGroupMessages = useCallback((groupId: string, incoming: ConversationMessage[]) => {
    if (activeGroupIdRef.current !== groupId || incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      messagesRef.current = next;
      return next;
    });
  }, []);

  /** 立刻把还没播放完的自发闲聊全部显示出来（你开口或切走时） */
  const flushAmbientPlayback = useCallback(() => {
    const pb = ambientPlaybackRef.current;
    if (!pb) return;
    setGroupTyping(null);
    if (pb.timer) clearTimeout(pb.timer);
    ambientPlaybackRef.current = null;
    appendGroupMessages(pb.groupId, pb.items.map((it) => it.msg));
  }, [appendGroupMessages]);

  const playAmbient = useCallback(
    (groupId: string, msgs: ConversationMessage[], delays: number[]) => {
      flushAmbientPlayback();
      const pb = {
        groupId,
        items: msgs.map((msg, i) => ({ msg, delay: Math.min(20_000, Math.max(0, delays[i] ?? 1500)) })),
        timer: null as ReturnType<typeof setTimeout> | null,
      };
      ambientPlaybackRef.current = pb;
      const step = () => {
        const next = pb.items[0];
        if (!next || ambientPlaybackRef.current !== pb) return;
        // 发出前一小段时间显示「XX 正在输入…」（系统提示不显示）
        const typingLead = next.msg.systemTip || !next.msg.fromBot ? 0 : Math.min(next.delay, 2600);
        const reveal = () => {
          if (ambientPlaybackRef.current !== pb) return;
          setGroupTyping(null);
          pb.items.shift();
          appendGroupMessages(groupId, [next.msg]);
          if (pb.items.length === 0) {
            ambientPlaybackRef.current = null;
            void loadGroups();
          } else {
            step();
          }
        };
        pb.timer = setTimeout(() => {
          if (ambientPlaybackRef.current !== pb) return;
          if (typingLead > 0 && next.msg.fromBot) {
            setGroupTyping({ slug: next.msg.fromBot.slug, name: next.msg.fromBot.name });
            pb.timer = setTimeout(reveal, typingLead);
          } else {
            reveal();
          }
        }, Math.max(0, next.delay - typingLead));
      };
      step();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appendGroupMessages, flushAmbientPlayback]
  );

  const requestAmbient = useCallback(
    async (groupId: string, mode: "idle" | "catchup") => {
      if (ambientInFlightRef.current) return;
      ambientInFlightRef.current = true;
      try {
        const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/ambient`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, userIdleMs: Date.now() - lastUserActivityRef.current }),
        });
        const data = await res.json();
        if (!data?.success || !data.ok || !Array.isArray(data.messages)) return;
        if (activeGroupIdRef.current !== groupId) return;
        // 生成期间你开口了：不再播放，直接补上（顺序以服务端为准）
        if (mode === "catchup" || streamingRef.current || Date.now() - lastUserActivityRef.current < 5_000) {
          if (mode === "catchup" && data.messages[0]) {
            const firstId = data.messages[0].id as string;
            setNewMessagesFromId((prev) => prev ?? firstId);
          }
          appendGroupMessages(groupId, data.messages);
          void loadGroups();
        } else {
          playAmbient(groupId, data.messages, data.playbackDelays || []);
        }
      } catch {
        // 自发闲聊失败不打扰你
      } finally {
        ambientInFlightRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appendGroupMessages, playAmbient]
  );

  useEffect(() => {
    lastUserActivityRef.current = Date.now();
  }, [input]);

  useEffect(() => {
    streamingRef.current = Boolean(streaming);
    pendingBurstRef.current = pendingBurst;
  });

  // 停在群里没说话时，大约每 15 秒看一次要不要有人起话题（服务端再按冷却与上限把关）
  useEffect(() => {
    if (!activeGroupId) return;
    lastUserActivityRef.current = Date.now();
    const timer = setInterval(() => {
      const gid = activeGroupIdRef.current;
      if (!gid || gid !== activeGroupId) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (streamingRef.current || pendingBurstRef.current || ambientPlaybackRef.current) return;
      if (inputRef.current.trim()) return;
      if (Date.now() - lastUserActivityRef.current < 75_000) return;
      void requestAmbient(gid, "idle");
    }, 15_000);
    return () => clearInterval(timer);
  }, [activeGroupId, requestAmbient]);

  // 正在看的群：记下看到的最后一条（离开后新来的才算未读）
  useEffect(() => {
    if (!activeGroupId || messages.length === 0) return;
    const lastId = messages[messages.length - 1]?.id;
    if (lastId && groupSeenRef.current[activeGroupId] !== lastId) {
      groupSeenRef.current[activeGroupId] = lastId;
      saveGroupSeen();
    }
  }, [activeGroupId, messages, saveGroupSeen]);

  // 应用开着时，大约每 5 分钟给没在看的群补一下「你不在时」的聊天，侧栏据此显示未读
  const groupsRef = useRef<GroupChat[]>([]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  useEffect(() => {
    let stopped = false;
    const sweep = async () => {
      if (stopped || (typeof document !== "undefined" && document.visibilityState !== "visible")) return;
      for (const g of groupsRef.current) {
        if (stopped || g.id === activeGroupIdRef.current) continue;
        try {
          const res = await fetch(`/api/groups/${encodeURIComponent(g.id)}/ambient`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "catchup" }),
          });
          await res.json().catch(() => null);
        } catch {
          // 忽略单个群的失败
        }
      }
      // 没有新补的聊天也刷新一下：别处（主 bot 建群、群里后台回复）带来的未读和预览也能跟上
      if (!stopped) void loadGroups();
    };
    const first = setTimeout(sweep, 20_000);
    const timer = setInterval(sweep, 5 * 60_000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [loadGroups]);

  // 进入 / 退出群聊：切换消息列表；新建的群自动让主 bot 开场
  const kickoffDoneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    flushAmbientPlayback();
    queueMicrotask(() => {
      setNewMessagesFromId(null);
      setGroupTyping(null);
      setStreaming(null);
    });
    activeGroupIdRef.current = activeGroupId;
    flushPendingBurst({ background: true });
    streamSessionIdRef.current += 1;
    streamAbortRef.current = null;
    if (!activeGroupId) return;
    let cancelled = false;
    void (async () => {
      try {
        const key = channelKey({ groupId: activeGroupId });
        const isInflight = await checkInflightOnce({ groupId: activeGroupId });
        if (cancelled || activeGroupIdRef.current !== activeGroupId) return;
        const res = await fetch(`/api/groups/${encodeURIComponent(activeGroupId)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled || activeGroupIdRef.current !== activeGroupId) return;
        if (!data.success) {
          setActiveGroupId(null);
          return;
        }
        const groupMessages: ConversationMessage[] = Array.isArray(data.messages)
          ? data.messages
          : [];
        applyServerMessages(key, groupMessages, true);
        // 「以下为新消息」：从你上次看到的那条之后第一条群友消息开始
        const seenId = groupSeenRef.current[activeGroupId];
        const seenIdx = seenId ? groupMessages.findIndex((m) => m.id === seenId) : -1;
        const firstUnread =
          seenIdx >= 0 ? groupMessages.slice(seenIdx + 1).find((m) => m.role !== "user") : undefined;
        setNewMessagesFromId(firstUnread?.id ?? null);
        const shouldWatch =
          isInflight ||
          (clientInflightCountByChannelRef.current[key] || 0) > 0 ||
          (pendingLocalMsgsByChannelRef.current[key]?.length || 0) > 0;
        if (
          data.group?.pendingKickoff &&
          groupMessages.length === 0 &&
          !kickoffDoneRef.current.has(activeGroupId)
        ) {
          kickoffDoneRef.current.add(activeGroupId);
          await runStreamRequestRef.current?.([], activeMode, { kickoff: true });
        } else if (shouldWatch) {
          void watchInflight({ groupId: activeGroupId }, "群里有人");
        }
        if (!data.group?.pendingKickoff && groupMessages.length > 0) {
          // 隔了一段时间再打开：补上你不在时大家聊的（服务端判断空档是否够长）
          void requestAmbient(activeGroupId, "catchup");
        }
      } catch (err) {
        console.error("Failed to load group:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  const handleSelectPersona = (slug: string) => {
    const wasInGroup = Boolean(activeGroupIdRef.current);
    if (!wasInGroup && slug === activeSlugRef.current) return;
    flushPendingBurst({ background: true });
    streamSessionIdRef.current += 1;
    activeGroupIdRef.current = null;
    setActiveGroupId(null);
    if (slug === activeSlug && wasInGroup) {
      // 从群聊回到同一个角色（群聊挂在主 bot 下，最常见的是回到主 bot）：
      // 角色没变，不会触发切换角色时的「还在生成就继续显示正在输入」，这里要自己接上，
      // 否则你在群里时还没写完的回复，回来后停在半截、也不再刷新
      void (async () => {
        const key = channelKey({ slug });
        const isInflight = await checkInflightOnce({ slug });
        if (activeGroupIdRef.current || activeSlugRef.current !== slug) return;
        await loadActivePersonaDetail(slug);
        const shouldWatch =
          isInflight ||
          (clientInflightCountByChannelRef.current[key] || 0) > 0 ||
          (pendingLocalMsgsByChannelRef.current[key]?.length || 0) > 0;
        if (!activeGroupIdRef.current && activeSlugRef.current === slug && shouldWatch) {
          void watchInflight({ slug }, "对方");
        }
      })();
    }
    setActiveSlug(slug);
  };

  const handleSelectGroup = (groupId: string) => {
    if (activeGroupIdRef.current === groupId) return;
    flushPendingBurst({ background: true });
    streamSessionIdRef.current += 1;
    activeGroupIdRef.current = groupId;
    setMessages([]);
    setActiveSlug("master-bot");
    setActiveGroupId(groupId);
  };

  const handleCreateGroup = async (input: {
    name: string;
    memberSlugs: string[];
    topic?: string;
  }) => {
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!data.success || !data.group) {
      throw new Error(data?.error?.message || "建群失败");
    }
    await loadGroups();
    setShowCreateGroup(false);
    handleSelectGroup(data.group.id);
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await fetch(`/api/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete group:", err);
    }
    if (activeGroupIdRef.current === groupId) {
      handleSelectPersona("master-bot");
    }
    await loadGroups();
  };

  const handleStopStreaming = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  };

  const handleRefineReferencePortrait = useCallback(
    async (
      targetSlug: string,
      options?: {
        sourceImageUrl?: string;
        expectedCurrentRef?: string;
        mode?: "auto" | "manual";
      }
    ) => {
      if (!targetSlug || refiningRefSlugsRef.current[targetSlug]) return;
      refiningRefSlugsRef.current[targetSlug] = true;
      setRefiningRefSlugs((prev) => ({ ...prev, [targetSlug]: true }));
      setRefineRefNotice((prev) => ({ ...prev, [targetSlug]: null }));

      try {
        const res = await fetch("/api/media/reference/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: targetSlug,
            sourceImageUrl: options?.sourceImageUrl,
            expectedCurrentRef: options?.expectedCurrentRef,
            mode: options?.mode || "manual",
          }),
        });
        const data = await res.json();
        if (data?.success) {
          if (!data.skippedOverwrite) {
            if (activeSlugRef.current === targetSlug) {
              await loadActivePersonaDetail(targetSlug);
            }
            setRefineRefNotice((prev) => ({
              ...prev,
              [targetSlug]: data.appearanceAnchorUpdated
                ? "✓ 已更新标准棚拍参考图，并自动同步外貌与画风锚点"
                : "✓ 已更新为标准棚拍参考图",
            }));
          }
        } else {
          setRefineRefNotice((prev) => ({
            ...prev,
            [targetSlug]:
              data?.error ||
              "标准参考图提炼未成功，已暂用当前照片兜底，可随时重试",
          }));
        }
      } catch {
        setRefineRefNotice((prev) => ({
          ...prev,
          [targetSlug]: "标准参考图提炼未成功，已暂用当前照片兜底，可随时重试",
        }));
      } finally {
        refiningRefSlugsRef.current[targetSlug] = false;
        setRefiningRefSlugs((prev) => ({ ...prev, [targetSlug]: false }));
      }
    },
    [loadActivePersonaDetail]
  );

  const runStreamRequest = async (
    historyToSend: ConversationMessage[],
    modeToUse: PersonaMode,
    options?: {
      requestPhoto?: boolean;
      requestSticker?: boolean;
      mentionedSlug?: string;
      deepSearchOverride?: boolean;
      kickoff?: boolean;
    }
  ) => {
    const mySessionId = ++streamSessionIdRef.current;
    const requestSlug = activeSlugRef.current;
    const requestGroupId = activeGroupIdRef.current;
    const isCurrentSession = () =>
      streamSessionIdRef.current === mySessionId &&
      activeGroupIdRef.current === requestGroupId &&
      (Boolean(requestGroupId) || activeSlugRef.current === requestSlug);
    const isSameChannel = () =>
      activeGroupIdRef.current === requestGroupId &&
      (Boolean(requestGroupId) || activeSlugRef.current === requestSlug);
    const reqKey = channelKey({ slug: requestSlug, groupId: requestGroupId });
    clientInflightCountByChannelRef.current[reqKey] =
      (clientInflightCountByChannelRef.current[reqKey] || 0) + 1;

    clearScheduledFollowup();
    idleNudgeCountRef.current = 0;
    const useDeepSearch = options?.deepSearchOverride ?? deepSearch;

    setStreaming({
      isSearching: useDeepSearch,
      thought: "",
      thoughtDurationMs: 0,
      isStreamingThought: thinkMode,
      reply: "",
      bursts: [],
      mediaCards: [],
    });

    try {
      const controller = new AbortController();
      streamAbortRef.current = controller;
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          slug: requestSlug,
          groupId: requestGroupId || undefined,
          kickoff: options?.kickoff,
          mentionedSlug: requestGroupId ? undefined : options?.mentionedSlug,
          messages: historyToSend.map((m) => ({
            role: m.role,
            content: m.content,
            imageUrl: m.imageUrl,
            timestamp: m.timestamp,
          })),
          mode: modeToUse,
          thinkMode,
          deepSearch: useDeepSearch,
          requestPhoto: options?.requestPhoto,
          requestSticker: options?.requestSticker,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream status ${res.status}`);
      }

      const reader = res.body.getReader();
      if (!isCurrentSession()) {
        void reader.cancel().catch(() => {});
      }
      const decoder = new TextDecoder();
      // 流式更新按帧合并：每帧最多重画一次
      // 切到别的会话后，还没提交的更新直接丢掉，不会串到新会话
      const streamBatch = createFrameBatcher<typeof streaming>((update) => {
        if (isCurrentSession()) setStreaming(update);
      });
      let buffer = "";
      let finalMessage: ConversationMessage | null = null;
      // 本轮所有消息（群聊里照片 / 表情包可能挂在任意一位成员的消息上）
      let turnMessages: ConversationMessage[] = [];
      let pendingFollowup: PendingFollowup | undefined;
      const committedIds = new Set<string>();

      while (isCurrentSession()) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!isCurrentSession()) {
          void reader.cancel().catch(() => {});
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const dataLine = block
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6));
            if (!isCurrentSession()) continue;
            if (payload.type === "status") {
              streamBatch.push((prev) =>
                prev
                  ? {
                      ...prev,
                      statusText: payload.text,
                    }
                  : prev
              );
            } else if (payload.type === "search") {
              streamBatch.push((prev) =>
                prev
                  ? {
                      ...prev,
                      isSearching: payload.status === "searching",
                      searchQuery: payload.query,
                      searchResults: payload.results,
                    }
                  : prev
              );
            } else if (payload.type === "thought") {
              streamBatch.push((prev) =>
                prev
                  ? {
                      ...prev,
                      isSearching: false,
                      thought: payload.fullThought,
                      thoughtDurationMs: payload.durationMs,
                      isStreamingThought: true,
                    }
                  : prev
              );
            } else if (payload.type === "emotion") {
              setActivePersona((prev) =>
                prev
                  ? {
                      ...prev,
                      emotionState: payload.emotionState,
                      intimacy: payload.intimacy,
                    }
                  : prev
              );
            } else if (payload.type === "media" && Array.isArray(payload.mediaCards)) {
              streamBatch.push((prev) =>
                prev
                  ? {
                      ...prev,
                      statusText: undefined,
                      mediaCards: payload.mediaCards as MediaCard[],
                    }
                  : prev
              );
            } else if (payload.type === "reply") {
              streamBatch.push((prev) =>
                prev
                  ? {
                      ...prev,
                      isSearching: false,
                      isStreamingThought: false,
                      statusText: undefined,
                      reply: payload.fullReply,
                      bursts: Array.isArray(payload.bursts)
                        ? payload.bursts
                        : prev.bursts,
                    }
                  : prev
              );
            } else if (payload.type === "message_part" && payload.message) {
              const partMsg = payload.message as ConversationMessage;
              committedIds.add(partMsg.id);
              setMessages((prev) =>
                prev.some((m) => m.id === partMsg.id) ? prev : [...prev, partMsg]
              );
              const responderName =
                partMsg.fromBot?.name || activePersona?.name || "对方";
              streamBatch.push((prev) =>
                prev
                  ? {
                      ...prev,
                      isSearching: false,
                      isStreamingThought: false,
                      thought: "",
                      thoughtDurationMs: 0,
                      searchQuery: undefined,
                      searchResults: undefined,
                      reply: "",
                      bursts: [],
                      statusText: payload.hasMore
                        ? `${responderName} 正在输入...`
                        : undefined,
                    }
                  : prev
              );
              // 这一段已落成正式消息：和 setMessages 同一拍提交，避免一帧里正文出现两次
              streamBatch.flush();
            } else if (payload.type === "done" && payload.message) {
              finalMessage = payload.message as ConversationMessage;
              turnMessages = Array.isArray(payload.messages)
                ? (payload.messages as ConversationMessage[])
                : [finalMessage];
              if (payload.followup) {
                pendingFollowup = payload.followup as PendingFollowup;
              }
            }
          } catch {
            // Ignore malformed chunk
          }
        }
      }

      if (isCurrentSession()) streamBatch.flush();
      else streamBatch.cancel();

      if (finalMessage && isCurrentSession()) {
        if (!committedIds.has(finalMessage.id)) {
          setMessages((prev) =>
            prev.some((m) => m.id === finalMessage!.id)
              ? prev
              : [...prev, finalMessage!]
          );
        }

        // Check silently after turn completes if the persona autonomously posted a new moment
        const turnSlug = requestSlug;
        momentCheckTimersRef.current.forEach((t) => clearTimeout(t));
        momentCheckTimersRef.current = [
          setTimeout(() => {
            void checkMomentsUpdate(turnSlug, { markUnreadIfChanged: true });
          }, 4000),
          setTimeout(() => {
            void checkMomentsUpdate(turnSlug, { markUnreadIfChanged: true });
          }, 12000),
        ];

        // Trigger non-blocking background image/sticker generation for any pending cards
        const cardSources = turnMessages.length > 0 ? turnMessages : [finalMessage];
        cardSources.forEach((sourceMsg) => (sourceMsg.mediaCards || []).forEach((card, cardIndex) => {
          if (
            (card.type === "sticker" || card.type === "photo") &&
            card.status === "generating"
          ) {
            const targetMessageId = sourceMsg.id;
            // 群聊：用发图那位成员的形象生成，结果写回群聊记录；单聊 @提及 时区分频道与形象归属
            const targetChannelSlug = requestGroupId
              ? sourceMsg.fromBot?.slug || requestSlug
              : requestSlug;
            const targetPersonaSlug =
              !requestGroupId && sourceMsg.fromBot?.slug ? sourceMsg.fromBot.slug : undefined;
            const visualSlug = targetPersonaSlug || targetChannelSlug;
            void fetch("/api/media/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: targetChannelSlug,
                ...(targetPersonaSlug ? { personaSlug: targetPersonaSlug } : {}),
                messageId: targetMessageId,
                cardIndex,
                kind: card.type,
                caption: card.caption,
                groupId: requestGroupId || undefined,
              }),
            })
              .then((r) => r.json())
              .then((resData) => {
                if (resData?.success && resData.card) {
                  if (isSameChannel()) {
                    setMessages((prevMsgs) =>
                      prevMsgs.map((m) => {
                        if (m.id !== targetMessageId) return m;
                        const updated = [...(m.mediaCards || [])];
                        updated[cardIndex] = {
                          ...updated[cardIndex],
                          ...resData.card,
                        };
                        return { ...m, mediaCards: updated };
                      })
                    );
                  }
                  if (
                    resData.autoLockedReference &&
                    activeSlugRef.current === visualSlug
                  ) {
                    void loadActivePersonaDetail(visualSlug);
                  }
                  if (resData.shouldRefineReference && resData.sourcePhotoUrl) {
                    void handleRefineReferencePortrait(visualSlug, {
                      sourceImageUrl: resData.sourcePhotoUrl,
                      expectedCurrentRef: resData.sourcePhotoUrl,
                      mode: "auto",
                    });
                  }
                } else if (isSameChannel()) {
                  void requestMediaRecover(
                    requestGroupId ? { groupId: requestGroupId } : { slug: requestSlug }
                  );
                }
              })
              .catch(() => {
                if (!isSameChannel()) return;
                setMessages((prevMsgs) =>
                  prevMsgs.map((m) => {
                    if (m.id !== targetMessageId) return m;
                    const updated = [...(m.mediaCards || [])];
                    if (updated[cardIndex]) {
                      updated[cardIndex] = {
                        ...updated[cardIndex],
                        status: "error",
                        errorHint: "刚刚信号不太好，照片没发出去",
                      };
                    }
                    return { ...m, mediaCards: updated };
                  })
                );
                void requestMediaRecover(
                  requestGroupId ? { groupId: requestGroupId } : { slug: requestSlug }
                );
              });
          }
        }));
        // Schedule autonomous delayed follow-up if the model chose [FOLLOWUP: delaySec | content]
        if (pendingFollowup && pendingFollowup.content) {
          const scheduledSlug = requestSlug;
          const scheduledFollowup = pendingFollowup;
          const delayMs =
            Math.max(5, Math.min(120, scheduledFollowup.delaySec || 8)) * 1000;
          followupTimerRef.current = setTimeout(() => {
            followupTimerRef.current = null;
            if (activeSlugRef.current !== scheduledSlug || activeGroupIdRef.current) return;
            void fetch("/api/chat/followup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: scheduledSlug,
                content: scheduledFollowup.content,
                fromBot: scheduledFollowup.fromBot,
              }),
            })
              .then((r) => r.json())
              .then((resData) => {
                if (
                  resData?.success &&
                  resData.message &&
                  activeSlugRef.current === scheduledSlug &&
                  !activeGroupIdRef.current
                ) {
                  setMessages((prevMsgs) => [
                    ...prevMsgs,
                    resData.message as ConversationMessage,
                  ]);
                  void loadPersonaList();
                }
              })
              .catch(() => {
                // Ignore background followup failure
              });
          }, delayMs);
        }
      }
      await (requestGroupId ? loadGroups() : loadPersonaList());
      if (finalMessage?.groupInvite) {
        await loadGroups();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Streaming chat error:", error);
      }
    } finally {
      const nextCount = (clientInflightCountByChannelRef.current[reqKey] || 1) - 1;
      if (nextCount <= 0) delete clientInflightCountByChannelRef.current[reqKey];
      else clientInflightCountByChannelRef.current[reqKey] = nextCount;
      if (streamSessionIdRef.current === mySessionId) {
        streamAbortRef.current = null;
        setStreaming(null);
      }
    }
  };

  const handleSend = async (options?: {
    imageUrl?: string;
    requestPhoto?: boolean;
    requestSticker?: boolean;
    mentionedSlug?: string;
  }) => {
    const text =
      input.trim() ||
      (options?.requestSticker
        ? "发个适合现在氛围的表情包给我看看～"
        : options?.requestPhoto
          ? "发张你那边的随手拍给我看看呗 📸"
          : "");
    if (!text && !options?.imageUrl) return;
    if (streaming) return;
    // 你一开口：没播完的群友闲聊立刻显示，再发你的话
    flushAmbientPlayback();
    lastUserActivityRef.current = Date.now();

    const userMsg: ConversationMessage = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: text || "[发送了一张图片]",
      timestamp: new Date().toISOString(),
      imageUrl: options?.imageUrl,
      mode: activeMode,
    };

    recordLocalUserMessage(
      channelKey({ slug: activeSlugRef.current, groupId: activeGroupIdRef.current }),
      userMsg
    );
    const nextHistory = [...messagesRef.current, userMsg];
    messagesRef.current = nextHistory;
    setMessages(nextHistory);
    setInput("");
    clearScheduledFollowup();

    // 要照片 / 表情包 / @ 某人是明确指令，立刻发；普通聊天等一下看还有没有下一条
    const isDirective =
      options?.requestPhoto || options?.requestSticker || options?.mentionedSlug;
    if (isDirective) {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
      pendingBurstDataRef.current = null;
      setPendingBurst(false);
      await runStreamRequest(nextHistory, activeMode, {
        requestPhoto: options?.requestPhoto,
        requestSticker: options?.requestSticker,
        mentionedSlug: options?.mentionedSlug,
      });
      return;
    }
    pendingBurstDataRef.current = {
      slug: activeSlugRef.current,
      groupId: activeGroupIdRef.current,
      mode: activeMode,
      thinkMode,
      deepSearch,
      messages: nextHistory,
    };
    scheduleBurstFlush(burstTimerRef.current ? false : true);
  };


  useEffect(() => {
    messagesRef.current = messages;
    inputRef.current = input;
    runStreamRequestRef.current = runStreamRequest;
  });

  const handleQuickSend = async (
    text: string,
    options?: { deepSearch?: boolean }
  ) => {
    if (!text.trim() || streaming) return;
    if (options?.deepSearch) {
      setDeepSearch(true);
    }
    const userMsg: ConversationMessage = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString(),
      mode: activeMode,
    };
    recordLocalUserMessage(
      channelKey({ slug: activeSlugRef.current, groupId: activeGroupIdRef.current }),
      userMsg
    );
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    await runStreamRequest(nextHistory, activeMode, {
      deepSearchOverride: options?.deepSearch,
    });
  };

  const handleRegenerate = async (
    msgIndex: number,
    overrideMode?: PersonaMode
  ) => {
    if (streaming) return;
    if (activeGroupIdRef.current) return;
    const modeToUse = overrideMode || activeMode;
    if (overrideMode) {
      setActiveMode(overrideMode);
    }
    let truncateIdx = msgIndex;
    while (truncateIdx > 0 && messages[truncateIdx - 1]?.role === "assistant") {
      truncateIdx -= 1;
    }
    const truncated = messages.slice(0, truncateIdx);
    setMessages(truncated);
    await runStreamRequest(truncated, modeToUse);
  };

  const handleTriggerProactive = async (hoursIdle?: number) => {
    try {
      const res = await fetch("/api/chat/proactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activeSlug,
          hoursSinceLastChat: hoursIdle,
          persist: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadActivePersonaDetail(activeSlug);
        await loadPersonaList();
      }
    } catch (err) {
      console.error("Failed to trigger proactive message:", err);
    }
  };

  const handleClearHistory = async () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    clearScheduledFollowup();
    const key = channelKey({ slug: activeSlugRef.current, groupId: activeGroupIdRef.current });
    delete pendingLocalMsgsByChannelRef.current[key];
    if (
      pendingBurstDataRef.current &&
      channelKey({
        slug: pendingBurstDataRef.current.slug,
        groupId: pendingBurstDataRef.current.groupId,
      }) === key
    ) {
      if (burstTimerRef.current) {
        clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      pendingBurstDataRef.current = null;
      setPendingBurst(false);
    }
    if (activeGroupIdRef.current) {
      const gid = activeGroupIdRef.current;
      try {
        await fetch(`/api/groups/${encodeURIComponent(gid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clearMessages: true }),
        });
        setMessages([]);
        await loadGroups();
      } catch (err) {
        console.error("Failed to clear group messages:", err);
      }
      return;
    }
    try {
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activeSlug,
          messages: [],
        }),
      });
      setMessages([]);
      await loadPersonaList();
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const handleSavePersonaPatch = async (patch: Partial<PersonaRecord>) => {
    try {
      const res = await fetch(
        `/api/personas/${encodeURIComponent(activeSlug)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data = await res.json();
      if (data.success && data.persona) {
        setActivePersona(data.persona);
        await loadPersonaList();
      }
    } catch (err) {
      console.error("Failed to update persona:", err);
    }
  };

  const handleAddCorrection = async (
    reason: string,
    category = "style",
    botResponse = "",
    userInput = ""
  ) => {
    try {
      const res = await fetch(
        `/api/personas/${encodeURIComponent(activeSlug)}/correct`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correction: reason,
            category,
            botResponse,
            userInput,
          }),
        }
      );
      const data = await res.json();
      if (data.success && data.persona) {
        setActivePersona(data.persona);
      }
    } catch (err) {
      console.error("Failed to add correction:", err);
    }
  };

  const handleQuickCorrect = async (msgIndex: number, reason: string) => {
    const targetMsg = messages[msgIndex];
    const prevUserMsg = msgIndex > 0 ? messages[msgIndex - 1] : undefined;
    await handleAddCorrection(
      reason,
      "style",
      targetMsg?.content || "",
      prevUserMsg?.content || ""
    );
  };

  const handleRelayToMaster = async (msg: ConversationMessage) => {
    try {
      await fetch("/api/chat/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromSlug: activeSlug,
          content: msg.content,
        }),
      });
      await loadPersonaList();
    } catch (err) {
      console.error("Failed to relay message to master-bot:", err);
    }
  };

  // 稳定回调：传给 memo 子组件（LeftSidebar / RightInspector），身份永不变，调用时总是最新逻辑
  // 注意：本组件没有提前 return，以下 hooks 都在无条件路径上
  const sidebarSelectPersona = useStableCallback(handleSelectPersona);
  const sidebarSelectGroup = useStableCallback(handleSelectGroup);
  const sidebarCreateGroup = useStableCallback(() => setShowCreateGroup(true));
  const sidebarDeleteGroup = useStableCallback(handleDeleteGroup);
  const sidebarOpenSettings = useStableCallback(() => setShowSettings(true));
  const sidebarOpenCommandPalette = useStableCallback(() => setShowCommandPalette(true));
  const sidebarOpenCreateBot = useStableCallback(() => setShowCreateBot(true));
  const sidebarToggleTheme = useStableCallback(handleToggleTheme);
  const sidebarCollapse = useStableCallback(() => setSidebarOpen(false));

  const inspectorToggleAutoNudge = useStableCallback(() => setAutoNudgeEnabled((v) => !v));
  const inspectorToggleThink = useStableCallback(() => setThinkMode((v) => !v));
  const inspectorToggleDeepSearch = useStableCallback(() => setDeepSearch((v) => !v));
  const inspectorChangeMode = useStableCallback((m: PersonaMode) => setActiveMode(m));
  const inspectorSavePersonaPatch = useStableCallback(handleSavePersonaPatch);
  const inspectorAddCorrection = useStableCallback((reason: string, category: string) =>
    handleAddCorrection(reason, category)
  );
  const inspectorTriggerProactive = useStableCallback(handleTriggerProactive);
  const inspectorRefreshPersona = useStableCallback(async () => {
    await Promise.all([loadActivePersonaDetail(activeSlug), loadPersonaList()]);
  });
  const inspectorDismissGrowthNotice = useStableCallback(() => {
    if (!activePersona) return;
    setGrowthNoticeBySlug((prev) => ({
      ...prev,
      [activePersona.slug]: null,
    }));
  });
  const inspectorReportGrowth = useStableCallback((notice: string) => {
    if (!activePersona) return;
    setGrowthNoticeBySlug((prev) => ({
      ...prev,
      [activePersona.slug]: notice,
    }));
  });
  const inspectorRefineReferencePortrait = useStableCallback(async (sourceUrl?: string) => {
    if (!activePersona) return;
    await handleRefineReferencePortrait(activePersona.slug, {
      sourceImageUrl: sourceUrl,
      mode: "manual",
    });
  });
  const inspectorOpenAvatarPicker = useStableCallback(() => setShowAvatarPicker(true));
  const inspectorClose = useStableCallback(() => setShowInspector(false));

  return (
    <>
    {showSplash && <SplashScreen ready={Boolean(activePersona)} steps={splashSteps} />}
    <div
      className="splash-reveal flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]"
    >
      {sidebarOpen && (
        <LeftSidebar
          personas={personas}
          activeSlug={activeSlug}
          isStreaming={Boolean(streaming)}
          draftsBySlug={sidebarDrafts}
          onSelectPersona={sidebarSelectPersona}
          groups={groups}
          activeGroupId={activeGroupId}
          onSelectGroup={sidebarSelectGroup}
          onCreateGroup={sidebarCreateGroup}
          onDeleteGroup={sidebarDeleteGroup}
          onOpenSettings={sidebarOpenSettings}
          onOpenCommandPalette={sidebarOpenCommandPalette}
          onOpenCreateBot={sidebarOpenCreateBot}
          theme={theme}
          onToggleTheme={sidebarToggleTheme}
          onCollapse={sidebarCollapse}
        />
      )}

      <ChatStage
        onRetryMedia={handleRetryMedia}
        persona={activePersona}
        personas={personas}
        messages={messages}
        streaming={streaming}
        input={input}
        onChangeInput={setInput}
        onSend={handleSend}
        onStopStreaming={handleStopStreaming}
        onQuickSend={handleQuickSend}
        onTriggerProactive={handleTriggerProactive}
        onClearHistory={handleClearHistory}
        onQuickCorrect={handleQuickCorrect}
        onRegenerate={handleRegenerate}
        onRelayToMaster={activeGroup ? undefined : handleRelayToMaster}
        onSelectPersona={handleSelectPersona}
        activeGroup={activeGroup}
        onOpenGroup={handleSelectGroup}
        onExitGroup={() => handleSelectPersona("master-bot")}
        groupTyping={groupTyping}
        backgroundTypingName={
          backgroundTyping === "对方" ? activePersona?.name || "对方" : backgroundTyping
        }
        newMessagesFromId={newMessagesFromId}
        thinkMode={thinkMode}
        onToggleThink={() => setThinkMode((v) => !v)}
        deepSearch={deepSearch}
        onToggleDeepSearch={() => setDeepSearch((v) => !v)}
        activeMode={activeMode}
        onChangeMode={(m) => setActiveMode(m)}
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector((v) => !v)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenImport={() => setShowImport(true)}
        onOpenAvatarPicker={() => setShowAvatarPicker(true)}
        onSetReferencePhoto={async (url) => {
          if (!activePersona) return;
          await handleSavePersonaPatch({
            profile: {
              ...activePersona.profile,
              referenceImageUrl: url,
            },
          });
        }}
        isRefiningReference={Boolean(
          activePersona && refiningRefSlugs[activePersona.slug]
        )}
        onRefineReferencePortrait={async (sourceUrl) => {
          if (!activePersona) return;
          await handleRefineReferencePortrait(activePersona.slug, {
            sourceImageUrl: sourceUrl,
            mode: "manual",
          });
        }}
      />

      {showInspector && (
        <RightInspector
          key={`inspector-${activePersona?.slug || "default"}`}
          persona={activePersona}
          isStreaming={Boolean(streaming)}
          autoNudgeEnabled={autoNudgeEnabled}
          onToggleAutoNudge={inspectorToggleAutoNudge}
          thinkMode={thinkMode}
          onToggleThink={inspectorToggleThink}
          deepSearch={deepSearch}
          onToggleDeepSearch={inspectorToggleDeepSearch}
          activeMode={activeMode}
          onChangeMode={inspectorChangeMode}
          onSavePersonaPatch={inspectorSavePersonaPatch}
          onAddCorrection={inspectorAddCorrection}
          onTriggerProactive={inspectorTriggerProactive}
          onRefreshPersona={inspectorRefreshPersona}
          isRefiningReference={Boolean(
            activePersona && refiningRefSlugs[activePersona.slug]
          )}
          refineReferenceNotice={
            activePersona ? refineRefNotice[activePersona.slug] : null
          }
          latestGrowthNotice={
            activePersona ? growthNoticeBySlug[activePersona.slug] : null
          }
          onDismissGrowthNotice={inspectorDismissGrowthNotice}
          onReportGrowth={inspectorReportGrowth}
          onRefineReferencePortrait={inspectorRefineReferencePortrait}
          hasUnreadMoments={Boolean(
            activePersona && unreadMomentsBySlug[activePersona.slug]
          )}
          momentsRefreshSignal={
            activePersona ? momentsRefreshSignalBySlug[activePersona.slug] || 0 : 0
          }
          onClearUnreadMoments={handleClearUnreadMoments}
          onMomentsFeedLoaded={handleMomentsFeedLoaded}
          onOpenAvatarPicker={inspectorOpenAvatarPicker}
          onClose={inspectorClose}
        />
      )}

      <CreateBotModal
        isOpen={showCreateBot}
        onClose={() => setShowCreateBot(false)}
        onCreated={async (created) => {
          await loadPersonaList();
          if (created?.slug) {
            setActiveSlug(created.slug);
          }
        }}
      />

      <CreateGroupModal
        open={showCreateGroup}
        personas={personas.filter((p) => !p.isMaster && p.slug !== "master-bot")}
        onClose={() => setShowCreateGroup(false)}
        onCreate={handleCreateGroup}
      />

      <AvatarPickerModal
        key={`avatar-picker-${activePersona?.slug || "default"}`}
        isOpen={showAvatarPicker}
        persona={activePersona}
        onClose={() => setShowAvatarPicker(false)}
        onSave={handleSavePersonaPatch}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        personas={personas}
        activeSlug={activeSlug}
        onSelectPersona={handleSelectPersona}
        onChangeMode={(m) => setActiveMode(m)}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        onOpenCreateBot={() => setShowCreateBot(true)}
      />

      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={async (res) => {
          await loadPersonaList();
          if (res?.slug) {
            setActiveSlug(res.slug);
          }
          setShowImport(false);
        }}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
    </>
  );
}
