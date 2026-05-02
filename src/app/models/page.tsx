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
    description: '完全免费模型',
    pricingType: 'token',
    models: [
      { name: 'deepseek-chat-v3-0324:free', inputPrice: 0, outputPrice: 0 },
      { name: 'deepseek-chat-v3.1:free', inputPrice: 0, outputPrice: 0 },
      { name: 'deepseek-r1-0528:free', inputPrice: 0, outputPrice: 0 },
      { name: 'google/gemini-2.5-pro-exp-03-25', inputPrice: 0, outputPrice: 0 },
      { name: 'google/gemma-3-27b-it:free', inputPrice: 0, outputPrice: 0 },
      { name: 'mistralai/mistral-7b-instruct:free', inputPrice: 0, outputPrice: 0 },
      { name: 'moonshotai/kimi-k2:free', inputPrice: 0, outputPrice: 0 },
      { name: 'qwen/qwen3-235b-a22b:free', inputPrice: 0, outputPrice: 0 },
      { name: 'qwen/qwq-32b:free', inputPrice: 0, outputPrice: 0 },
    ]
  },
  {
    id: 'claude-official',
    name: 'Claude 官方',
    emoji: '🎩',
    description: 'Anthropic 官方渠道',
    pricingType: 'token',
    models: [
      { name: 'claude-3-5-sonnet', inputPrice: 7.5, outputPrice: 37.5 },
      { name: 'claude-3-7-sonnet', inputPrice: 7.5, outputPrice: 37.5 },
      { name: 'claude-haiku-4-5', inputPrice: 2.5, outputPrice: 12.5 },
      { name: 'claude-opus-4', inputPrice: 37.5, outputPrice: 187.5 },
      { name: 'claude-opus-4-5', inputPrice: 12.5, outputPrice: 62.5 },
      { name: 'claude-sonnet-4', inputPrice: 7.5, outputPrice: 37.5 },
    ]
  },
  {
    id: 'openai-official',
    name: 'OpenAI 官方',
    emoji: '🟢',
    description: 'OpenAI 官方渠道',
    pricingType: 'token',
    models: [
      { name: 'gpt-4.1', inputPrice: 9, outputPrice: 36 },
      { name: 'gpt-4.1-mini', inputPrice: 1.8, outputPrice: 7.2 },
      { name: 'gpt-4.1-nano', inputPrice: 0.45, outputPrice: 1.8 },
      { name: 'gpt-5', inputPrice: 10, outputPrice: 80 },
      { name: 'gpt-5-mini', inputPrice: 1.125, outputPrice: 9 },
      { name: 'o3-mini', inputPrice: 4.95, outputPrice: 19.8 },
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    emoji: '🌌',
    description: 'Google Gemini 模型',
    pricingType: 'token',
    models: [
      { name: 'gemini-2.5-flash', inputPrice: 0.24, outputPrice: 2.016 },
      { name: 'gemini-2.5-pro', inputPrice: 2, outputPrice: 16 },
      { name: 'gemini-3-flash-preview', inputPrice: 0.4, outputPrice: 2.4 },
      { name: 'gemini-3-pro-preview', inputPrice: 1.6, outputPrice: 9.6 },
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    emoji: '🐋',
    description: 'DeepSeek 模型',
    pricingType: 'token',
    models: [
      { name: 'deepseek-chat', inputPrice: 0.8, outputPrice: 3.2 },
      { name: 'deepseek-r1', inputPrice: 1.6, outputPrice: 6.4 },
      { name: 'deepseek-v3', inputPrice: 0.8, outputPrice: 3.2 },
      { name: 'deepseek-v3.1', inputPrice: 1.6, outputPrice: 6.4 },
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
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#353535] mb-2">API 模型价格表</h1>
          <p className="text-[#999999]">各渠道模型价格对比（单位：$/M tokens）</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setSelectedGroup('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedGroup === 'all'
                ? 'bg-[#07C160] text-white'
                : 'bg-white text-[#666666] border border-[#E5E5E5] hover:border-[#07C160]'
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
                  ? 'bg-[#07C160] text-white'
                  : 'bg-white text-[#666666] border border-[#E5E5E5] hover:border-[#07C160]'
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
            className="w-full max-w-md px-4 py-3 rounded-xl bg-white border border-[#E5E5E5] text-[#353535] placeholder-[#CCCCCC] focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all"
          />
        </div>

        {/* Model Groups */}
        <div className="space-y-6">
          {filteredGroups.map(group => {
            const filteredModels = searchTerm
              ? group.models.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
              : group.models;

            if (filteredModels.length === 0) return null;

            return (
              <div key={group.id} className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
                {/* Group Header */}
                <div className="px-6 py-4 bg-[#F7F7F7] border-b border-[#E5E5E5]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{group.emoji}</span>
                    <div>
                      <h2 className="text-lg font-bold text-[#353535]">{group.name}</h2>
                      <p className="text-sm text-[#999999]">{group.description}</p>
                    </div>
                    <span className="ml-auto px-3 py-1 text-xs rounded-full bg-[#E5E5E5] text-[#666666]">
                      {filteredModels.length} 个模型
                    </span>
                  </div>
                </div>

                {/* Models Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E5E5E5]">
                        <th className="text-left px-6 py-3 text-sm font-medium text-[#666666]">模型名称</th>
                        <th className="text-right px-6 py-3 text-sm font-medium text-[#666666]">📥 输入 ($/M)</th>
                        <th className="text-right px-6 py-3 text-sm font-medium text-[#666666]">📤 输出 ($/M)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.map((model, i) => (
                        <tr key={i} className="border-b border-[#F0F0F0] hover:bg-[#FAFAFA] transition-colors">
                          <td className="px-6 py-3 text-sm font-mono text-[#353535]">{model.name}</td>
                          <td className="px-6 py-3 text-sm text-right text-[#353535]">
                            {model.inputPrice === 0 ? (
                              <span className="text-[#07C160] font-medium">免费</span>
                            ) : (
                              formatPrice(model.inputPrice)
                            )}
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-[#353535]">
                            {model.outputPrice === 0 ? (
                              <span className="text-[#07C160] font-medium">免费</span>
                            ) : (
                              formatPrice(model.outputPrice)
                            )}
                          </td>
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
        <div className="mt-8 p-6 bg-white rounded-2xl border border-[#E5E5E5]">
          <h3 className="text-sm font-medium text-[#353535] mb-3">说明</h3>
          <div className="text-sm text-[#999999]">
            <p><strong>$/M tokens</strong> = 每百万token的价格</p>
            <p><strong>免费</strong> = 不收取任何费用</p>
          </div>
        </div>
      </div>
    </div>
  );
}
