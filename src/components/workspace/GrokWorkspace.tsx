"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import CommandPalette from "./CommandPalette";
import CreateBotModal from "./CreateBotModal";
import CreateGroupModal from "./CreateGroupModal";
import LeftSidebar from "./LeftSidebar";
import RightInspector from "./RightInspector";

interface GrokWorkspaceProps {
  initialSlug?: string;
}

export default function GrokWorkspace({ initialSlug }: GrokWorkspaceProps) {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>(
    initialSlug || "lu-xi"
  );
  const [activePersona, setActivePersona] = useState<PersonaRecord | null>(
    null
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draftsBySlug, setDraftsBySlug] = useState<Record<string, string>>({});
  const input = draftsBySlug[activeSlug] || "";
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
  const runStreamRequestRef = useRef<
    | ((
        history: ConversationMessage[],
        mode: PersonaMode,
        options?: { kickoff?: boolean }
      ) => Promise<void>)
    | null
  >(null);

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
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
      queueMicrotask(() => setPendingBurst(false));
    }
    streamAbortRef.current?.abort();
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
    return () => {
      streamAbortRef.current?.abort();
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
  }, [activeSlug]);

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
          return;
        }
        const waited = Date.now() - burstStartedAtRef.current;
        if (inputRef.current.trim() && waited < BURST_MAX_WAIT_MS) {
          tick(TYPING_EXTEND_MS);
          return;
        }
        burstTimerRef.current = null;
        setPendingBurst(false);
        void runStreamRequestRef.current?.(messagesRef.current, activeMode);
      }, delay);
    };
    tick(BURST_WINDOW_MS);
  }, [activeMode]);

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
        // 从没打开过的群：以现在为起点开始计未读，不把历史消息都算成未读
        let changed = false;
        for (const g of data.groups as GroupChat[]) {
          if (!groupSeenRef.current[g.id] && g.lastMessageId) {
            groupSeenRef.current[g.id] = g.lastMessageId;
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
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/personas/${encodeURIComponent(slug)}`),
        fetch(`/api/conversations?slug=${encodeURIComponent(slug)}&limit=100`),
      ]);
      const pData = await pRes.json();
      const cData = await cRes.json();

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
        setMessages(cData.messages);
      } else {
        setMessages([]);
      }
      void checkMomentsUpdate(slug, { markUnreadIfChanged: false });
    } catch (err) {
      console.error("Failed to load active persona:", err);
    }
  }, [checkMomentsUpdate]);

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
      const reload = async () => {
        const res = await fetch(
          target.groupId
            ? `/api/groups/${encodeURIComponent(target.groupId)}`
            : `/api/conversations?slug=${encodeURIComponent(target.slug || "")}&limit=100`
        );
        const data = await res.json();
        if (stillHere() && data?.success && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      };
      try {
        for (let i = 0; i < 90 && stillHere(); i += 1) {
          // 你自己正在发消息、页面在实时接收时，交给实时推送显示
          if (streamingRef.current) break;
          const res = await fetch(`/api/chat/inflight?${query}`);
          const data = await res.json();
          if (!stillHere()) return;
          if (!data?.inflight) {
            if (i > 0) await reload();
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
    []
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      await Promise.all([loadPersonaList(), loadGroups()]);
      if (active) {
        await loadActivePersonaDetail(activeSlug);
        if (active && !activeGroupIdRef.current) {
          void watchInflight({ slug: activeSlug }, "对方");
        }
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [activeSlug, loadPersonaList, loadGroups, loadActivePersonaDetail, watchInflight]);

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
      let any = false;
      for (const g of groupsRef.current) {
        if (stopped || g.id === activeGroupIdRef.current) continue;
        try {
          const res = await fetch(`/api/groups/${encodeURIComponent(g.id)}/ambient`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "catchup" }),
          });
          const data = await res.json();
          if (data?.ok) any = true;
        } catch {
          // 忽略单个群的失败
        }
      }
      if (any && !stopped) void loadGroups();
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
    });
    activeGroupIdRef.current = activeGroupId;
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
      queueMicrotask(() => setPendingBurst(false));
    }
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    if (!activeGroupId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/groups/${encodeURIComponent(activeGroupId)}`);
        const data = await res.json();
        if (cancelled || activeGroupIdRef.current !== activeGroupId) return;
        if (!data.success) {
          setActiveGroupId(null);
          return;
        }
        const groupMessages: ConversationMessage[] = Array.isArray(data.messages)
          ? data.messages
          : [];
        setMessages(groupMessages);
        // 「以下为新消息」：从你上次看到的那条之后第一条群友消息开始
        const seenId = groupSeenRef.current[activeGroupId];
        const seenIdx = seenId ? groupMessages.findIndex((m) => m.id === seenId) : -1;
        const firstUnread =
          seenIdx >= 0 ? groupMessages.slice(seenIdx + 1).find((m) => m.role !== "user") : undefined;
        setNewMessagesFromId(firstUnread?.id ?? null);
        if (
          data.group?.pendingKickoff &&
          groupMessages.length === 0 &&
          !kickoffDoneRef.current.has(activeGroupId)
        ) {
          kickoffDoneRef.current.add(activeGroupId);
          await runStreamRequestRef.current?.([], activeMode, { kickoff: true });
        } else {
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
    activeGroupIdRef.current = null;
    setActiveGroupId(null);
    if (slug === activeSlug && wasInGroup) {
      // 从群聊回到同一个角色（群聊挂在主 bot 下，最常见的是回到主 bot）：
      // 角色没变，不会触发切换角色时的「还在生成就继续显示正在输入」，这里要自己接上，
      // 否则你在群里时还没写完的回复，回来后停在半截、也不再刷新
      void loadActivePersonaDetail(slug).then(() => {
        if (!activeGroupIdRef.current && activeSlugRef.current === slug) {
          void watchInflight({ slug }, "对方");
        }
      });
    }
    setActiveSlug(slug);
  };

  const handleSelectGroup = (groupId: string) => {
    if (activeGroupIdRef.current === groupId) return;
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
    const requestGroupId = activeGroupIdRef.current;
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
          slug: activeSlug,
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
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMessage: ConversationMessage | null = null;
      // 本轮所有消息（群聊里照片 / 表情包可能挂在任意一位成员的消息上）
      let turnMessages: ConversationMessage[] = [];
      let pendingFollowup: PendingFollowup | undefined;
      const committedIds = new Set<string>();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
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
            if (activeGroupIdRef.current !== requestGroupId) continue;
            if (payload.type === "status") {
              setStreaming((prev) =>
                prev
                  ? {
                      ...prev,
                      statusText: payload.text,
                    }
                  : prev
              );
            } else if (payload.type === "search") {
              setStreaming((prev) =>
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
              setStreaming((prev) =>
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
              setStreaming((prev) =>
                prev
                  ? {
                      ...prev,
                      statusText: undefined,
                      mediaCards: payload.mediaCards as MediaCard[],
                    }
                  : prev
              );
            } else if (payload.type === "reply") {
              setStreaming((prev) =>
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
              setStreaming((prev) =>
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

      if (finalMessage) {
        if (!committedIds.has(finalMessage.id)) {
          setMessages((prev) =>
            prev.some((m) => m.id === finalMessage!.id)
              ? prev
              : [...prev, finalMessage!]
          );
        }

        // Check silently after turn completes if the persona autonomously posted a new moment
        const turnSlug = activeSlug;
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
            // 群聊：用发图那位成员的形象生成，结果写回群聊记录
            const targetSlug = requestGroupId ? sourceMsg.fromBot?.slug || activeSlug : activeSlug;
            void fetch("/api/media/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: targetSlug,
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
                  if (
                    resData.autoLockedReference &&
                    activeSlugRef.current === targetSlug
                  ) {
                    void loadActivePersonaDetail(targetSlug);
                  }
                  if (resData.shouldRefineReference && resData.sourcePhotoUrl) {
                    void handleRefineReferencePortrait(targetSlug, {
                      sourceImageUrl: resData.sourcePhotoUrl,
                      expectedCurrentRef: resData.sourcePhotoUrl,
                      mode: "auto",
                    });
                  }
                }
              })
              .catch(() => {
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
              });
          }
        }));
        // Schedule autonomous delayed follow-up if the model chose [FOLLOWUP: delaySec | content]
        if (pendingFollowup && pendingFollowup.content) {
          const scheduledSlug = activeSlug;
          const scheduledFollowup = pendingFollowup;
          const delayMs =
            Math.max(5, Math.min(120, scheduledFollowup.delaySec || 8)) * 1000;
          followupTimerRef.current = setTimeout(() => {
            followupTimerRef.current = null;
            if (activeSlugRef.current !== scheduledSlug) return;
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
                  activeSlugRef.current === scheduledSlug
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
      streamAbortRef.current = null;
      setStreaming(null);
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
      setPendingBurst(false);
      await runStreamRequest(nextHistory, activeMode, {
        requestPhoto: options?.requestPhoto,
        requestSticker: options?.requestSticker,
        mentionedSlug: options?.mentionedSlug,
      });
      return;
    }
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {sidebarOpen && (
        <LeftSidebar
          personas={personas}
          activeSlug={activeSlug}
          isStreaming={Boolean(streaming)}
          draftsBySlug={draftsBySlug}
          onSelectPersona={handleSelectPersona}
          groups={groups}
          activeGroupId={activeGroupId}
          onSelectGroup={handleSelectGroup}
          onCreateGroup={() => setShowCreateGroup(true)}
          onDeleteGroup={handleDeleteGroup}
          onOpenSettings={() => setShowSettings(true)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenCreateBot={() => setShowCreateBot(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}

      <ChatStage
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
          onToggleAutoNudge={() => setAutoNudgeEnabled((v) => !v)}
          thinkMode={thinkMode}
          onToggleThink={() => setThinkMode((v) => !v)}
          deepSearch={deepSearch}
          onToggleDeepSearch={() => setDeepSearch((v) => !v)}
          activeMode={activeMode}
          onChangeMode={(m) => setActiveMode(m)}
          onSavePersonaPatch={handleSavePersonaPatch}
          onAddCorrection={(reason, cat) => handleAddCorrection(reason, cat)}
          onTriggerProactive={handleTriggerProactive}
          onRefreshPersona={async () => {
            await Promise.all([
              loadActivePersonaDetail(activeSlug),
              loadPersonaList(),
            ]);
          }}
          isRefiningReference={Boolean(
            activePersona && refiningRefSlugs[activePersona.slug]
          )}
          refineReferenceNotice={
            activePersona ? refineRefNotice[activePersona.slug] : null
          }
          latestGrowthNotice={
            activePersona ? growthNoticeBySlug[activePersona.slug] : null
          }
          onDismissGrowthNotice={() => {
            if (!activePersona) return;
            setGrowthNoticeBySlug((prev) => ({
              ...prev,
              [activePersona.slug]: null,
            }));
          }}
          onReportGrowth={(notice) => {
            if (!activePersona) return;
            setGrowthNoticeBySlug((prev) => ({
              ...prev,
              [activePersona.slug]: notice,
            }));
          }}
          onRefineReferencePortrait={async (sourceUrl) => {
            if (!activePersona) return;
            await handleRefineReferencePortrait(activePersona.slug, {
              sourceImageUrl: sourceUrl,
              mode: "manual",
            });
          }}
          hasUnreadMoments={Boolean(
            activePersona && unreadMomentsBySlug[activePersona.slug]
          )}
          momentsRefreshSignal={
            activePersona ? momentsRefreshSignalBySlug[activePersona.slug] || 0 : 0
          }
          onClearUnreadMoments={handleClearUnreadMoments}
          onMomentsFeedLoaded={handleMomentsFeedLoaded}
          onOpenAvatarPicker={() => setShowAvatarPicker(true)}
          onClose={() => setShowInspector(false)}
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
  );
}
