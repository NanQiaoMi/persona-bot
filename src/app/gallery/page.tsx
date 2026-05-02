"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Persona {
  slug: string;
  name: string;
  version?: string;
  profile?: any;
  created_at?: string;
}

export default function GalleryPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      const res = await fetch('/api/persona/list');
      const data = await res.json();
      if (data.success) {
        setPersonas(data.personas || []);
      }
    } catch (error) {
      console.error('Failed to load personas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (slug: string, name: string) => {
    if (!confirm(`确定要删除「${name}」吗？此操作不可撤销。`)) {
      return;
    }

    setDeleting(slug);
    try {
      const res = await fetch(`/api/persona/delete?slug=${encodeURIComponent(slug)}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        setPersonas(prev => prev.filter(p => p.slug !== slug));
      } else {
        alert('删除失败：' + (data.error?.message || '未知错误'));
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('删除失败，请稍后重试');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-zinc-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">已蒸馏的角色</h1>
            <p className="text-zinc-400 mt-1">管理和对话你的AI角色</p>
          </div>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            创建新角色
          </Link>
        </div>

        {/* Personas Grid */}
        {personas.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
              <span className="text-5xl">🎭</span>
            </div>
            <h2 className="text-2xl font-bold mb-3">还没有任何角色</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              创建你的第一个Persona，让AI用她的方式和你对话
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-lg hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300"
            >
              <span>✨</span>
              创建第一个 Persona
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {personas.map((persona) => (
              <div
                key={persona.slug}
                className="group relative bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-indigo-500/5"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 p-6">
                  {/* Card Header */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                      {persona.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold group-hover:text-indigo-400 transition-colors">
                        {persona.name}
                      </h3>
                      {persona.profile?.mbti && (
                        <span className="text-sm text-indigo-400">{persona.profile.mbti}</span>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {persona.profile?.tags?.personality && persona.profile.tags.personality.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {persona.profile.tags.personality.slice(0, 3).map((tag: string, i: number) => (
                        <span
                          key={i}
                          className="px-3 py-1 text-xs rounded-full bg-white/5 text-zinc-400 border border-white/5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  <p className="text-sm text-zinc-400 line-clamp-2 mb-4">
                    {persona.profile?.enhanced_profile?.substring(0, 100) || '暂无描述'}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-xs text-zinc-500">
                      {persona.created_at ? `创建于 ${new Date(persona.created_at).toLocaleDateString('zh-CN')}` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/chat/${persona.slug}`}
                        className="px-4 py-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-all"
                      >
                        进入对话 →
                      </Link>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete(persona.slug, persona.name);
                        }}
                        disabled={deleting === persona.slug}
                        className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all disabled:opacity-50"
                        title="删除"
                      >
                        {deleting === persona.slug ? (
                          <div className="w-4 h-4 border-2 border-rose-400/20 border-t-rose-400 rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
