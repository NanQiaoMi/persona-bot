"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Chip, FieldInput } from "@/components/primitives";

interface Model {
  name: string;
  inputPrice: number;
  outputPrice: number;
  tags?: string[];
}

interface ModelGroup {
  id: string;
  name: string;
  description: string;
  models: Model[];
}

const modelGroups: ModelGroup[] = [
  {
    id: "openrouter-free",
    name: "OpenRouter Free",
    description: "完全免费（Input: $0 / Output: $0）",
    models: [
      { name: "alibaba/tongyi-deepresearch-30b-a3b:free", inputPrice: 0, outputPrice: 0, tags: ["alibaba"] },
      { name: "deepseek/deepseek-chat-v3-0324:free", inputPrice: 0, outputPrice: 0, tags: ["deepseek"] },
      { name: "deepseek/deepseek-chat-v3.1:free", inputPrice: 0, outputPrice: 0, tags: ["deepseek"] },
      { name: "deepseek/deepseek-r1-0528:free", inputPrice: 0, outputPrice: 0, tags: ["deepseek", "reasoning"] },
      { name: "deepseek/deepseek-r1-distill-llama-70b:free", inputPrice: 0, outputPrice: 0, tags: ["deepseek", "reasoning"] },
      { name: "google/gemini-2.5-pro-exp-03-25", inputPrice: 0, outputPrice: 0, tags: ["google", "gemini"] },
      { name: "google/gemma-3-27b-it:free", inputPrice: 0, outputPrice: 0, tags: ["google"] },
      { name: "mistralai/mistral-7b-instruct:free", inputPrice: 0, outputPrice: 0, tags: ["mistral"] },
      { name: "moonshotai/kimi-k2:free", inputPrice: 0, outputPrice: 0, tags: ["moonshot", "kimi"] },
      { name: "qwen/qwen3-235b-a22b:free", inputPrice: 0, outputPrice: 0, tags: ["qwen", "alibaba"] },
      { name: "qwen/qwq-32b:free", inputPrice: 0, outputPrice: 0, tags: ["qwen", "reasoning"] },
    ],
  },
  {
    id: "claude-official",
    name: "Claude 官方",
    description: "Anthropic 官方渠道",
    models: [
      { name: "claude-3-5-sonnet-20240620", inputPrice: 7.5, outputPrice: 37.5, tags: ["claude-3.5"] },
      { name: "claude-3-5-sonnet-20241022", inputPrice: 7.5, outputPrice: 37.5, tags: ["claude-3.5"] },
      { name: "claude-3-7-sonnet-20250219", inputPrice: 7.5, outputPrice: 37.5, tags: ["claude-3.7"] },
      { name: "claude-haiku-4-5-20251001", inputPrice: 2.5, outputPrice: 12.5, tags: ["claude-haiku", "fast"] },
      { name: "claude-opus-4-20250514", inputPrice: 37.5, outputPrice: 187.5, tags: ["claude-opus"] },
      { name: "claude-opus-4-5-20251101", inputPrice: 12.5, outputPrice: 62.5, tags: ["claude-opus"] },
      { name: "claude-sonnet-4-20250514", inputPrice: 7.5, outputPrice: 37.5, tags: ["claude-sonnet"] },
      { name: "claude-sonnet-4-5-20250929", inputPrice: 7.5, outputPrice: 37.5, tags: ["claude-sonnet"] },
      { name: "claude-sonnet-4-6", inputPrice: 7.5, outputPrice: 37.5, tags: ["claude-sonnet"] },
    ],
  },
  {
    id: "claude-discount",
    name: "Claude 特惠",
    description: "特价优惠的 Claude 模型",
    models: [
      { name: "claude-opus-4-1-20250805", inputPrice: 30, outputPrice: 150, tags: ["claude-opus", "特价"] },
      { name: "claude-opus-4-20250514-thinking", inputPrice: 30, outputPrice: 150, tags: ["claude-opus", "thinking"] },
      { name: "claude-opus-4-6-thinking", inputPrice: 10, outputPrice: 50, tags: ["claude-opus", "thinking", "特价"] },
      { name: "claude-opus-4-7-thinking", inputPrice: 10, outputPrice: 50, tags: ["claude-opus", "thinking", "特价"] },
      { name: "claude-sonnet-4-6-thinking", inputPrice: 6, outputPrice: 30, tags: ["claude-sonnet", "thinking", "特价"] },
    ],
  },
  {
    id: "openai-official",
    name: "OpenAI 官方",
    description: "OpenAI 官方直连接口通道",
    models: [
      { name: "gpt-4.1", inputPrice: 9, outputPrice: 36, tags: ["gpt-4"] },
      { name: "gpt-4.1-mini", inputPrice: 1.8, outputPrice: 7.2, tags: ["gpt-4", "mini"] },
      { name: "gpt-4.1-nano", inputPrice: 0.45, outputPrice: 1.8, tags: ["gpt-4", "nano"] },
      { name: "gpt-4o-mini-2024-07-18", inputPrice: 0.675, outputPrice: 2.7, tags: ["gpt-4o", "mini"] },
      { name: "gpt-5", inputPrice: 10, outputPrice: 80, tags: ["gpt-5"] },
      { name: "gpt-5-mini-2025-08-07", inputPrice: 1.125, outputPrice: 9, tags: ["gpt-5", "mini"] },
      { name: "gpt-5-pro-high", inputPrice: 67.5, outputPrice: 540, tags: ["gpt-5", "pro"] },
      { name: "gpt-5.2", inputPrice: 7.875, outputPrice: 63, tags: ["gpt-5.2"] },
      { name: "gpt-5.4-pro", inputPrice: 270, outputPrice: 2160, tags: ["gpt-5.4", "pro"] },
      { name: "o3-mini", inputPrice: 4.95, outputPrice: 19.8, tags: ["o3", "reasoning"] },
    ],
  },
  {
    id: "azpro",
    name: "Azure 进阶",
    description: "Azure 平台进阶模型合集",
    models: [
      { name: "gpt-4.1-2025-04-14", inputPrice: 0.8, outputPrice: 3.2, tags: ["gpt-4"] },
      { name: "gpt-4.1-mini-2025-04-14", inputPrice: 0.16, outputPrice: 0.64, tags: ["gpt-4", "mini"] },
      { name: "gpt-4.1-nano-2025-04-14", inputPrice: 0.04, outputPrice: 0.16, tags: ["gpt-4", "nano"] },
      { name: "gpt-4o", inputPrice: 1, outputPrice: 4, tags: ["gpt-4o"] },
      { name: "gpt-5-chat", inputPrice: 0.5, outputPrice: 4, tags: ["gpt-5"] },
      { name: "gpt-5-codex", inputPrice: 0.5, outputPrice: 4, tags: ["gpt-5", "codex"] },
      { name: "gpt-5-mini", inputPrice: 0.1, outputPrice: 0.8, tags: ["gpt-5", "mini"] },
      { name: "gpt-5-nano", inputPrice: 0.02, outputPrice: 0.16, tags: ["gpt-5", "nano"] },
      { name: "gpt-5-thinking", inputPrice: 0.5, outputPrice: 4, tags: ["gpt-5", "thinking"] },
      { name: "gpt-5.1-chat", inputPrice: 0.5, outputPrice: 4, tags: ["gpt-5.1"] },
      { name: "gpt-5.1-codex-high", inputPrice: 0.5, outputPrice: 4, tags: ["gpt-5.1", "codex"] },
      { name: "gpt-5.1-codex-max", inputPrice: 0.5, outputPrice: 4, tags: ["gpt-5.1", "codex"] },
      { name: "gpt-5.1-high", inputPrice: 0.5, outputPrice: 4, tags: ["gpt-5.1"] },
      { name: "gpt-5.2-chat", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.2"] },
      { name: "gpt-5.2-codex", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.2", "codex"] },
      { name: "gpt-5.2-codex-high", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.2", "codex"] },
      { name: "gpt-5.2-codex-xhigh", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.2", "codex"] },
      { name: "gpt-5.2-high", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.2"] },
      { name: "gpt-5.2-thinking", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.2", "thinking"] },
      { name: "gpt-5.3-codex", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.3", "codex"] },
      { name: "gpt-5.3-codex-high", inputPrice: 0.7, outputPrice: 5.6, tags: ["gpt-5.3", "codex"] },
      { name: "gpt-5.4-codex-high", inputPrice: 1, outputPrice: 8, tags: ["gpt-5.4", "codex"] },
      { name: "gpt-5.4-codex-xhigh", inputPrice: 1, outputPrice: 8, tags: ["gpt-5.4", "codex"] },
      { name: "gpt-5.4-high", inputPrice: 1, outputPrice: 8, tags: ["gpt-5.4"] },
      { name: "gpt-5.4-mini", inputPrice: 0.3, outputPrice: 2.4, tags: ["gpt-5.4", "mini"] },
      { name: "gpt-5.4-thinking", inputPrice: 1, outputPrice: 8, tags: ["gpt-5.4", "thinking"] },
      { name: "o3", inputPrice: 0.8, outputPrice: 3.2, tags: ["o3", "reasoning"] },
      { name: "o4-mini-2025-04-16", inputPrice: 0.44, outputPrice: 1.76, tags: ["o4", "mini"] },
    ],
  },
  {
    id: "azure",
    name: "Azure 标准",
    description: "标准 Azure API 渠道",
    models: [
      { name: "gpt-4.1-mini-2024-05-14", inputPrice: 0.08, outputPrice: 0.32, tags: ["gpt-4", "mini"] },
      { name: "gpt-5.1", inputPrice: 0.25, outputPrice: 2, tags: ["gpt-5.1"] },
      { name: "gpt-5.1-codex", inputPrice: 0.25, outputPrice: 2, tags: ["gpt-5.1", "codex"] },
      { name: "gpt-5.1-codex-max", inputPrice: 0.25, outputPrice: 2, tags: ["gpt-5.1", "codex"] },
      { name: "gpt-5.2-codex", inputPrice: 0.35, outputPrice: 2.8, tags: ["gpt-5.2", "codex"] },
      { name: "gpt-5.2-pro", inputPrice: 4.2, outputPrice: 33.6, tags: ["gpt-5.2", "pro"] },
      { name: "gpt-5.3-chat", inputPrice: 0.35, outputPrice: 2.8, tags: ["gpt-5.3"] },
      { name: "gpt-oss-120b", inputPrice: 0.03, outputPrice: 0.12, tags: ["oss"] },
      { name: "o3-2025-04-16", inputPrice: 0.4, outputPrice: 1.6, tags: ["o3", "reasoning"] },
    ],
  },
  {
    id: "codex",
    name: "Codex 代码模型",
    description: "代码生成能力特化模型",
    models: [
      { name: "gpt-5.1-codex-max-high", inputPrice: 0.125, outputPrice: 1, tags: ["gpt-5.1", "codex"] },
      { name: "gpt-5.1-codex-max-xhigh", inputPrice: 0.125, outputPrice: 1, tags: ["gpt-5.1", "codex"] },
      { name: "gpt-5.1-codex-mini", inputPrice: 0.025, outputPrice: 0.2, tags: ["gpt-5.1", "codex", "mini"] },
      { name: "gpt-5.1-codex-mini-high", inputPrice: 0.025, outputPrice: 0.2, tags: ["gpt-5.1", "codex", "mini"] },
      { name: "gpt-5.4", inputPrice: 0.25, outputPrice: 2, tags: ["gpt-5.4"] },
      { name: "gpt-5.4-codex", inputPrice: 0.25, outputPrice: 2, tags: ["gpt-5.4", "codex"] },
    ],
  },
  {
    id: "deepseek-azure",
    name: "DeepSeek Azure",
    description: "托管于 Azure 的 DeepSeek 系列模型",
    models: [
      { name: "deepseek-chat", inputPrice: 0.8, outputPrice: 3.2, tags: ["deepseek", "chat"] },
      { name: "deepseek-r1", inputPrice: 1.6, outputPrice: 6.4, tags: ["deepseek", "reasoning"] },
      { name: "deepseek-r1-0528", inputPrice: 1.6, outputPrice: 6.4, tags: ["deepseek", "reasoning"] },
      { name: "deepseek-v3", inputPrice: 0.8, outputPrice: 3.2, tags: ["deepseek"] },
      { name: "deepseek-v3-0324", inputPrice: 0.8, outputPrice: 3.2, tags: ["deepseek"] },
      { name: "deepseek-v3.1", inputPrice: 1.6, outputPrice: 6.4, tags: ["deepseek"] },
      { name: "deepseek-v3.2", inputPrice: 0.8, outputPrice: 1.2, tags: ["deepseek"] },
    ],
  },
  {
    id: "gemini-vertex",
    name: "Gemini Vertex",
    description: "Google Vertex AI 渠道模型",
    models: [
      { name: "gemini-2.5-flash", inputPrice: 0.24, outputPrice: 2.016, tags: ["gemini-2.5", "flash"] },
      { name: "gemini-2.5-flash-nothinking", inputPrice: 0.24, outputPrice: 2, tags: ["gemini-2.5", "flash"] },
      { name: "gemini-2.5-flash-thinking", inputPrice: 0.24, outputPrice: 2.016, tags: ["gemini-2.5", "flash", "thinking"] },
      { name: "gemini-2.5-pro", inputPrice: 2, outputPrice: 16, tags: ["gemini-2.5", "pro"] },
      { name: "gemini-2.5-pro-nothinking", inputPrice: 2, outputPrice: 16.666, tags: ["gemini-2.5", "pro"] },
      { name: "gemini-2.5-pro-preview-05-06", inputPrice: 4, outputPrice: 32, tags: ["gemini-2.5", "pro", "preview"] },
      { name: "gemini-2.5-pro-thinking", inputPrice: 2, outputPrice: 16, tags: ["gemini-2.5", "pro", "thinking"] },
      { name: "gemini-3-flash-preview", inputPrice: 0.4, outputPrice: 2.4, tags: ["gemini-3", "flash", "preview"] },
      { name: "gemini-3-pro-preview", inputPrice: 1.6, outputPrice: 9.6, tags: ["gemini-3", "pro", "preview"] },
      { name: "gemini-3-pro-preview-thinking", inputPrice: 1.6, outputPrice: 9.6, tags: ["gemini-3", "pro", "thinking"] },
      { name: "gemini-3.1-flash-lite-preview", inputPrice: 0.2, outputPrice: 1.2, tags: ["gemini-3.1", "flash", "preview"] },
      { name: "gemini-3.1-pro-preview", inputPrice: 1.6, outputPrice: 9.6, tags: ["gemini-3.1", "pro", "preview"] },
    ],
  },
];

export default function ModelsPage() {
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = Array.from(
    new Set(modelGroups.flatMap((g) => g.models.flatMap((m) => m.tags || [])))
  ).sort();

  const filteredGroups =
    selectedGroup === "all"
      ? modelGroups
      : modelGroups.filter((g) => g.id === selectedGroup);

  const formatPrice = (price: number) => {
    if (price === 0) return "$0";
    if (price < 0.01) return `$${price.toFixed(4)}`;
    if (price < 1) return `$${price.toFixed(3)}`;
    if (price < 10) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(1)}`;
  };

  const totalModels = modelGroups.reduce((sum, g) => sum + g.models.length, 0);
  const freeModels = modelGroups
    .flatMap((g) => g.models)
    .filter((m) => m.inputPrice === 0 && m.outputPrice === 0).length;

  return (
    <div className="min-h-screen bg-surface-base text-primary flex flex-col">
      <header className="sticky top-0 z-20 px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-surface-overlay backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/settings"
              className="px-3 py-1.5 rounded-full bg-surface-raised hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-secondary hover:text-primary transition-colors shrink-0"
            >
              ← 返回设置
            </Link>
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-primary truncate">
                模型价格参考表
              </h1>
              <p className="text-[12px] text-muted truncate">
                共 {totalModels} 个模型，{freeModels} 个免费 · 仅供参考 · 更新日期 2026-11-24
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="px-3 py-1.5 rounded-full bg-surface-raised hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-secondary hover:text-primary transition-colors shrink-0"
          >
            工作台
          </Link>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Channel Filters */}
        <div className="flex flex-wrap gap-2">
          <Chip
            selected={selectedGroup === "all"}
            onClick={() => setSelectedGroup("all")}
          >
            全部 ({totalModels})
          </Chip>
          {modelGroups.map((group) => (
            <Chip
              key={group.id}
              selected={selectedGroup === group.id}
              onClick={() => setSelectedGroup(group.id)}
            >
              {group.name} ({group.models.length})
            </Chip>
          ))}
        </div>

        {/* Tag Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted mr-1">标签：</span>
          <Chip
            size="sm"
            tone="info"
            selected={selectedTag === null}
            onClick={() => setSelectedTag(null)}
          >
            全部
          </Chip>
          {allTags.slice(0, 20).map((tag) => (
            <Chip
              key={tag}
              size="sm"
              tone="info"
              selected={selectedTag === tag}
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
            >
              {tag}
            </Chip>
          ))}
        </div>

        {/* Search */}
        <div className="max-w-md">
          <FieldInput
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索模型名称..."
          />
        </div>

        {/* Model Groups */}
        <div className="space-y-5">
          {filteredGroups.map((group) => {
            let filteredModels = group.models;

            if (searchTerm) {
              filteredModels = filteredModels.filter((m) =>
                m.name.toLowerCase().includes(searchTerm.toLowerCase())
              );
            }

            if (selectedTag) {
              filteredModels = filteredModels.filter((m) =>
                m.tags?.includes(selectedTag)
              );
            }

            if (filteredModels.length === 0) return null;

            return (
              <Card
                key={group.id}
                variant="flat"
                padding="none"
                className="overflow-hidden bg-surface-base"
              >
                <div className="px-5 py-4 bg-surface-raised border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-bold text-primary truncate">
                      {group.name}
                    </h2>
                    <p className="text-[12px] text-secondary mt-0.5">
                      {group.description}
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 text-[11px] rounded-full bg-surface-sunken text-secondary shrink-0">
                    {filteredModels.length} 个模型
                  </span>
                </div>

                <div className="divide-y divide-[var(--border-subtle)]">
                  {filteredModels.map((model) => (
                    <div
                      key={model.name}
                      className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="text-[13px] font-mono text-primary break-all">
                          {model.name}
                        </div>
                        {model.tags && model.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {model.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 text-[11px] rounded-full bg-surface-raised text-muted"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-[12px] tabular-nums shrink-0">
                        <div>
                          <span className="text-muted mr-1">输入</span>
                          <span
                            className={`font-medium ${
                              model.inputPrice === 0 ? "text-success" : "text-primary"
                            }`}
                          >
                            {formatPrice(model.inputPrice)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted mr-1">输出</span>
                          <span
                            className={`font-medium ${
                              model.outputPrice === 0 ? "text-success" : "text-primary"
                            }`}
                          >
                            {formatPrice(model.outputPrice)}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted hidden sm:inline">
                          /M tokens
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Summary */}
        <Card variant="flat" padding="lg" className="space-y-2">
          <h3 className="text-[13px] font-semibold text-primary">计价说明</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px] text-secondary">
            <p>
              <strong className="text-primary">$/M tokens</strong>：每百万词元参考价格（仅供参考，以各平台实时账单为准）
            </p>
            <p>
              <strong className="text-primary">免费额度</strong>：标记为 $0 的渠道可能存在并发或每日限额
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
