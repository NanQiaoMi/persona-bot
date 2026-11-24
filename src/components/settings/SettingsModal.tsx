"use client";

import { useEffect, useState } from "react";
import { Button, Chip, FieldInput, Modal } from "@/components/primitives";
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
        message: "检测请求没有发出去，确认 npm run dev 还在运行",
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="设置与模型配置"
      description="支持本地网关 (127.0.0.1:18630/v1) 对话 + 表情包/拍照生图，以及 xAI / DeepSeek / OpenAI"
      bodyClassName="flex flex-col min-h-0"
    >
      {/* Body */}
      <div className="p-6 overflow-y-auto space-y-5 text-[12px] flex-1">
        {/* 1. Provider Quick Presets */}
        <div className="space-y-2">
          <label className="font-semibold text-primary block">
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
                  className={`p-2.5 rounded-[var(--r-lg)] border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-[var(--border-subtle)] bg-surface-raised text-secondary hover:text-primary"
                  }`}
                >
                  <div className="font-semibold text-[12px] truncate">
                    {preset.label}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5 truncate">
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
            <label className="block text-secondary mb-1">
              SDK Base URL（含 `/v1`）
            </label>
            <FieldInput
              type="text"
              value={form.llmBaseUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, llmBaseUrl: e.target.value }))
              }
              placeholder={LOCAL_GATEWAY_BASE_URL}
              className="!bg-surface-base !text-[12px]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-secondary">
                聊天文本模型 (Chat Model)
              </label>
              {liveChatModels.length > 0 && (
                <span className="text-[11px] text-success font-medium">
                  已实时拉取 {liveChatModels.length} 个模型
                </span>
              )}
            </div>
            <FieldInput
              type="text"
              value={form.llmModel}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, llmModel: e.target.value }))
              }
              placeholder="gpt-5.6 / gpt-6 / auto"
              className="!bg-surface-base !text-[12px]"
            />
            {displayedChatModels.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto flex flex-wrap items-center gap-1.5 pr-1">
                {displayedChatModels.map((m) => (
                  <Chip
                    key={m}
                    size="sm"
                    tone="brand"
                    selected={form.llmModel === m}
                    onClick={() =>
                      setForm((prev) => ({ ...prev, llmModel: m }))
                    }
                  >
                    {m}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* API Key + Gateway Connectivity Check */}
        <div className="space-y-2">
          <label className="block text-secondary">
            调用密钥 API Key（若本地网关显示「未登录」，请在网关客户端登录后复制密钥填入；支持免密直连也可留空）
          </label>
          <div className="flex gap-2">
            <FieldInput
              type="password"
              value={form.llmApiKey}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, llmApiKey: e.target.value }))
              }
              placeholder="sk-... / 本地网关调用密钥（可留空尝试直连）"
              className="flex-1 !bg-surface-base !text-[12px]"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={testingGateway}
              onClick={() => void handleTestGateway()}
              className="shrink-0 !rounded-[var(--r-md)] !h-auto py-2"
            >
              {testingGateway ? "拉取中..." : "↻ 拉取模型 / 测试连通"}
            </Button>
          </div>

          {gatewayTestResult && (
            <div
              className={`p-3 rounded-[var(--r-md)] border text-[12px] ${
                gatewayTestResult.authStatus === "ok"
                  ? "bg-success-soft border-[var(--sem-success)]/30 text-success"
                  : gatewayTestResult.authStatus === "unauthorized"
                    ? "bg-warning-soft border-[var(--sem-warning)]/30 text-warning"
                    : "bg-danger-soft border-[var(--sem-danger)]/30 text-danger"
              }`}
            >
              <div className="font-medium">{gatewayTestResult.message}</div>
              {gatewayTestResult.authStatus === "offline" && (
                <div className="mt-2 space-y-1.5 text-secondary">
                  <p>暂时连不上模型服务，聊天会先用离线演示回复。可以这样排查：</p>
                  <ol className="list-decimal pl-4 space-y-0.5">
                    <li>打开本地网关客户端，确认它正在运行</li>
                    <li>核对上面的地址和端口（默认 127.0.0.1:18630/v1）</li>
                    <li>用的是云端服务的话，检查 API Key 是否填写</li>
                  </ol>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={testingGateway}
                    onClick={() => void handleTestGateway()}
                    className="mt-1"
                  >
                    {testingGateway ? "检测中…" : "重新检测"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Image & Sticker Model Settings */}
        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-primary">
              2. 🎨 图片与表情包生成模型（Image &amp; Sticker Engine）
            </label>
            {liveImageModels.length > 0 && (
              <span className="text-[11px] text-success font-medium">
                已实时拉取 {liveImageModels.length} 个模型
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {displayedImageModels.map((imgModel) => {
              const active = (form.imageModel || "gpt-image-2.6") === imgModel;
              return (
                <Chip
                  key={imgModel}
                  size="sm"
                  tone="brand"
                  selected={active}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, imageModel: imgModel }))
                  }
                >
                  {imgModel}
                </Chip>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <label className="p-3 rounded-[var(--r-lg)] bg-surface-raised border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-medium text-primary">
                  自动配发贴纸表情包
                </div>
                <div className="text-[11px] text-muted">
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
                className="w-4 h-4 accent-[var(--brand)]"
              />
            </label>

            <label className="p-3 rounded-[var(--r-lg)] bg-surface-raised border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-medium text-primary">
                  自动生成情境实拍图
                </div>
                <div className="text-[11px] text-muted">
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
                className="w-4 h-4 accent-[var(--brand)]"
              />
            </label>
          </div>
        </div>

        {/* 3. DeepSearch Engine Config */}
        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
          <label className="font-semibold text-primary block">
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
                className={`p-2.5 rounded-[var(--r-lg)] border text-left transition-colors cursor-pointer ${
                  form.searchProvider === sp.id
                    ? "border-[var(--sem-info)] bg-info-soft text-info"
                    : "border-[var(--border-subtle)] bg-surface-raised text-secondary"
                }`}
              >
                <div className="font-semibold">{sp.title}</div>
                <div className="text-[11px] opacity-75 mt-0.5">{sp.desc}</div>
              </button>
            ))}
          </div>

          {form.searchProvider === "tavily" && (
            <FieldInput
              type="password"
              value={form.tavilyApiKey}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, tavilyApiKey: e.target.value }))
              }
              placeholder="输入 Tavily API Key (tvly-...)"
              className="!bg-surface-base !text-[12px]"
            />
          )}

          {form.searchProvider === "serper" && (
            <FieldInput
              type="password"
              value={form.serperApiKey}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, serperApiKey: e.target.value }))
              }
              placeholder="输入 Serper API Key"
              className="!bg-surface-base !text-[12px]"
            />
          )}

          {/* Live Search Tester */}
          <div className="p-3 rounded-[var(--r-lg)] bg-surface-raised border border-[var(--border-subtle)] space-y-2">
            <div className="flex gap-2">
              <FieldInput
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="输入测试搜索词..."
                className="flex-1 !bg-surface-base !text-[12px] !rounded-[var(--r-sm)] !py-1.5"
              />
              <Button
                variant="secondary"
                size="sm"
                loading={testingSearch}
                onClick={handleTestSearch}
                className="!rounded-[var(--r-sm)] !bg-info-soft !text-info !border-[var(--sem-info)]/30"
              >
                {testingSearch ? "检索中..." : "测试联网搜索"}
              </Button>
            </div>
            {testResults && (
              <div className="space-y-1 pt-1">
                {testResults.map((r, idx) => (
                  <div
                    key={idx}
                    className="text-[11px] text-secondary truncate"
                  >
                    🌐 <span className="text-info">[{r.source}]</span>{" "}
                    {r.title} — {r.snippet}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {statusMsg && (
          <div className="text-success font-medium text-center">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex justify-end gap-2 bg-surface-raised/60 shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          onClick={handleSave}
        >
          {saving ? "保存中..." : "保存配置"}
        </Button>
      </div>
    </Modal>
  );
}
