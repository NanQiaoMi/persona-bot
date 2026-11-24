"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ImportModal from "@/components/ImportModal";
import { COMPACT_QUERY, NARROW_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { describeRequestError, useFeedback } from "@/components/feedback/FeedbackProvider";
import SettingsModal from "@/components/settings/SettingsModal";
import {
  ConversationMessage,
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
import LeftSidebar from "./LeftSidebar";
import RightInspector from "./RightInspector";

interface GrokWorkspaceProps {
  initialSlug?: string;
}

export default function GrokWorkspace({ initialSlug }: GrokWorkspaceProps) {
  const { toast } = useFeedback();
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>(
    initialSlug || "grok-ella"
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
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // 手机宽度下侧栏默认收起为抽屉；桌面保持原来的展开 / 收起状态
  const isNarrow = useMediaQuery(NARROW_QUERY);
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const sidebarOpen = isNarrow ? mobileSidebarOpen : desktopSidebarOpen;
  const setSidebarOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(sidebarOpen) : next;
    if (isNarrow) setMobileSidebarOpen(value);
    else setDesktopSidebarOpen(value);
  };
  const [showInspector, setShowInspector] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [autoNudgeEnabled, setAutoNudgeEnabled] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const followupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleNudgeCountRef = useRef<number>(0);
  const activeSlugRef = useRef(activeSlug);
  const streamAbortRef = useRef<AbortController | null>(null);

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
    idleNudgeCountRef.current = 0;
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
    };
  }, [activeSlug]);

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
    const run = async (): Promise<void> => {
      try {
        const res = await fetch("/api/personas");
        const data = await res.json();
        if (data.success && Array.isArray(data.personas)) {
          setPersonas(data.personas);
        }
      } catch (err) {
        toast("角色列表没加载出来", {
          tone: "error",
          description: describeRequestError(err),
          action: { label: "重试", onClick: () => void run() },
        });
      }
    };
    await run();
  }, [toast]);

  const loadActivePersonaDetail = useCallback(async (slug: string) => {
    const run = async (): Promise<void> => {
      try {
        const [pRes, cRes] = await Promise.all([
          fetch(`/api/personas/${encodeURIComponent(slug)}`),
          fetch(`/api/conversations?slug=${encodeURIComponent(slug)}&limit=100`),
        ]);
        const pData = await pRes.json();
        const cData = await cRes.json();

        if (pData.success && pData.persona) {
          setActivePersona(pData.persona);
          setActiveMode(pData.persona.defaultMode || "authentic");
        }
        if (cData.success && Array.isArray(cData.messages)) {
          setMessages(cData.messages);
        } else {
          setMessages([]);
        }
      } catch (err) {
        toast("聊天记录没加载出来", {
          tone: "error",
          description: describeRequestError(err),
          action: { label: "重试", onClick: () => void run() },
        });
      }
    };
    await run();
  }, [toast]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      await loadPersonaList();
      if (active) {
        await loadActivePersonaDetail(activeSlug);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [activeSlug, loadPersonaList, loadActivePersonaDetail]);

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
    activeSlug,
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

  const handleStopStreaming = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  };

  const runStreamRequest = async (
    historyToSend: ConversationMessage[],
    modeToUse: PersonaMode,
    options?: {
      requestPhoto?: boolean;
      requestSticker?: boolean;
      mentionedSlug?: string;
      deepSearchOverride?: boolean;
    }
  ) => {
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
          mentionedSlug: options?.mentionedSlug,
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

        // Trigger non-blocking background image/sticker generation for any pending cards
        const pendingCards = finalMessage.mediaCards || [];
        pendingCards.forEach((card, cardIndex) => {
          if (
            (card.type === "sticker" || card.type === "photo") &&
            card.status === "generating"
          ) {
            const targetMessageId = finalMessage!.id;
            const targetSlug = activeSlug;
            void fetch("/api/media/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slug: targetSlug,
                messageId: targetMessageId,
                cardIndex,
                kind: card.type,
                caption: card.caption,
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
                  if (resData.autoLockedReference && activeSlugRef.current === targetSlug) {
                    void loadActivePersonaDetail(targetSlug);
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
        });
        // Schedule autonomous delayed follow-up if the model chose [FOLLOWUP: delaySec | content]
        if (pendingFollowup && pendingFollowup.content) {
          const scheduledSlug = activeSlug;
          const scheduledFollowup = pendingFollowup;
          const delayMs =
            Math.max(5, Math.min(30, scheduledFollowup.delaySec || 8)) * 1000;
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
      await loadPersonaList();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast("这条消息没发出去", {
          tone: "error",
          description: describeRequestError(error),
          action: {
            label: "重试",
            onClick: () => void runStreamRequest(historyToSend, modeToUse, options),
          },
        });
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

    const userMsg: ConversationMessage = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: text || "[发送了一张图片]",
      timestamp: new Date().toISOString(),
      imageUrl: options?.imageUrl,
      mode: activeMode,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");

    await runStreamRequest(nextHistory, activeMode, {
      requestPhoto: options?.requestPhoto,
      requestSticker: options?.requestSticker,
      mentionedSlug: options?.mentionedSlug,
    });
  };

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
      toast("TA 暂时没法主动找你", { tone: "error", description: describeRequestError(err) });
    }
  };

  const handleClearHistory = async () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    clearScheduledFollowup();
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
      toast("清空聊天记录失败", { tone: "error", description: describeRequestError(err) });
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
      } else {
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      toast("保存没成功", { tone: "error", description: describeRequestError(err) });
    }
  };

  const handleAddCorrection = async (
    reason: string,
    category = "style",
    botResponse = "",
    userInput = "",
    opts: { silentSuccess?: boolean } = {}
  ): Promise<boolean> => {
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
        if (!opts.silentSuccess) {
          toast("已记下，下一轮就会改", { tone: "success", description: data.rule });
        }
        return true;
      }
      throw new Error(data?.error || `HTTP ${res.status}`);
    } catch (err) {
      toast("纠偏没有保存", { tone: "error", description: describeRequestError(err) });
      return false;
    }
  };

  const handleQuickCorrect = async (msgIndex: number, reason: string) => {
    const targetMsg = messages[msgIndex];
    const prevUserMsg = msgIndex > 0 ? messages[msgIndex - 1] : undefined;
    const ok = await handleAddCorrection(
      reason,
      "style",
      targetMsg?.content || "",
      prevUserMsg?.content || "",
      { silentSuccess: true }
    );
    // 让气泡上的纠偏卡片回到可编辑状态，不丢用户写的内容
    if (!ok) throw new Error("correction failed");
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
      toast("转交给主控 Bot 失败", { tone: "error", description: describeRequestError(err) });
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-base text-primary">
      {sidebarOpen && (
        <>
          {isNarrow && (
            <div
              aria-hidden
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] animate-fade-in"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
          <div
            className={
              isNarrow
                ? "fixed inset-y-0 left-0 z-50 shadow-overlay animate-drawer-left"
                : "contents"
            }
          >
            <LeftSidebar
              personas={personas}
              activeSlug={activeSlug}
              isStreaming={Boolean(streaming)}
              draftsBySlug={draftsBySlug}
              onSelectPersona={(slug) => {
                setActiveSlug(slug);
                if (isNarrow) setMobileSidebarOpen(false);
              }}
              onOpenSettings={() => setShowSettings(true)}
              onOpenCommandPalette={() => setShowCommandPalette(true)}
              onOpenCreateBot={() => setShowCreateBot(true)}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              onCollapse={() => setSidebarOpen(false)}
            />
          </div>
        </>
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
        onRelayToMaster={handleRelayToMaster}
        onSelectPersona={(slug) => setActiveSlug(slug)}
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
        onOpenSettings={() => setShowSettings(true)}
        onSetReferencePhoto={async (url) => {
          if (!activePersona) return;
          await handleSavePersonaPatch({
            profile: {
              ...activePersona.profile,
              referenceImageUrl: url,
            },
          });
        }}
      />

      {showInspector && (
        <>
          {isCompact && (
            <div
              aria-hidden
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] animate-fade-in"
              onClick={() => setShowInspector(false)}
            />
          )}
          <div
            className={
              isCompact
                ? "fixed inset-y-0 right-0 z-50 max-w-full shadow-overlay animate-drawer-right"
                : "contents"
            }
          >
            <RightInspector
              key={`inspector-${activePersona?.slug || "default"}`}
              persona={activePersona}
              isStreaming={Boolean(streaming)}
              autoNudgeEnabled={autoNudgeEnabled}
              onToggleAutoNudge={() => setAutoNudgeEnabled((v) => !v)}
              onSavePersonaPatch={handleSavePersonaPatch}
              onAddCorrection={async (reason, cat) => {
                await handleAddCorrection(reason, cat);
              }}
              onTriggerProactive={handleTriggerProactive}
              onRefreshPersona={async () => {
                await Promise.all([
                  loadActivePersonaDetail(activeSlug),
                  loadPersonaList(),
                ]);
              }}
              onOpenAvatarPicker={() => setShowAvatarPicker(true)}
              onClose={() => setShowInspector(false)}
            />
          </div>
        </>
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
        onSelectPersona={(slug) => setActiveSlug(slug)}
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
