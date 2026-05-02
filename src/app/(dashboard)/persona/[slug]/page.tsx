"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ImportModal from '@/components/ImportModal';
import SkillPanel from '@/components/SkillPanel';

interface PersonaDetail {
  id: string;
  name: string;
  slug: string;
  profile: {
    duration?: string;
    howMet?: string;
    breakupTime?: string;
    occupation?: string;
    mbti?: string;
    zodiac?: string;
    attachment?: string;
    personalityTags?: string[];
    impression?: string;
  };
  personaMd: string;
  aiProfileMd: string;
  memoriesMd: string;
  emotionState: {
    primaryEmotion: string;
    intensity: number;
    valence: number;
    arousal: number;
    dominance: number;
    lastUpdated: string;
  };
  corrections: Array<{
    timestamp: string;
    userInput: string;
    botResponse: string;
    correction: string;
    category: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export default function PersonaDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'aiProfile' | 'persona' | 'memories' | 'emotion'>('aiProfile');
  const [showImport, setShowImport] = useState(false);
  const [showSkills, setShowSkills] = useState(false);

  useEffect(() => {
    const loadPersona = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/personas/${slug}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
    
    loadPersona();
  }, [slug]);

  const handleDelete = async () => {
    if (!confirm('确定要删除这个角色吗？此操作不可撤销。')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/personas/${slug}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Failed to delete persona:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-[#E5E5E5]" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[#07C160] animate-spin" />
          </div>
          <p className="text-[#999999] text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-[#F7F7F7] flex items-center justify-center mb-4">
          <span className="text-2xl">😶</span>
        </div>
        <p className="text-[#999999] mb-4">角色不存在</p>
        <Link href="/" className="text-sm text-[#07C160] hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'aiProfile', label: '人物画像', icon: '🤖' },
    { id: 'persona', label: '性格设定', icon: '🎭' },
    { id: 'memories', label: '共同记忆', icon: '💭' },
    { id: 'emotion', label: '情感状态', icon: '💗' },
  ];

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="glass sticky top-14 z-40 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="w-9 h-9 rounded-lg bg-white/60 backdrop-blur-sm flex items-center justify-center text-[#576B95] hover:text-[#07C160] hover:bg-white/80 transition-all border border-white/40">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-base font-semibold text-[#353535]">{persona.name}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="w-8 h-8 rounded-lg bg-[#576B95]/10 flex items-center justify-center text-[#576B95] hover:bg-[#576B95]/20 transition-colors"
            title="导入聊天记录"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </button>
          <button
            onClick={() => setShowSkills(true)}
            className="w-8 h-8 rounded-lg bg-[#F0A020]/10 flex items-center justify-center text-[#F0A020] hover:bg-[#F0A020]/20 transition-colors"
            title="技能管理"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </button>
          <Link
            href={`/chat/${slug}`}
            className="px-3 py-1.5 rounded-lg bg-[#07C160]/10 text-[#07C160] text-xs font-medium hover:bg-[#07C160]/20 transition-colors"
          >
            对话
          </Link>
        </div>
      </div>

      {/* Profile Summary */}
      <div className="px-4 pt-4 pb-2">
        <div className="glass-card rounded-xl p-4">
          <div className="grid grid-cols-4 gap-3">
            {persona.profile?.mbti && (
              <div className="text-center">
                <p className="text-[10px] text-[#999999] mb-1.5 font-medium">MBTI</p>
                <p className="text-sm font-semibold text-[#07C160]">{persona.profile.mbti}</p>
              </div>
            )}
            {persona.profile?.zodiac && (
              <div className="text-center">
                <p className="text-[10px] text-[#999999] mb-1.5 font-medium">星座</p>
                <p className="text-sm font-semibold text-[#576B95]">{persona.profile.zodiac}</p>
              </div>
            )}
            {persona.profile?.attachment && (
              <div className="text-center">
                <p className="text-[10px] text-[#999999] mb-1.5 font-medium">依恋类型</p>
                <p className="text-sm font-semibold text-[#F0A020]">{persona.profile.attachment}</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-[10px] text-[#999999] mb-1.5 font-medium">更新</p>
              <p className="text-xs text-[#666666]">
                {new Date(persona.updatedAt).toLocaleDateString('zh-CN')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3 pb-2">
        <div className="glass-card rounded-xl p-1.5 flex">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'aiProfile' | 'persona' | 'memories' | 'emotion')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white/80 text-[#07C160] shadow-sm'
                    : 'text-[#999999] hover:text-[#666666]'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 pt-2">
        <div className="glass-card rounded-xl p-5 min-h-[300px] animate-fade-in">
          {activeTab === 'aiProfile' && (
            <div className="text-sm text-[#666666] leading-relaxed whitespace-pre-wrap">
              {persona.aiProfileMd || '暂无人物画像'}
            </div>
          )}

          {activeTab === 'persona' && (
            <div className="text-sm text-[#666666] leading-relaxed whitespace-pre-wrap">
              {persona.personaMd || '暂无性格设定'}
            </div>
          )}

          {activeTab === 'memories' && (
            <div className="text-sm text-[#666666] leading-relaxed whitespace-pre-wrap">
              {persona.memoriesMd || '暂无共同记忆'}
            </div>
          )}

          {activeTab === 'emotion' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/60 rounded-xl p-4 border border-white/40">
                  <p className="text-[10px] text-[#999999] mb-2 font-medium">当前情绪</p>
                  <p className="text-xl font-semibold text-[#07C160]">
                    {persona.emotionState?.primaryEmotion || '平静'}
                  </p>
                </div>
                <div className="bg-white/60 rounded-xl p-4 border border-white/40">
                  <p className="text-[10px] text-[#999999] mb-2 font-medium">情绪强度</p>
                  <div className="flex items-end gap-1">
                    <p className="text-xl font-semibold text-[#576B95]">
                      {Math.round((persona.emotionState?.intensity || 0.5) * 100)}
                    </p>
                    <span className="text-xs text-[#999999] mb-0.5">%</span>
                  </div>
                </div>
              </div>
              
              {/* Emotion Bar */}
              <div className="bg-white/60 rounded-xl p-4 border border-white/40">
                <p className="text-[10px] text-[#999999] mb-3 font-medium">情绪倾向</p>
                <div className="h-2 bg-[#F7F7F7] rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-[#FA5151] via-[#F0A020] to-[#07C160] transition-all duration-1000"
                    style={{ width: `${Math.round(((persona.emotionState?.valence || 0) + 1) * 50)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] text-[#FA5151]">消极</span>
                  <span className="text-[10px] text-[#07C160]">积极</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => window.location.reload()}
      />
      <SkillPanel
        isOpen={showSkills}
        onClose={() => setShowSkills(false)}
      />
    </div>
  );
}
