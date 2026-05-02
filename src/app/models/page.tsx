"use client";

import { useState } from 'react';

interface Model {
  name: string;
  inputPrice: number;
  outputPrice: number;
  tags?: string[];
}

interface ModelGroup {
  id: string;
  name: string;
  emoji: string;
  description: string;
  models: Model[];
}

const modelGroups: ModelGroup[] = [
  {
    id: 'openrouter-free',
    name: 'OpenRouter Free',
    emoji: '🆓',
    description: '完全免费模型',
    models: [
      { name: 'deepseek-chat-v3-0324:free', inputPrice: 0, outputPrice: 0, tags: ['deepseek'] },
      { name: 'deepseek-chat-v3.1:free', inputPrice: 0, outputPrice: 0, tags: ['deepseek'] },
      { name: 'deepseek-r1-0528:free', inputPrice: 0, outputPrice: 0, tags: ['deepseek', 'reasoning'] },
      { name: 'google/gemini-2.5-pro-exp-03-25', inputPrice: 0, outputPrice: 0, tags: ['google', 'gemini'] },
      { name: 'google/gemma-3-27b-it:free', inputPrice: 0, outputPrice: 0, tags: ['google'] },
      { name: 'mistralai/mistral-7b-instruct:free', inputPrice: 0, outputPrice: 0, tags: ['mistral'] },
      { name: 'moonshotai/kimi-k2:free', inputPrice: 0, outputPrice: 0, tags: ['moonshot', 'kimi'] },
      { name: 'qwen/qwen3-235b-a22b:free', inputPrice: 0, outputPrice: 0, tags: ['qwen', 'alibaba'] },
      { name: 'qwen/qwq-32b:free', inputPrice: 0, outputPrice: 0, tags: ['qwen', 'reasoning'] },
    ]
  },
  {
    id: 'claude-official',
    name: 'Claude 官方',
    emoji: '🎩',
    description: 'Anthropic 官方渠道',
    models: [
      { name: 'claude-3-5-sonnet', inputPrice: 7.5, outputPrice: 37.5, tags: ['claude', 'sonnet'] },
      { name: 'claude-3-7-sonnet', inputPrice: 7.5, outputPrice: 37.5, tags: ['claude', 'sonnet'] },
      { name: 'claude-haiku-4-5', inputPrice: 2.5, outputPrice: 12.5, tags: ['claude', 'haiku', 'fast'] },
      { name: 'claude-opus-4', inputPrice: 37.5, outputPrice: 187.5, tags: ['claude', 'opus', 'powerful'] },
      { name: 'claude-opus-4-5', inputPrice: 12.5, outputPrice: 62.5, tags: ['claude', 'opus'] },
      { name: 'claude-sonnet-4', inputPrice: 7.5, outputPrice: 37.5, tags: ['claude', 'sonnet'] },
      { name: 'claude-sonnet-4-5', inputPrice: 7.5, outputPrice: 37.5, tags: ['claude', 'sonnet'] },
    ]
  },
  {
    id: 'openai-official',
    name: 'OpenAI 官方',
    emoji: '🟢',
    description: 'OpenAI 官方渠道',
    models: [
      { name: 'gpt-4.1', inputPrice: 9, outputPrice: 36, tags: ['openai', 'gpt-4'] },
      { name: 'gpt-4.1-mini', inputPrice: 1.8, outputPrice: 7.2, tags: ['openai', 'gpt-4', 'mini', 'fast'] },
      { name: 'gpt-4.1-nano', inputPrice: 0.45, outputPrice: 1.8, tags: ['openai', 'gpt-4', 'nano', 'fast'] },
      { name: 'gpt-5', inputPrice: 10, outputPrice: 80, tags: ['openai', 'gpt-5'] },
      { name: 'gpt-5-mini', inputPrice: 1.125, outputPrice: 9, tags: ['openai', 'gpt-5', 'mini', 'fast'] },
      { name: 'o3-mini', inputPrice: 4.95, outputPrice: 19.8, tags: ['openai', 'reasoning'] },
    ]
  },
  {
    id: 'codex',
    name: 'Codex 代码模型',
    emoji: '💻',
    description: '代码生成能力特化的模型',
    models: [
      { name: 'gpt-5', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5'] },
      { name: 'gpt-5-codex', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5'] },
      { name: 'gpt-5-codex-high', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5'] },
      { name: 'gpt-5-high', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5'] },
      { name: 'gpt-5.1', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5.1'] },
      { name: 'gpt-5.1-codex', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5.1'] },
      { name: 'gpt-5.1-codex-high', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5.1'] },
      { name: 'gpt-5.1-codex-max', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5.1'] },
      { name: 'gpt-5.1-codex-max-high', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5.1'] },
      { name: 'gpt-5.1-codex-max-xhigh', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5.1'] },
      { name: 'gpt-5.1-codex-mini', inputPrice: 0.025, outputPrice: 0.2, tags: ['codex', 'gpt-5.1', 'mini'] },
      { name: 'gpt-5.1-codex-mini-high', inputPrice: 0.025, outputPrice: 0.2, tags: ['codex', 'gpt-5.1', 'mini'] },
      { name: 'gpt-5.1-high', inputPrice: 0.125, outputPrice: 1, tags: ['codex', 'gpt-5.1'] },
      { name: 'gpt-5.2', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.2'] },
      { name: 'gpt-5.2-codex', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.2'] },
      { name: 'gpt-5.2-codex-high', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.2'] },
      { name: 'gpt-5.2-codex-xhigh', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.2'] },
      { name: 'gpt-5.2-high', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.2'] },
      { name: 'gpt-5.2-xhigh', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.2'] },
      { name: 'gpt-5.3-codex', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.3'] },
      { name: 'gpt-5.3-codex-high', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.3'] },
      { name: 'gpt-5.3-codex-xhigh', inputPrice: 0.175, outputPrice: 1.4, tags: ['codex', 'gpt-5.3'] },
      { name: 'gpt-5.4', inputPrice: 0.25, outputPrice: 2, tags: ['codex', 'gpt-5.4'] },
      { name: 'gpt-5.4-codex', inputPrice: 0.25, outputPrice: 2, tags: ['codex', 'gpt-5.4'] },
      { name: 'gpt-5.4-codex-high', inputPrice: 0.25, outputPrice: 2, tags: ['codex', 'gpt-5.4'] },
      { name: 'gpt-5.4-codex-xhigh', inputPrice: 0.25, outputPrice: 2, tags: ['codex', 'gpt-5.4'] },
      { name: 'gpt-5.4-high', inputPrice: 0.25, outputPrice: 2, tags: ['codex', 'gpt-5.4'] },
      { name: 'gpt-5.4-mini', inputPrice: 0.075, outputPrice: 0.6, tags: ['codex', 'gpt-5.4', 'mini'] },
      { name: 'gpt-5.4-mini-high', inputPrice: 0.075, outputPrice: 0.6, tags: ['codex', 'gpt-5.4', 'mini'] },
      { name: 'gpt-5.4-mini-xhigh', inputPrice: 0.075, outputPrice: 0.6, tags: ['codex', 'gpt-5.4', 'mini'] },
      { name: 'gpt-5.4-thinking', inputPrice: 0.25, outputPrice: 2, tags: ['codex', 'gpt-5.4', 'reasoning'] },
      { name: 'gpt-5.4-xhigh', inputPrice: 0.25, outputPrice: 2, tags: ['codex', 'gpt-5.4'] },
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    emoji: '🌌',
    description: 'Google Gemini 模型',
    models: [
      { name: 'gemini-2.5-flash', inputPrice: 0.24, outputPrice: 2.016, tags: ['google', 'gemini', 'flash', 'fast'] },
      { name: 'gemini-2.5-pro', inputPrice: 2, outputPrice: 16, tags: ['google', 'gemini', 'pro'] },
      { name: 'gemini-3-flash-preview', inputPrice: 0.4, outputPrice: 2.4, tags: ['google', 'gemini', 'flash', 'fast'] },
      { name: 'gemini-3-pro-preview', inputPrice: 1.6, outputPrice: 9.6, tags: ['google', 'gemini', 'pro'] },
      { name: 'gemini-3.1-pro-preview', inputPrice: 1.6, outputPrice: 9.6, tags: ['google', 'gemini', 'pro'] },
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    emoji: '🐋',
    description: 'DeepSeek 模型',
    models: [
      { name: 'deepseek-chat', inputPrice: 0.8, outputPrice: 3.2, tags: ['deepseek', 'chat'] },
      { name: 'deepseek-r1', inputPrice: 1.6, outputPrice: 6.4, tags: ['deepseek', 'reasoning'] },
      { name: 'deepseek-v3', inputPrice: 0.8, outputPrice: 3.2, tags: ['deepseek'] },
      { name: 'deepseek-v3.1', inputPrice: 1.6, outputPrice: 6.4, tags: ['deepseek'] },
      { name: 'deepseek-v3.2', inputPrice: 0.8, outputPrice: 1.2, tags: ['deepseek'] },
    ]
  },
];

export default function ModelsPage() {
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 获取所有标签
  const allTags = Array.from(new Set(
    modelGroups.flatMap(g => g.models.flatMap(m => m.tags || []))
  )).sort();

  // 过滤模型
  const filteredGroups = selectedGroup === 'all' 
    ? modelGroups 
    : modelGroups.filter(g => g.id === selectedGroup);

  const formatPrice = (price: number) => {
    if (price === 0) return '免费';
    if (price < 0.01) return `$${price.toFixed(4)}`;
    if (price < 1) return `$${price.toFixed(3)}`;
    return `$${price}`;
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-6xl mx-auto">
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

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-sm text-[#999999] py-2">标签：</span>
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              selectedTag === null
                ? 'bg-[#576B95] text-white'
                : 'bg-[#F0F0F0] text-[#666666] hover:bg-[#E5E5E5]'
            }`}
          >
            全部
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                selectedTag === tag
                  ? 'bg-[#576B95] text-white'
                  : 'bg-[#F0F0F0] text-[#666666] hover:bg-[#E5E5E5]'
              }`}
            >
              {tag}
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
            let filteredModels = group.models;
            
            // 搜索过滤
            if (searchTerm) {
              filteredModels = filteredModels.filter(m => 
                m.name.toLowerCase().includes(searchTerm.toLowerCase())
              );
            }
            
            // 标签过滤
            if (selectedTag) {
              filteredModels = filteredModels.filter(m => 
                m.tags?.includes(selectedTag)
              );
            }

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
                        <th className="text-right px-6 py-3 text-sm font-medium text-[#666666]">📥 输入</th>
                        <th className="text-right px-6 py-3 text-sm font-medium text-[#666666]">📤 输出</th>
                        <th className="text-left px-6 py-3 text-sm font-medium text-[#666666]">标签</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.map((model, i) => (
                        <tr key={i} className="border-b border-[#F0F0F0] hover:bg-[#FAFAFA] transition-colors">
                          <td className="px-6 py-3">
                            <span className="text-sm font-mono text-[#353535]">{model.name}</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className={`text-sm font-medium ${model.inputPrice === 0 ? 'text-[#07C160]' : 'text-[#353535]'}`}>
                              {formatPrice(model.inputPrice)}
                            </span>
                            <span className="text-xs text-[#CCCCCC] ml-1">/M</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className={`text-sm font-medium ${model.outputPrice === 0 ? 'text-[#07C160]' : 'text-[#353535]'}`}>
                              {formatPrice(model.outputPrice)}
                            </span>
                            <span className="text-xs text-[#CCCCCC] ml-1">/M</span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex flex-wrap gap-1">
                              {model.tags?.map(tag => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 text-[10px] rounded-full bg-[#F0F0F0] text-[#999999]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
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

        {/* Summary */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded-xl border border-[#E5E5E5]">
            <div className="text-sm text-[#999999] mb-1">总模型数</div>
            <div className="text-2xl font-bold text-[#353535]">
              {modelGroups.reduce((sum, g) => sum + g.models.length, 0)}
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-[#E5E5E5]">
            <div className="text-sm text-[#999999] mb-1">免费模型</div>
            <div className="text-2xl font-bold text-[#07C160]">
              {modelGroups.flatMap(g => g.models).filter(m => m.inputPrice === 0 && m.outputPrice === 0).length}
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-[#E5E5E5]">
            <div className="text-sm text-[#999999] mb-1">渠道分组</div>
            <div className="text-2xl font-bold text-[#353535]">{modelGroups.length}</div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 p-6 bg-white rounded-2xl border border-[#E5E5E5]">
          <h3 className="text-sm font-medium text-[#353535] mb-3">说明</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[#999999]">
            <div>
              <p><strong>$/M tokens</strong> = 每百万token的价格</p>
              <p><strong>免费</strong> = 不收取任何费用</p>
            </div>
            <div>
              <p><strong>codex</strong> = 代码生成特化模型</p>
              <p><strong>reasoning</strong> = 推理能力增强模型</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
