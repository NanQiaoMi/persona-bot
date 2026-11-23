"use client";

import { useEffect, useState } from "react";
import {
  LOCAL_CHAT_MODELS,
  LOCAL_GATEWAY_BASE_URL,
  LOCAL_IMAGE_MODELS,
} from "@/lib/grok/models";
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
    id: "local_gateway",
    label: "本地网关 18630",
    baseUrl: LOCAL_GATEWAY_BASE_URL,
    model: "gpt-5.6",
    badge: "🚀 对话 + 生图",
  },
  {
    id: "xai",
    label: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3",
    badge: "⚡ 官方接口",
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
    llmProvider: "local_gateway",
    llmBaseUrl: LOCAL_GATEWAY_BASE_URL,
    llmApiKey: "",
    llmModel: "gpt-5.6",
    imageModel: "gpt-image-2.6",
    enableAutoSticker: true,
    enableAutoPhoto: true,
    searchProvider: "builtin",
    tavilyApiKey: "",
    serperApiKey: "",
    defaultThinkMode: true,
    defaultDeepSearch: true,
    autoVoicePlayback: false,
    theme: "light",
  });
  const [saving, setSaving] = useState(false);
  const [testingGateway, setTestingGateway] = useState(false);
  const [liveChatModels, setLiveChatModels] = useState<string[]>([]);
  const [liveImageModels, setLiveImageModels] = useState<string[]>([]);
  const [gatewayTestResult, setGatewayTestResult] = useState<{
    authStatus: string;
    message: string;
    models?: string[];
  } | null>(null);
  const [testQuery, setTestQuery] = useState("Grok 3 最新特性");
  const [testResults, setTestResults] = useState<SearchResultItem[] | null>(
    null
  );
  const [testingSearch, setTestingSearch] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const loadSettingsAndModels = async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        const loaded: RuntimeSettings = {
          imageModel: "gpt-image-2.6",
          enableAutoSticker: true,
          enableAutoPhoto: true,
          ...(data?.settings || {}),
        };
        if (active && data.success && data.settings) {
          setForm(loaded);
        }

        // Auto-fetch live models from configured gateway /v1/models
        const gwRes = await fetch("/api/settings/test-gateway", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: loaded.llmBaseUrl,
            apiKey: loaded.llmApiKey,
            chatModel: loaded.llmModel,
            imageModel: loaded.imageModel,
          }),
        });
        const gwData = await gwRes.json();
        if (!active) return;
        if (Array.isArray(gwData?.chatModels) && gwData.chatModels.length > 0) {
          setLiveChatModels(gwData.chatModels);
        }
        if (Array.isArray(gwData?.imageModels) && gwData.imageModels.length > 0) {
          setLiveImageModels(gwData.imageModels);
        }
        if (gwData?.message) {
          setGatewayTestResult({
            authStatus: gwData.authStatus || "error",
            message: gwData.message,
            models: gwData.models,
          });
        }
      } catch {
        // Ignore error
      }
    };
    void loadSettingsAndModels();
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
        }, 450);
      }
    } catch {
      setStatusMsg("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleTestGateway = async (overrideBaseUrl?: string, overrideModel?: string) => {
    setTestingGateway(true);
    setGatewayTestResult(null);
    try {
      const res = await fetch("/api/settings/test-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: overrideBaseUrl || form.llmBaseUrl,
          apiKey: form.llmApiKey,
          chatModel: overrideModel || form.llmModel,
          imageModel: form.imageModel,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data?.chatModels) && data.chatModels.length > 0) {
        setLiveChatModels(data.chatModels);
      } else if (overrideBaseUrl) {
        setLiveChatModels([]);
      }
      if (Array.isArray(data?.imageModels) && data.imageModels.length > 0) {
        setLiveImageModels(data.imageModels);
      } else if (overrideBaseUrl) {
        setLiveImageModels([]);
      }
      setGatewayTestResult({
        authStatus: data.authStatus || "error",
        message: data.message || "检测完成",
        models: data.models,
      });
    } catch {
      setGatewayTestResult({
        authStatus: "offline",
        message: "检测请求失败，请确认开发服务运行正常",
      });
    } finally {
      setTestingGateway(false);
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

  const isLocalPreset =
    form.llmProvider === "local_gateway" ||
    form.llmBaseUrl.includes("127.0.0.1:18630");

  const displayedChatModels =
    liveChatModels.length > 0
      ? liveChatModels
      : isLocalPreset
        ? [...LOCAL_CHAT_MODELS]
        : [];
  const displayedImageModels =
    liveImageModels.length > 0 ? liveImageModels : [...LOCAL_IMAGE_MODELS];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-[var(--text-primary)]">
              ⚙️ 本地网关、生图表情包与模型设置舱
            </h3>
            <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
              支持本地网关 (127.0.0.1:18630/v1) 对话 + 表情包/拍照生图，以及 xAI / DeepSeek / OpenAI
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-[var(--bg-hover)] flex items-center justify-center text-xs text-[var(--text-secondary)] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* 1. Provider Quick Presets */}
          <div className="space-y-2">
            <label className="font-semibold text-[var(--text-primary)] block">
              1. 一键选择 API 引擎预设
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PROVIDER_PRESETS.map((preset) => {
                const isSelected = form.llmProvider === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        llmProvider: preset.id,
                        llmBaseUrl: preset.baseUrl,
                        llmModel: preset.model,
                      }));
                      void handleTestGateway(preset.baseUrl, preset.model);
                    }}
                    className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#1683FF] bg-[#1683FF]/10 text-[#1683FF]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <div className="font-semibold text-[11.5px] truncate">
                      {preset.label}
                    </div>
                    <div className="text-[10px] opacity-80 mt-0.5 truncate">
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
                SDK Base URL（含 `/v1`）
              </label>
              <input
                type="text"
                value={form.llmBaseUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, llmBaseUrl: e.target.value }))
                }
                placeholder={LOCAL_GATEWAY_BASE_URL}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#1683FF]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[var(--text-secondary)]">
                  聊天文本模型 (Chat Model)
                </label>
                {liveChatModels.length > 0 && (
                  <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
                    已实时拉取 {liveChatModels.length} 个模型
                  </span>
                )}
              </div>
              <input
                type="text"
                value={form.llmModel}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, llmModel: e.target.value }))
                }
                placeholder="gpt-5.6 / gpt-6 / auto"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#1683FF]"
              />
              {displayedChatModels.length > 0 && (
                <div className="mt-2 max-h-24 overflow-y-auto flex flex-wrap items-center gap-1.5 pr-1">
                  {displayedChatModels.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, llmModel: m }))
                      }
                      className={`px-2.5 py-0.5 rounded-full text-[10.5px] border transition-colors cursor-pointer ${
                        form.llmModel === m
                          ? "border-[#1683FF] bg-[#1683FF]/12 text-[#1683FF] font-semibold"
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* API Key + Gateway Connectivity Check */}
          <div className="space-y-2">
            <label className="block text-[var(--text-secondary)]">
              调用密钥 API Key（若本地网关显示「未登录」，请在网关客户端登录后复制密钥填入；支持免密直连也可留空）
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={form.llmApiKey}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, llmApiKey: e.target.value }))
                }
                placeholder="sk-... / 本地网关调用密钥（可留空尝试直连）"
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[#1683FF]"
              />
              <button
                type="button"
                onClick={() => void handleTestGateway()}
                disabled={testingGateway}
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11.5px] font-semibold text-[var(--text-primary)] shrink-0 cursor-pointer"
              >
                {testingGateway ? "拉取中..." : "↻ 拉取模型 / 测试连通"}
              </button>
            </div>

            {gatewayTestResult && (
              <div
                className={`p-3 rounded-xl border text-[11.5px] ${
                  gatewayTestResult.authStatus === "ok"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                    : gatewayTestResult.authStatus === "unauthorized"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300"
                }`}
              >
                <div>{gatewayTestResult.message}</div>
              </div>
            )}
          </div>

          {/* 2. Image & Sticker Model Settings */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-[var(--text-primary)]">
                2. 🎨 图片与表情包生成模型（Image &amp; Sticker Engine）
              </label>
              {liveImageModels.length > 0 && (
                <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
                  已实时拉取 {liveImageModels.length} 个模型
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {displayedImageModels.map((imgModel) => {
                const active = (form.imageModel || "gpt-image-2.6") === imgModel;
                return (
                  <button
                    key={imgModel}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, imageModel: imgModel }))
                    }
                    className={`px-3 py-1.5 rounded-full text-[11px] border transition-all cursor-pointer ${
                      active
                        ? "border-[#1683FF] bg-[#1683FF]/12 text-[#1683FF] font-semibold"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {imgModel}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <label className="p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    自动配发贴纸表情包
                  </div>
                  <div className="text-[10.5px] text-[var(--text-muted)]">
                    吐槽/开心/哄你时适度生成表情包
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.enableAutoSticker !== false}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      enableAutoSticker: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#1683FF]"
                />
              </label>

              <label className="p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    自动生成情境实拍图
                  </div>
                  <div className="text-[10.5px] text-[var(--text-muted)]">
                    要照片或情境契合时真实生图并存盘
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={form.enableAutoPhoto !== false}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      enableAutoPhoto: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 accent-[#1683FF]"
                />
              </label>
            </div>
          </div>

          {/* 3. DeepSearch Engine Config */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
            <label className="font-semibold text-[var(--text-primary)] block">
              3. 🌐 DeepSearch 实时联网搜索引擎
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: "builtin",
                  title: "内置免配置搜索",
                  desc: "Wikipedia + DuckDuckGo",
                },
                {
                  id: "tavily",
                  title: "Tavily AI 搜索",
                  desc: "Agent 优化实时检索",
                },
                {
                  id: "serper",
                  title: "Google Serper",
                  desc: "Google 实时结果接口",
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
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    form.searchProvider === sp.id
                      ? "border-sky-500 bg-sky-500/12 text-sky-600 dark:text-sky-300"
                      : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
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
            <div className="p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="输入测试搜索词..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs"
                />
                <button
                  type="button"
                  onClick={handleTestSearch}
                  disabled={testingSearch}
                  className="px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-600 dark:text-sky-300 border border-sky-500/30 font-medium cursor-pointer"
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
                      🌐 <span className="text-sky-500">[{r.source}]</span>{" "}
                      {r.title} — {r.snippet}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {statusMsg && (
            <div className="text-emerald-600 dark:text-emerald-400 font-medium text-center">
              {statusMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex justify-end gap-2 bg-[var(--bg-secondary)]/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-5 py-2 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 font-semibold text-xs cursor-pointer"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>
    </div>
  );
}
