"use client";

import { useCallback, useEffect, useState } from "react";
import ImportModal from "@/components/ImportModal";
import SettingsModal from "@/components/settings/SettingsModal";
import {
  ConversationMessage,
  PersonaMode,
  PersonaRecord,
  PersonaSummary,
  SearchResultItem,
} from "@/lib/storage/types";
import ChatStage from "./ChatStage";
import CommandPalette from "./CommandPalette";
import LeftSidebar from "./LeftSidebar";
import RightInspector from "./RightInspector";

interface GrokWorkspaceProps {
  initialSlug?: string;
}

export default function GrokWorkspace({ initialSlug }: GrokWorkspaceProps) {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>(
    initialSlug || "grok-ella"
  );
  const [activePersona, setActivePersona] = useState<PersonaRecord | null>(
    null
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinkMode, setThinkMode] = useState(true);
  const [deepSearch, setDeepSearch] = useState(false);
  const [activeMode, setActiveMode] = useState<PersonaMode>("fun");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [streaming, setStreaming] = useState<{
    isSearching: boolean;
    searchQuery?: string;
    searchResults?: SearchResultItem[];
    thought: string;
    thoughtDurationMs?: number;
    isStreamingThought: boolean;
    reply: string;
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

  const loadActivePersonaDetail = useCallback(async (slug: string) => {
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
      console.error("Failed to load active persona:", err);
    }
  }, []);

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

  // Global ⌘K / Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
    }
  };

  const runStreamRequest = async (
    historyToSend: ConversationMessage[],
    modeToUse: PersonaMode,
    options?: { requestPhoto?: boolean }
  ) => {
    setStreaming({
      isSearching: deepSearch,
      thought: "",
      thoughtDurationMs: 0,
      isStreamingThought: thinkMode,
      reply: "",
    });

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activeSlug,
          messages: historyToSend.map((m) => ({
            role: m.role,
            content: m.content,
            imageUrl: m.imageUrl,
            timestamp: m.timestamp,
          })),
          mode: modeToUse,
          thinkMode,
          deepSearch,
          requestPhoto: options?.requestPhoto,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream status ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMessage: ConversationMessage | null = null;

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
            if (payload.type === "search") {
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
            } else if (payload.type === "reply") {
              setStreaming((prev) =>
                prev
                  ? {
                      ...prev,
                      isSearching: false,
                      isStreamingThought: false,
                      reply: payload.fullReply,
                    }
                  : prev
              );
            } else if (payload.type === "done" && payload.message) {
              finalMessage = payload.message as ConversationMessage;
            }
          } catch {
            // Ignore malformed chunk
          }
        }
      }

      if (finalMessage) {
        setMessages((prev) => [...prev, finalMessage!]);
      }
      await loadPersonaList();
    } catch (error) {
      console.error("Streaming chat error:", error);
    } finally {
      setStreaming(null);
    }
  };

  const handleSend = async (options?: {
    imageUrl?: string;
    requestPhoto?: boolean;
  }) => {
    const text =
      input.trim() ||
      (options?.requestPhoto ? "发张你那边的随手拍给我看看呗 📸" : "");
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
    const truncated = messages.slice(0, msgIndex);
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Collapsible Left Navigation */}
      {sidebarOpen && (
        <LeftSidebar
          personas={personas}
          activeSlug={activeSlug}
          onSelectPersona={(slug) => setActiveSlug(slug)}
          onOpenImport={() => setShowImport(true)}
          onOpenSettings={() => setShowSettings(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}

      {/* Center Grok Stream Stage */}
      <ChatStage
        persona={activePersona}
        messages={messages}
        streaming={streaming}
        input={input}
        onChangeInput={setInput}
        onSend={handleSend}
        onTriggerProactive={handleTriggerProactive}
        onClearHistory={handleClearHistory}
        onQuickCorrect={handleQuickCorrect}
        onRegenerate={handleRegenerate}
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
        onOpenCommandPalette={() => setShowCommandPalette(true)}
      />

      {/* Right Persona Soul & PAD Emotion Drawer (Closed by Default) */}
      {showInspector && (
        <RightInspector
          persona={activePersona}
          onSavePersonaPatch={handleSavePersonaPatch}
          onAddCorrection={(reason, cat) => handleAddCorrection(reason, cat)}
          onTriggerProactive={handleTriggerProactive}
          onClose={() => setShowInspector(false)}
        />
      )}

      {/* Modals & ⌘K Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        personas={personas}
        activeSlug={activeSlug}
        onSelectPersona={(slug) => setActiveSlug(slug)}
        onChangeMode={(m) => setActiveMode(m)}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setShowSettings(true)}
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
