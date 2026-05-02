"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import WeChatAvatar from '@/components/ui/WeChatAvatar';
import ImportModal from '@/components/ImportModal';
import SkillPanel from '@/components/SkillPanel';

interface Persona {
  slug: string;
  name: string;
  mbti?: string;
  tags?: string[];
  lastActive?: string;
  lastMessage?: string;
}

export default function DashboardPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showSkills, setShowSkills] = useState(false);

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

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}分钟前`;
    } else if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${hours}小时前`;
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
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

  return (
    <div className="min-h-screen pb-8">
      {/* Header Section */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#353535]">消息</h1>
            <p className="text-xs text-[#999999] mt-0.5">{personas.length} 个对话</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="w-9 h-9 rounded-lg bg-[#576B95]/10 flex items-center justify-center text-[#576B95] hover:bg-[#576B95]/20 transition-colors"
              title="导入聊天记录"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </button>
            <button
              onClick={() => setShowSkills(true)}
              className="w-9 h-9 rounded-lg bg-[#F0A020]/10 flex items-center justify-center text-[#F0A020] hover:bg-[#F0A020]/20 transition-colors"
              title="技能管理"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </button>
            <Link
              href="/create"
              className="w-9 h-9 rounded-lg bg-[#07C160]/10 flex items-center justify-center text-[#07C160] hover:bg-[#07C160]/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex-1 glass-card rounded-xl p-3 flex items-center gap-3 hover:bg-white/60 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-[#576B95]/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[#576B95]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-[#353535]">导入聊天</p>
              <p className="text-[11px] text-[#999999]">微信 / iMessage</p>
            </div>
          </button>
          <button
            onClick={() => setShowSkills(true)}
            className="flex-1 glass-card rounded-xl p-3 flex items-center gap-3 hover:bg-white/60 transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-[#F0A020]/10 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-[#F0A020]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-[#353535]">技能管理</p>
              <p className="text-[11px] text-[#999999]">查看已安装技能</p>
            </div>
          </button>
        </div>
      </div>

      {/* Chat List */}
      {personas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#07C160]/10 to-[#576B95]/10 flex items-center justify-center mb-5">
            <span className="text-4xl">💬</span>
          </div>
          <h2 className="text-lg font-medium text-[#353535] mb-2">还没有对话</h2>
          <p className="text-sm text-[#999999] mb-6 text-center max-w-[240px]">
            创建你的第一个 AI 角色，或导入聊天记录开始
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="px-5 py-2.5 glass text-sm text-[#666666] rounded-lg hover:bg-white/80 transition-all"
            >
              导入聊天
            </button>
            <Link
              href="/create"
              className="px-5 py-2.5 bg-[#07C160] hover:bg-[#06AD56] text-white text-sm rounded-lg transition-all shadow-sm hover:shadow-md"
            >
              创建角色
            </Link>
          </div>
        </div>
      ) : (
        <div className="px-3">
          <div className="glass-card rounded-xl overflow-hidden divide-y divide-[#E5E5E5]/50">
            {personas.map((persona, index) => (
              <Link
                key={persona.slug}
                href={`/chat/${persona.slug}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/60 active:bg-white/80 transition-all"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <WeChatAvatar
                  name={persona.name}
                  size="medium"
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-[15px] font-medium text-[#353535] truncate">{persona.name}</h3>
                    <span className="text-[11px] text-[#B0B0B0] ml-2 flex-shrink-0">
                      {formatTime(persona.lastActive)}
                    </span>
                  </div>
                  <p className="text-[13px] text-[#999999] truncate">
                    {persona.mbti ? `${persona.mbti} · ` : ''}
                    {persona.tags?.slice(0, 2).join('·') || '点击开始对话'}
                  </p>
                </div>

                <svg className="w-4 h-4 text-[#D0D0D0] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={(result) => {
          console.log('Import success:', result);
          window.location.reload();
        }}
      />
      <SkillPanel
        isOpen={showSkills}
        onClose={() => setShowSkills(false)}
      />
    </div>
  );
}
