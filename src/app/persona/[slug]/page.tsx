"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface PersonaDetail {
  name: string;
  slug: string;
  persona_md: string;
  memories_md: string;
  ai_profile: string;
  emotion_state: any;
}

export default function PersonaDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'persona' | 'memories' | 'emotion'>('profile');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPersona();
  }, [slug]);

  const loadPersona = async () => {
    try {
      // 加载Persona数据
      const res = await fetch(`/api/chat?slug=${slug}&action=detail`);
      const data = await res.json();
      
      if (data.success) {
        setPersona(data.persona);
      }
    } catch (error) {
      console.error('Failed to load persona:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-white">加载中...</div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-white">未找到Persona</div>
      </div>
    );
  }

  // 解析persona.md的各个层级
  const parsePersonaLayers = (md: string) => {
    const layers: { [key: string]: string } = {};
    const sections = md.split(/## Layer \d+[：:]/);
    
    if (sections.length > 1) {
      layers['Layer 0'] = sections[1] || '';
      layers['Layer 1'] = sections[2] || '';
      layers['Layer 2'] = sections[3] || '';
      layers['Layer 3'] = sections[4] || '';
      layers['Layer 4'] = sections[5] || '';
      layers['Layer 5'] = sections[6] || '';
    }
    
    return layers;
  };

  const layers = parsePersonaLayers(persona.persona_md);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => window.history.back()}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              ← 返回
            </button>
            <h1 className="text-xl font-bold">{persona.name}</h1>
          </div>
          <div className="text-sm text-zinc-400">Persona详情</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6">
        <div className="max-w-6xl mx-auto flex gap-8">
          {[
            { id: 'profile', label: 'AI人物档案', icon: '🎭' },
            { id: 'persona', label: '性格结构', icon: '🧠' },
            { id: 'memories', label: '共同记忆', icon: '💭' },
            { id: 'emotion', label: '情感状态', icon: '❤️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-2 border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? 'border-indigo-500 text-white' 
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* AI人物档案 */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">🎭</span> AI生成的完整人物档案
              </h2>
              <div className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
                  {persona.ai_profile || '暂无AI生成的档案'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* 性格结构 */}
        {activeTab === 'persona' && (
          <div className="space-y-6">
            {/* Layer 0: 核心行为规则 */}
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-red-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">⚡</span> Layer 0: 核心行为规则（最高优先级）
              </h2>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {layers['Layer 0'] || '暂无'}
              </div>
            </div>

            {/* Layer 1: 身份 */}
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-blue-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">👤</span> Layer 1: 身份
              </h2>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {layers['Layer 1'] || '暂无'}
              </div>
            </div>

            {/* Layer 2: 表达风格 */}
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-purple-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">💬</span> Layer 2: 表达风格
              </h2>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {layers['Layer 2'] || '暂无'}
              </div>
            </div>

            {/* Layer 3: 情感逻辑 */}
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-pink-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">❤️</span> Layer 3: 情感逻辑
              </h2>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {layers['Layer 3'] || '暂无'}
              </div>
            </div>

            {/* Layer 4: 关系行为 */}
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-green-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">👥</span> Layer 4: 关系行为
              </h2>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {layers['Layer 4'] || '暂无'}
              </div>
            </div>

            {/* Layer 5: 边界与雷区 */}
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-yellow-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">⚠️</span> Layer 5: 边界与雷区
              </h2>
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {layers['Layer 5'] || '暂无'}
              </div>
            </div>
          </div>
        )}

        {/* 共同记忆 */}
        {activeTab === 'memories' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">💭</span> 共同记忆
              </h2>
              <div className="prose prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
                  {persona.memories_md || '暂无共同记忆'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* 情感状态 */}
        {activeTab === 'emotion' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-pink-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">❤️</span> 当前情感状态
              </h2>
              
              {persona.emotion_state ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="text-sm text-zinc-400">主要情绪</div>
                    <div className="text-2xl font-bold text-pink-400">
                      {persona.emotion_state.primaryEmotion || '平静'}
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="text-sm text-zinc-400">情绪强度</div>
                    <div className="text-2xl font-bold text-purple-400">
                      {Math.round((persona.emotion_state.intensity || 0.5) * 100)}%
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="text-sm text-zinc-400">愉悦度</div>
                    <div className="text-2xl font-bold text-blue-400">
                      {persona.emotion_state.pleasure > 0 ? '+' : ''}{Math.round((persona.emotion_state.pleasure || 0) * 100)}%
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="text-sm text-zinc-400">唤醒度</div>
                    <div className="text-2xl font-bold text-orange-400">
                      {Math.round((persona.emotion_state.arousal || 0.3) * 100)}%
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-zinc-400">暂无情感状态数据</div>
              )}
            </div>

            {/* 情感词汇库 */}
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-purple-500/30">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">🎨</span> 情感词汇库
              </h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">积极情绪</h3>
                  <div className="flex flex-wrap gap-2">
                    {['开心', '兴奋', '满足', '安心', '感动', '期待', '撒娇', '甜蜜'].map(emotion => (
                      <span key={emotion} className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                        {emotion}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">消极情绪</h3>
                  <div className="flex flex-wrap gap-2">
                    {['生气', '难过', '失望', '焦虑', '委屈', '吃醋', '烦躁', '冷漠'].map(emotion => (
                      <span key={emotion} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                        {emotion}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2">中性情绪</h3>
                  <div className="flex flex-wrap gap-2">
                    {['平静', '无聊', '好奇', '思考', '发呆'].map(emotion => (
                      <span key={emotion} className="px-3 py-1 bg-zinc-500/20 text-zinc-400 rounded-full text-sm">
                        {emotion}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
