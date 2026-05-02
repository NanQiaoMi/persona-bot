"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Persona {
  slug: string;
  name: string;
  mbti?: string;
  tags?: string[];
  lastActive?: string;
}

export default function DashboardPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/personas', {
          headers: { Authorization: `Bearer ${token}` }
        });
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

    fetchPersonas();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-zinc-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">我的角色</h1>
          <p className="text-zinc-400 mt-1">管理和对话你的AI角色</p>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 hover:-translate-y-0.5"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          创建新角色
        </Link>
      </div>

      {/* Personas Grid */}
      {personas.length === 0 ? (
        <div className="text-center py-24 px-6">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
            <span className="text-5xl">🎭</span>
          </div>
          <h2 className="text-2xl font-bold mb-3">还没有创建任何角色</h2>
          <p className="text-zinc-400 mb-8 max-w-md mx-auto">
            创建你的第一个Persona，让AI用她的方式和你对话
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-lg hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 hover:-translate-y-1"
          >
            <span>✨</span>
            创建第一个 Persona
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personas.map((persona) => (
            <Link
              key={persona.slug}
              href={`/chat/${persona.slug}`}
              className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-indigo-500/5"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                    {persona.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold group-hover:text-indigo-400 transition-colors">
                      {persona.name}
                    </h3>
                    {persona.mbti && (
                      <span className="text-sm text-indigo-400">{persona.mbti}</span>
                    )}
                  </div>
                </div>
                
                {persona.tags && persona.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {persona.tags.slice(0, 3).map((tag, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 text-xs rounded-full bg-white/5 text-zinc-400 border border-white/5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  <span className="text-xs text-zinc-500">
                    {persona.lastActive ? `最近活跃: ${new Date(persona.lastActive).toLocaleDateString('zh-CN')}` : '新创建'}
                  </span>
                  <span className="text-sm text-indigo-400 font-medium group-hover:translate-x-1 transition-transform">
                    进入对话 →
                  </span>
                </div>
              </div>
            </Link>
          ))}
          
          {/* Add New Card */}
          <Link
            href="/create"
            className="group p-6 rounded-2xl border-2 border-dashed border-white/10 hover:border-indigo-500/30 transition-all duration-300 flex flex-col items-center justify-center text-center min-h-[200px]"
          >
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-3xl mb-4 group-hover:bg-indigo-500/10 transition-colors">
              +
            </div>
            <span className="text-zinc-400 group-hover:text-indigo-400 transition-colors font-medium">
              创建新角色
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
