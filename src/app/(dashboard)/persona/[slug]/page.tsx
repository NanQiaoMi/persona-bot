"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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

  useEffect(() => {
    loadPersona();
  }, [slug]);

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
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#E5E5E5] border-t-[#07C160] rounded-full animate-spin" />
          <p className="text-[#999999] text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <p className="text-[#999999] mb-4">角色不存在</p>
        <Link href="/" className="text-[#07C160] text-sm">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EDEDED]">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E5E5] px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-[#576B95]">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-base font-medium text-[#353535]">{persona.name}</h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/chat/${slug}`}
            className="text-sm text-[#07C160]"
          >
            对话
          </Link>
          <button
            onClick={handleDelete}
            className="text-sm text-[#FA5151]"
          >
            删除
          </button>
        </div>
      </div>

      {/* Profile Summary */}
      <div className="bg-white mt-2 p-4">
        <div className="grid grid-cols-4 gap-3">
          {persona.profile?.mbti && (
            <div className="text-center">
              <p className="text-[10px] text-[#999999] mb-1">MBTI</p>
              <p className="text-sm font-semibold text-[#07C160]">{persona.profile.mbti}</p>
            </div>
          )}
          {persona.profile?.zodiac && (
            <div className="text-center">
              <p className="text-[10px] text-[#999999] mb-1">星座</p>
              <p className="text-sm font-semibold text-[#576B95]">{persona.profile.zodiac}</p>
            </div>
          )}
          {persona.profile?.attachment && (
            <div className="text-center">
              <p className="text-[10px] text-[#999999] mb-1">依恋类型</p>
              <p className="text-sm font-semibold text-[#F0A020]">{persona.profile.attachment}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-[10px] text-[#999999] mb-1">更新</p>
            <p className="text-xs text-[#666666]">
              {new Date(persona.updatedAt).toLocaleDateString('zh-CN')}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white mt-2 flex border-b border-[#E5E5E5]">
        {[
          { id: 'aiProfile', label: '人物画像' },
          { id: 'persona', label: '性格设定' },
          { id: 'memories', label: '共同记忆' },
          { id: 'emotion', label: '情感状态' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'aiProfile' | 'persona' | 'memories' | 'emotion')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[#07C160] border-b-2 border-[#07C160]'
                : 'text-[#999999]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white mt-2 p-4 min-h-[300px]">
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
              <div className="bg-[#F7F7F7] rounded-lg p-3">
                <p className="text-[10px] text-[#999999] mb-1">当前情绪</p>
                <p className="text-lg font-semibold text-[#07C160]">
                  {persona.emotionState?.primaryEmotion || '平静'}
                </p>
              </div>
              <div className="bg-[#F7F7F7] rounded-lg p-3">
                <p className="text-[10px] text-[#999999] mb-1">情绪强度</p>
                <p className="text-lg font-semibold text-[#576B95]">
                  {Math.round((persona.emotionState?.intensity || 0.5) * 100)}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
