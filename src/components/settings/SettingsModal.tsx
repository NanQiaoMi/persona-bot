"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Chip, FieldInput, Modal } from "@/components/primitives";
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
    badge: "对话 + 生图",
  },
  {
    id: "xai",
    label: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3",
    badge: "官方接口",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    badge: "高性价比",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    badge: "通用旗舰",
  },
  {
    id: "ollama",
    label: "Ollama 本地",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:14b",
    badge: "本地私密",
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
  const [testQuery, setTestQuery] = useState("今日科技动态");
  const [testResults, setTestResults] = useState<SearchResultItem[] | null>(null);
  const [testingSearch, setTestingSearch] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const savedTheme =
      typeof window !== "undefined"
        ? (window.localStorage.getItem("personabot-theme") as "light" | "dark" | null)
        : null;

    const loadSettingsAndModels = async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        const loaded: RuntimeSettings = {
          imageModel: "gpt-image-2.6",
          enableAutoSticker: true,
          enableAutoPhoto: true,
          ...(data?.settings || {}),
          theme: savedTheme || data?.settings?.theme || "light",
        };
        if (active && data.success && data.settings) {
          setForm(loaded);
        }

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
        if (typeof window !== "undefined") {
          document.documentElement.setAttribute("data-theme", form.theme);
          window.localStorage.setItem("personabot-theme", form.theme);
        }
        setStatusMsg("✓ 配置已保存并实时生效");
        onSaved?.(data.settings);
        setTimeout(() => {
          onClose();
        }, 450);
      }
    } catch {
      setStatusMsg("保存失败，请检查网络连接后重试");
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
        message: "检测请求没有发出去，确认本地服务还在运行后重试",
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

  const handleSelectTheme = (nextTheme: "light" | "dark") => {
    setForm((prev) => ({ ...prev, theme: nextTheme }));
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme", nextTheme);
      window.localStorage.setItem("personabot-theme", nextTheme);
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

  const connectionBadge = gatewayTestResult ? (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
        gatewayTestResult.authStatus === "ok"
          ? "bg-success-soft text-success"
          : gatewayTestResult.authStatus === "unauthorized"
            ? "bg-warning-soft text-warning"
            : "bg-danger-soft text-danger"
      }`}
    >
      {gatewayTestResult.authStatus === "ok"
        ? "已连接"
        : gatewayTestResult.authStatus === "unauthorized"
          ? "需要密钥"
          : "未连通"}
    </span>
  ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="设置"
      description="配置对话模型、生图模型、联网搜索与界面外观"
      bodyClassName="flex flex-col min-h-0"
    >
      <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-[12px] flex-1">
        {/* Card 1: 对话模型 */}
        <Card variant="flat" padding="md" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-primary">对话模型</h3>
            {connectionBadge}
          </div>

          <div className="space-y-2">
            <label className="text-[12px] text-secondary block">服务预设</label>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDER_PRESETS.map((preset) => (
                <Chip
                  key={preset.id}
                  selected={form.llmProvider === preset.id}
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      llmProvider: preset.id,
                      llmBaseUrl: preset.baseUrl,
                      llmModel: preset.model,
                    }));
                    void handleTestGateway(preset.baseUrl, preset.model);
                  }}
                >
                  {preset.label} · {preset.badge}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-secondary mb-1">接口地址 Base URL</label>
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
                <label className="text-secondary">默认模型名称</label>
                {liveChatModels.length > 0 && (
                  <span className="text-[11px] text-success font-medium">
                    已拉取 {liveChatModels.length} 个
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
            </div>
          </div>

          {displayedChatModels.length > 0 && (
            <div className="max-h-24 overflow-y-auto flex flex-wrap items-center gap-1.5 pr-1">
              {displayedChatModels.map((m) => (
                <Chip
                  key={m}
                  size="sm"
                  selected={form.llmModel === m}
                  onClick={() => setForm((prev) => ({ ...prev, llmModel: m }))}
                >
                  {m}
                </Chip>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-secondary">
              API Key（本地网关支持免密直连时可留空）
            </label>
            <div className="flex gap-2">
              <FieldInput
                type="password"
                value={form.llmApiKey}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, llmApiKey: e.target.value }))
                }
                placeholder="sk-... 或网关密钥"
                className="flex-1 !bg-surface-base !text-[12px]"
              />
              <Button
                variant="secondary"
                size="sm"
                loading={testingGateway}
                onClick={() => void handleTestGateway()}
                className="shrink-0 !rounded-[var(--r-md)] !h-auto py-2"
              >
                {testingGateway ? "检测中..." : "测试连通"}
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
                    <p>暂时连不上模型服务，对话将使用离线演示回复。你可以检查：</p>
                    <ol className="list-decimal pl-4 space-y-0.5">
                      <li>确认本地网关客户端已开启并正在运行</li>
                      <li>核对上方地址与端口（默认 127.0.0.1:18630/v1）</li>
                      <li>如使用云端接口，确认 API Key 已填写且有效</li>
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

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[12px]">
            <span className="text-muted">对比各渠道模型定价与支持列表</span>
            <Link
              href="/models"
              onClick={onClose}
              className="text-brand font-medium hover:underline"
            >
              查看模型价格表 →
            </Link>
          </div>
        </Card>

        {/* Card 2: 生图模型 */}
        <Card variant="flat" padding="md" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-primary">生图模型</h3>
            {liveImageModels.length > 0 && (
              <span className="text-[11px] text-success font-medium">
                已拉取 {liveImageModels.length} 个模型
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {displayedImageModels.map((imgModel) => (
              <Chip
                key={imgModel}
                size="sm"
                selected={(form.imageModel || "gpt-image-2.6") === imgModel}
                onClick={() => setForm((prev) => ({ ...prev, imageModel: imgModel }))}
              >
                {imgModel}
              </Chip>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <label className="p-3 rounded-[var(--r-md)] bg-surface-base border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-medium text-primary">自动配发表情包</div>
                <div className="text-[11px] text-muted">
                  吐槽或开心时适度发送表情包
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

            <label className="p-3 rounded-[var(--r-md)] bg-surface-base border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-medium text-primary">自动发送情境照片</div>
                <div className="text-[11px] text-muted">
                  索要自拍或日常照时真实生成并保存
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
        </Card>

        {/* Card 3: 联网搜索 */}
        <Card variant="flat" padding="md" className="space-y-3">
          <h3 className="text-[14px] font-semibold text-primary">联网搜索</h3>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "builtin", title: "内置免配置搜索" },
              { id: "tavily", title: "Tavily 搜索" },
              { id: "serper", title: "Google Serper" },
            ].map((sp) => (
              <Chip
                key={sp.id}
                tone="info"
                selected={form.searchProvider === sp.id}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    searchProvider: sp.id as RuntimeSettings["searchProvider"],
                  }))
                }
              >
                {sp.title}
              </Chip>
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

          <div className="flex gap-2">
            <FieldInput
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="输入测试搜索词..."
              className="flex-1 !bg-surface-base !text-[12px] !py-1.5"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={testingSearch}
              onClick={handleTestSearch}
              className="!rounded-[var(--r-md)] shrink-0"
            >
              {testingSearch ? "检索中..." : "测试搜索"}
            </Button>
          </div>

          {testResults && (
            <div className="space-y-1 pt-1">
              {testResults.map((r, idx) => (
                <div key={idx} className="text-[11px] text-secondary truncate">
                  <span className="text-info">[{r.source}]</span> {r.title} — {r.snippet}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Card 4: 外观 */}
        <Card variant="flat" padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[14px] font-semibold text-primary">外观</h3>
              <p className="text-[11px] text-muted mt-0.5">
                全站自动同步浅色极简与深空暗色主题
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Chip
                selected={form.theme === "light"}
                onClick={() => handleSelectTheme("light")}
              >
                浅色极简
              </Chip>
              <Chip
                selected={form.theme === "dark"}
                onClick={() => handleSelectTheme("dark")}
              >
                深空暗色
              </Chip>
            </div>
          </div>
        </Card>

        {statusMsg && (
          <div className="text-success font-medium text-center">{statusMsg}</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex justify-end gap-2 bg-surface-raised/60 shrink-0">
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
          {saving ? "保存中..." : "保存配置"}
        </Button>
      </div>
    </Modal>
  );
}
