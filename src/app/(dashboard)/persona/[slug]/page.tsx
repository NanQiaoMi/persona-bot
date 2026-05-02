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
  const [activeTab, setActiveTab] = useState<'persona' | 'memories' | 'emotion'>('persona');

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
    if (!confirm('确定要删除这个Persona吗？此操作不可撤销。')) {
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
      <div className="text-center py-12">
        <div className="text-white">加载中...</div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="text-center py-12">
        <div className="text-white">Persona不存在</div>
        <Link href="/" className="text-indigo-400 mt-4 inline-block">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white">
            ← 返回
          </Link>
          <h1 className="text-2xl font-bold">{persona.name}</h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/chat/${slug}`}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
          >
            开始对话
          </Link>
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm"
          >
            删除
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {persona.profile?.mbti && (
            <div>
              <div className="text-xs text-zinc-400">MBTI</div>
              <div className="text-lg font-bold text-indigo-400">{persona.profile.mbti}</div>
            </div>
          )}
          {persona.profile?.zodiac && (
            <div>
              <div className="text-xs text-zinc-400">星座</div>
              <div className="text-lg font-bold text-purple-400">{persona.profile.zodiac}</div>
            </div>
          )}
          {persona.profile?.attachment && (
            <div>
              <div className="text-xs text-zinc-400">依恋类型</div>
              <div className="text-lg font-bold text-pink-400">{persona.profile.attachment}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-zinc-400">更新时间</div>
            <div className="text-sm text-zinc-300">
              {new Date(persona.updatedAt).toLocaleDateString('zh-CN')}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 border-b border-zinc-800">
        {[
          { id: 'persona', label: '性格设定' },
          { id: 'memories', label: '共同记忆' },
          { id: 'emotion', label: '情感状态' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'persona' | 'memories' | 'emotion')}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
        {activeTab === 'persona' && (
          <pre className="whitespace-pre-wrap text-sm text-zinc-300">
            {persona.personaMd || '暂无性格设定'}
          </pre>
        )}

        {activeTab === 'memories' && (
          <pre className="whitespace-pre-wrap text-sm text-zinc-300">
            {persona.memoriesMd || '暂无共同记忆'}
          </pre>
        )}

        {activeTab === 'emotion' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <div className="text-xs text-zinc-400">当前情绪</div>
                <div className="text-xl font-bold text-pink-400">
                  {persona.emotionState?.primaryEmotion || '平静'}
                </div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <div className="text-xs text-zinc-400">情绪强度</div>
                <div className="text-xl font-bold text-purple-400">
                  {Math.round((persona.emotionState?.intensity || 0.5) * 100)}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
