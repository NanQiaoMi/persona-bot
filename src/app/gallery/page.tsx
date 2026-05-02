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
          <div className="w-10 h-10 border-4 border-[#07C160]/20 border-t-[#07C160] rounded-full animate-spin" />
          <p className="text-[#999999]">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#353535]">已蒸馏的角色</h1>
            <p className="text-[#999999] mt-1">管理和对话你的AI角色</p>
          </div>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white font-medium transition-all duration-200"
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
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#F7F7F7] flex items-center justify-center">
              <span className="text-4xl">🎭</span>
            </div>
            <h2 className="text-xl font-bold text-[#353535] mb-3">还没有任何角色</h2>
            <p className="text-[#999999] mb-8 max-w-md mx-auto">
              创建你的第一个Persona，让AI用她的方式和你对话
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white font-semibold transition-all duration-200"
            >
              ✨ 创建第一个 Persona
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {personas.map((persona) => (
              <div
                key={persona.slug}
                className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden hover:shadow-lg transition-all duration-300"
              >
                <div className="p-6">
                  {/* Card Header */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#07C160] to-[#06AD56] flex items-center justify-center text-white text-xl font-bold">
                      {persona.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-[#353535]">
                        {persona.name}
                      </h3>
                      {persona.profile?.mbti && (
                        <span className="text-sm text-[#576B95]">{persona.profile.mbti}</span>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {persona.profile?.tags?.personality && persona.profile.tags.personality.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {persona.profile.tags.personality.slice(0, 3).map((tag: string, i: number) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 text-xs rounded-full bg-[#F7F7F7] text-[#666666]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  <p className="text-sm text-[#999999] line-clamp-2 mb-4">
                    {persona.profile?.enhanced_profile?.substring(0, 100) || '暂无描述'}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-[#F0F0F0]">
                    <span className="text-xs text-[#CCCCCC]">
                      {persona.created_at ? new Date(persona.created_at).toLocaleDateString('zh-CN') : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/chat/${persona.slug}`}
                        className="px-4 py-2 text-sm font-medium text-[#07C160] hover:bg-[#07C160]/10 rounded-lg transition-all"
                      >
                        进入对话 →
                      </Link>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete(persona.slug, persona.name);
                        }}
                        disabled={deleting === persona.slug}
                        className="p-2 text-[#CCCCCC] hover:text-[#FA5151] hover:bg-[#FA5151]/10 rounded-lg transition-all disabled:opacity-50"
                        title="删除"
                      >
                        {deleting === persona.slug ? (
                          <div className="w-4 h-4 border-2 border-[#FA5151]/20 border-t-[#FA5151] rounded-full animate-spin" />
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
