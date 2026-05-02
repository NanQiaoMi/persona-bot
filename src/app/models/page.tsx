"use client";

import { useState } from 'react';

interface Model {
  name: string;
  inputPrice?: number | string;
  outputPrice?: number | string;
  pricePerRequest?: number | string;
}

interface ModelGroup {
  id: string;
  name: string;
  emoji: string;
  description: string;
  pricingType: 'token' | 'request';
  models: Model[];
}

const modelGroups: ModelGroup[] = [
  {
    id: 'openrouter-free',
    name: 'OpenRouter Free',
    emoji: '🆓',
    description: '完全免费（Input: $0 / Output: $0）',
    pricingType: 'token',
    models: [
      { name: 'alibaba/tongyi-deepresearch-30b-a3b:free', inputPrice: 0, outputPrice: 0 },
      { name: 'deepseek/deepseek-chat-v3-0324:free', inputPrice: 0, outputPrice: 0 },
      { name: 'deepseek/deepseek-chat-v3.1:free', inputPrice: 0, outputPrice: 0 },
      { name: 'deepseek/deepseek-r1-0528:free', inputPrice: 0, outputPrice: 0 },
      { name: 'deepseek/deepseek-r1-distill-llama-70b:free', inputPrice: 0, outputPrice: 0 },
      { name: 'google/gemini-2.5-pro-exp-03-25', inputPrice: 0, outputPrice: 0 },
      { name: 'google/gemma-3-27b-it:free', inputPrice: 0, outputPrice: 0 },
      { name: 'mistralai/mistral-7b-instruct:free', inputPrice: 0, outputPrice: 0 },
      { name: 'moonshotai/kimi-k2:free', inputPrice: 0, outputPrice: 0 },
      { name: 'qwen/qwen3-235b-a22b:free', inputPrice: 0, outputPrice: 0 },
      { name: 'qwen/qwen3-30b-a3b:free', inputPrice: 0, outputPrice: 0 },
      { name: 'qwen/qwq-32b:free', inputPrice: 0, outputPrice: 0 },
    ]
  },
  {
    id: 'oaipro',
    name: 'OAIPRO',
    emoji: '👔',
    description: '主流商用模型合集（含 OpenAI、Claude 及多模态模型）',
    pricingType: 'token',
    models: [
      { name: 'gpt-3.5-turbo', inputPrice: 4, outputPrice: 32 },
      { name: 'gpt-4', inputPrice: 240, outputPrice: 960 },
      { name: 'gpt-4-turbo', inputPrice: 80, outputPrice: 240 },
      { name: 'gpt-4o-2024-11-20', inputPrice: 20, outputPrice: 80 },
      { name: 'gpt-5', inputPrice: 10, outputPrice: 80 },
      { name: 'gpt-5.4-2026-03-05', inputPrice: 480, outputPrice: 3840 },
      { name: 'claude-3-haiku-20240307', inputPrice: 2, outputPrice: 10 },
      { name: 'claude-3-sonnet-20240229', inputPrice: 24, outputPrice: 120 },
      { name: 'claude-3-opus-20240229', inputPrice: 120, outputPrice: 600 },
      { name: 'claude-opus-4-6', inputPrice: 40, outputPrice: 200 },
      { name: 'o4-mini', inputPrice: 8.8, outputPrice: 35.2 },
    ]
  },
  {
    id: 'claude-official',
    name: 'Claude 官方',
    emoji: '🎩',
    description: 'Anthropic 官方渠道',
    pricingType: 'token',
    models: [
      { name: 'claude-3-5-sonnet-20240620', inputPrice: 7.5, outputPrice: 37.5 },
      { name: 'claude-3-5-sonnet-20241022', inputPrice: 7.5, outputPrice: 37.5 },
      { name: 'claude-3-7-sonnet-20250219', inputPrice: 7.5, outputPrice: 37.5 },
      { name: 'claude-haiku-4-5-20251001', inputPrice: 2.5, outputPrice: 12.5 },
      { name: 'claude-opus-4-20250514', inputPrice: 37.5, outputPrice: 187.5 },
      { name: 'claude-opus-4-5-20251101', inputPrice: 12.5, outputPrice: 62.5 },
      { name: 'claude-sonnet-4-20250514', inputPrice: 7.5, outputPrice: 37.5 },
      { name: 'claude-sonnet-4-5-20250929', inputPrice: 7.5, outputPrice: 37.5 },
    ]
  },
  {
    id: 'claude-discount',
    name: 'Claude 特价',
    emoji: '💸',
    description: '特价优惠的 Claude 模型',
    pricingType: 'token',
    models: [
      { name: 'claude-opus-4-1-20250805', inputPrice: 30, outputPrice: 150 },
      { name: 'claude-opus-4-6-thinking', inputPrice: 10, outputPrice: 50 },
      { name: 'claude-opus-4-7-thinking', inputPrice: 10, outputPrice: 50 },
      { name: 'claude-sonnet-4-6-thinking', inputPrice: 6, outputPrice: 30 },
    ]
  },
  {
    id: 'azpro',
    name: 'AZPRO',
    emoji: '💎',
    description: 'Azure 平台进阶模型合集',
    pricingType: 'token',
    models: [
      { name: 'gpt-4.1-2025-04-14', inputPrice: 0.8, outputPrice: 3.2 },
      { name: 'gpt-4.1-mini-2025-04-14', inputPrice: 0.16, outputPrice: 0.64 },
      { name: 'gpt-4o', inputPrice: 1, outputPrice: 4 },
      { name: 'gpt-5-chat', inputPrice: 0.5, outputPrice: 4 },
      { name: 'gpt-5-mini', inputPrice: 0.1, outputPrice: 0.8 },
      { name: 'gpt-5-nano', inputPrice: 0.02, outputPrice: 0.16 },
      { name: 'gpt-5.2-chat', inputPrice: 0.7, outputPrice: 5.6 },
      { name: 'gpt-5.4-high', inputPrice: 1, outputPrice: 8 },
      { name: 'o3', inputPrice: 0.8, outputPrice: 3.2 },
      { name: 'o4-mini-2025-04-16', inputPrice: 0.44, outputPrice: 1.76 },
    ]
  },
  {
    id: 'azure',
    name: 'Azure',
    emoji: '☁️',
    description: '标准 Azure API 渠道',
    pricingType: 'token',
    models: [
      { name: 'gpt-4.1-mini-2024-05-14', inputPrice: 0.08, outputPrice: 0.32 },
      { name: 'gpt-5.1', inputPrice: 0.25, outputPrice: 2 },
      { name: 'gpt-5.2-pro', inputPrice: 4.2, outputPrice: 33.6 },
      { name: 'gpt-5.3-chat', inputPrice: 0.35, outputPrice: 2.8 },
      { name: 'gpt-oss-120b', inputPrice: 0.03, outputPrice: 0.12 },
    ]
  },
  {
    id: 'deepseek-azure',
    name: 'DeepSeek Azure',
    emoji: '🐋',
    description: '托管于 Azure 的 DeepSeek 家族模型',
    pricingType: 'token',
    models: [
      { name: 'deepseek-chat', inputPrice: 0.8, outputPrice: 3.2 },
      { name: 'deepseek-r1', inputPrice: 1.6, outputPrice: 6.4 },
      { name: 'deepseek-v3', inputPrice: 0.8, outputPrice: 3.2 },
      { name: 'deepseek-v3.1', inputPrice: 1.6, outputPrice: 6.4 },
      { name: 'deepseek-v3.2', inputPrice: 0.8, outputPrice: 1.2 },
    ]
  },
  {
    id: 'gemini-vertex',
    name: 'Gemini Vertex',
    emoji: '🌌',
    description: 'Google Vertex AI 渠道模型',
    pricingType: 'token',
    models: [
      { name: 'gemini-2.5-flash', inputPrice: 0.24, outputPrice: 2.016 },
      { name: 'gemini-2.5-pro', inputPrice: 2, outputPrice: 16 },
      { name: 'gemini-3-flash-preview', inputPrice: 0.4, outputPrice: 2.4 },
      { name: 'gemini-3-pro-preview', inputPrice: 1.6, outputPrice: 9.6 },
      { name: 'gemini-3.1-pro-preview', inputPrice: 1.6, outputPrice: 9.6 },
    ]
  },
  {
    id: 'gemini-per-request',
    name: 'Gemini 按次',
    emoji: '🎟️',
    description: '按请求次数计费的 Gemini 特殊功能模型',
    pricingType: 'request',
    models: [
      { name: 'gemini-2.5-flash-all', pricePerRequest: 0.01 },
      { name: 'gemini-2.5-flash-deepsearch', pricePerRequest: 0.25 },
      { name: 'gemini-2.5-flash-image', pricePerRequest: 0.03 },
      { name: 'gemini-2.5-pro-all', pricePerRequest: 0.025 },
      { name: 'gemini-2.5-pro-deepsearch', pricePerRequest: 0.5 },
      { name: 'gemini-3-pro-all', pricePerRequest: 0.03 },
      { name: 'gemini-3-pro-deepsearch', pricePerRequest: 0.6 },
      { name: 'gemini-3-pro-image-preview', pricePerRequest: 0.15 },
    ]
  },
  {
    id: 'openai-official',
    name: 'OpenAI 官方',
    emoji: '🟢',
    description: 'OpenAI 官方直连接口通道',
    pricingType: 'token',
    models: [
      { name: 'gpt-4.1', inputPrice: 9, outputPrice: 36 },
      { name: 'gpt-4.1-mini', inputPrice: 1.8, outputPrice: 7.2 },
      { name: 'gpt-4.1-nano', inputPrice: 0.45, outputPrice: 1.8 },
      { name: 'gpt-5-mini-2025-08-07', inputPrice: 1.125, outputPrice: 9 },
      { name: 'gpt-5-pro-high', inputPrice: 67.5, outputPrice: 540 },
      { name: 'gpt-5.2', inputPrice: 7.875, outputPrice: 63 },
      { name: 'gpt-5.4-pro', inputPrice: 270, outputPrice: 2160 },
      { name: 'o3-mini', inputPrice: 4.95, outputPrice: 19.8 },
    ]
  },
  {
    id: 'openai-per-request',
    name: 'OpenAI 按次',
    emoji: '🎫',
    description: '支持图像、视频生成及 ALL 系列的按次计费模型',
    pricingType: 'request',
    models: [
      { name: 'gpt-4o-image', pricePerRequest: 0.04 },
      { name: 'gpt-5-all', pricePerRequest: 0.04 },
      { name: 'gpt-5-pro', pricePerRequest: 1 },
      { name: 'gpt-5-thinking-all', pricePerRequest: 0.04 },
      { name: 'gpt-image-1', pricePerRequest: 0.04 },
      { name: 'o1-pro', pricePerRequest: 1.2 },
      { name: 'o3-pro', pricePerRequest: 0.6 },
      { name: 'sora-2', pricePerRequest: 0.08 },
      { name: 'sora-2-pro', pricePerRequest: 2 },
    ]
  },
  {
    id: 'grok-reviewed',
    name: 'Grok 有审',
    emoji: '🐕',
    description: 'X.AI 官方带有内容审查的按次计费模型',
    pricingType: 'request',
    models: [
      { name: 'grok-3', pricePerRequest: 0.008 },
      { name: 'grok-3-deepsearch', pricePerRequest: 0.08 },
      { name: 'grok-3-reasoner', pricePerRequest: 0.08 },
      { name: 'grok-4', pricePerRequest: 0.015 },
      { name: 'grok-4-fast', pricePerRequest: 0.015 },
    ]
  },
  {
    id: 'grok-unreviewed',
    name: 'Grok 无审',
    emoji: '🐺',
    description: 'X.AI 取消内容审查的按次计费模型',
    pricingType: 'request',
    models: [
      { name: 'grok-4-reasoning', pricePerRequest: 0.03 },
      { name: 'grok-4.1', pricePerRequest: 0.03 },
      { name: 'grok-4.1-thinking', pricePerRequest: 0.03 },
      { name: 'grok-4.2', pricePerRequest: 0.025 },
    ]
  },
];

