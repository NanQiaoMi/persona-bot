"use client";

import { useEffect, useState } from "react";
import { RuntimeSettings, SearchResultItem } from "@/lib/storage/types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: RuntimeSettings) => void;
}

const PROVIDER_PRESETS: Array<{
  id: RuntimeSettings["llmProvider"];
  label: string;
  baseUrl: string;
  model: string;
  badge: string;
}> = [
  {
    id: "xai",
    label: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3",
    badge: "⚡ 官方推荐",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    badge: "🧠 高性价比",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    badge: "🌐 通用旗舰",
  },
  {
    id: "ollama",
    label: "Ollama 本地",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:14b",
    badge: "💻 本地私密",
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  onSaved,
}: SettingsModalProps) {
  const [form, setForm] = useState<RuntimeSettings>({
    llmProvider: "xai",
    llmBaseUrl: "https://api.x.ai/v1",
    llmApiKey: "",
    llmModel: "grok-3",
    searchProvider: "builtin",
    tavilyApiKey: "",
    serperApiKey: "",
    defaultThinkMode: true,
    defaultDeepSearch: true,
    autoVoicePlayback: false,
    theme: "dark",
  });
  const [saving, setSaving] = useState(false);
  const [testQuery, setTestQuery] = useState("Grok 3 最新特性");
  const [testResults, setTestResults] = useState<SearchResultItem[] | null>(null);
  const [testingSearch, setTestingSearch] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (active && data.success && data.settings) {
          setForm(data.settings);
        }
      } catch {
        // Ignore error
      }
    };
    loadSettings();
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg("✓ 配置已保存并实时生效");
        onSaved?.(data.settings);
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch {
      setStatusMsg("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleTestSearch = async () => {
    setTestingSearch(true);
    setTestResults(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: testQuery || "今日科技热点",
          provider: form.searchProvider,
          tavilyApiKey: form.tavilyApiKey,
          serperApiKey: form.serperApiKey,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.results || []);
      }
    } finally {
      setTestingSearch(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              ⚙️ 模型与 Grok DeepSearch 配置舱
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              支持随时切换 xAI Grok / DeepSeek / OpenAI / 本地模型与实时搜索源
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center text-sm text-[var(--text-secondary)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Provider Quick Presets */}
          <div className="space-y-2">
            <label className="font-semibold text-[var(--text-primary)] block">
              1. 一键选择大模型引擎预设
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PROVIDER_PRESETS.map((preset) => {
                const isSelected = form.llmProvider === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        llmProvider: preset.id,
                        llmBaseUrl: preset.baseUrl,
                        llmModel: preset.model,
                      }))
                    }
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <div className="font-bold text-xs">{preset.label}</div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {preset.badge}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LLM Connection Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] mb-1">
                API Base URL
              </label>
              <input
                type="text"
                value={form.llmBaseUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, llmBaseUrl: e.target.value }))
                }
                placeholder="https://api.x.ai/v1"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[var(--text-secondary)] mb-1">
                模型名称 (Model ID)
              </label>
              <input
                type="text"
                value={form.llmModel}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, llmModel: e.target.value }))
                }
                placeholder="grok-3 / deepseek-chat / gpt-4o"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              API Key（留空则自动使用环境变量或内置离线人格演示引擎）
            </label>
            <input
              type="password"
              value={form.llmApiKey}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, llmApiKey: e.target.value }))
              }
              placeholder="xai-... / sk-..."
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* DeepSearch Engine Config */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
            <label className="font-semibold text-[var(--text-primary)] block">
              2. 🌐 DeepSearch 实时联网搜索引擎
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "builtin",
                  title: "内置免配置搜索",
                  desc: "Wikipedia + DuckDuckGo 开箱即用",
                },
                {
                  id: "tavily",
                  title: "Tavily AI 搜索",
                  desc: "专为 Agent 优化的实时全网检索",
                },
                {
                  id: "serper",
                  title: "Google Serper",
                  desc: "Google 实时搜索结果接口",
                },
              ].map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      searchProvider: sp.id as RuntimeSettings["searchProvider"],
                    }))
                  }
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    form.searchProvider === sp.id
                      ? "border-sky-500 bg-sky-500/15 text-sky-300"
                      : "border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/60 text-[var(--text-secondary)]"
                  }`}
                >
                  <div className="font-semibold">{sp.title}</div>
                  <div className="text-[10px] opacity-75 mt-0.5">{sp.desc}</div>
                </button>
              ))}
            </div>

            {form.searchProvider === "tavily" && (
              <input
                type="password"
                value={form.tavilyApiKey}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tavilyApiKey: e.target.value }))
                }
                placeholder="输入 Tavily API Key (tvly-...)"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs"
              />
            )}

            {form.searchProvider === "serper" && (
              <input
                type="password"
                value={form.serperApiKey}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, serperApiKey: e.target.value }))
                }
                placeholder="输入 Serper API Key"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs"
              />
            )}

            {/* Live Search Tester */}
            <div className="p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="输入测试搜索词..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs"
                />
                <button
                  type="button"
                  onClick={handleTestSearch}
                  disabled={testingSearch}
                  className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-medium"
                >
                  {testingSearch ? "检索中..." : "测试联网搜索"}
                </button>
              </div>
              {testResults && (
                <div className="space-y-1 pt-1">
                  {testResults.map((r, idx) => (
                    <div
                      key={idx}
                      className="text-[11px] text-[var(--text-secondary)] truncate"
                    >
                      🌐 <span className="text-sky-300">[{r.source}]</span>{" "}
                      {r.title} — {r.snippet}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {statusMsg && (
            <div className="text-emerald-400 font-medium text-center">
              {statusMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex justify-end gap-2 bg-[var(--bg-primary)]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>
    </div>
  );
}