export default function ModelsPage() {
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGroups = selectedGroup === 'all' 
    ? modelGroups 
    : modelGroups.filter(g => g.id === selectedGroup);

  const formatPrice = (price: number | string | undefined) => {
    if (price === undefined) return '-';
    if (typeof price === 'string') return price;
    if (price === 0) return '免费';
    return `$${price}`;
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">API 模型价格表</h1>
          <p className="text-zinc-400">各渠道模型价格对比（单位：$/M tokens 或 $/次）</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setSelectedGroup('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedGroup === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            全部
          </button>
          {modelGroups.map(group => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedGroup === group.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {group.emoji} {group.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索模型名称..."
            className="w-full max-w-md px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Model Groups */}
        <div className="space-y-8">
          {filteredGroups.map(group => {
            const filteredModels = searchTerm
              ? group.models.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
              : group.models;

            if (filteredModels.length === 0) return null;

            return (
              <div key={group.id} className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                {/* Group Header */}
                <div className="px-6 py-4 bg-white/[0.02] border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{group.emoji}</span>
                    <div>
                      <h2 className="text-lg font-bold">{group.name}</h2>
                      <p className="text-sm text-zinc-400">{group.description}</p>
                    </div>
                    <span className="ml-auto px-3 py-1 text-xs rounded-full bg-white/5 text-zinc-400">
                      {filteredModels.length} 个模型
                    </span>
                  </div>
                </div>

                {/* Models Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left px-6 py-3 text-sm font-medium text-zinc-400">模型名称</th>
                        {group.pricingType === 'token' ? (
                          <>
                            <th className="text-right px-6 py-3 text-sm font-medium text-zinc-400">📥 输入 ($/M)</th>
                            <th className="text-right px-6 py-3 text-sm font-medium text-zinc-400">📤 输出 ($/M)</th>
                          </>
                        ) : (
                          <th className="text-right px-6 py-3 text-sm font-medium text-zinc-400">💰 价格 ($/次)</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.map((model, i) => (
                        <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-3 text-sm font-mono text-zinc-300">{model.name}</td>
                          {group.pricingType === 'token' ? (
                            <>
                              <td className="px-6 py-3 text-sm text-right text-zinc-300">
                                {model.inputPrice === 0 ? (
                                  <span className="text-emerald-400">免费</span>
                                ) : (
                                  formatPrice(model.inputPrice)
                                )}
                              </td>
                              <td className="px-6 py-3 text-sm text-right text-zinc-300">
                                {model.outputPrice === 0 ? (
                                  <span className="text-emerald-400">免费</span>
                                ) : (
                                  formatPrice(model.outputPrice)
                                )}
                              </td>
                            </>
                          ) : (
                            <td className="px-6 py-3 text-sm text-right text-zinc-300">
                              {formatPrice(model.pricePerRequest)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-8 p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
          <h3 className="text-sm font-medium mb-3">说明</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-zinc-400">
            <div>
              <p><strong>$/M tokens</strong> = 每百万token的价格</p>
              <p><strong>$/次</strong> = 每次请求的固定价格</p>
            </div>
            <div>
              <p><strong>免费</strong> = 不收取任何费用</p>
              <p><strong>按次计费</strong> = 适用于图像生成、深度搜索等特殊功能</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
