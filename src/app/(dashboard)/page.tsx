"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import WeChatAvatar from '@/components/ui/WeChatAvatar';

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
      const hours = Math.floor(diff / (60 * 60 * 1000));
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#E5E5E5] border-t-[#07C160] rounded-full animate-spin" />
          <p className="text-[#999999] text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Chat List - WeChat style */}
      {personas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 px-6">
          <div className="w-20 h-20 rounded-full bg-[#F7F7F7] flex items-center justify-center mb-4">
            <span className="text-4xl">💬</span>
          </div>
          <h2 className="text-lg font-medium text-[#353535] mb-2">还没有对话</h2>
          <p className="text-sm text-[#999999] mb-6 text-center">
            创建你的第一个 AI 角色，开始对话
          </p>
          <Link
            href="/create"
            className="px-6 py-2.5 bg-[#07C160] hover:bg-[#06AD56] text-white text-sm rounded transition-colors"
          >
            创建角色
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-[#E5E5E5]">
          {personas.map((persona) => (
            <Link
              key={persona.slug}
              href={`/chat/${persona.slug}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#F7F7F7] active:bg-[#EDEDED] transition-colors"
            >
              <WeChatAvatar
                name={persona.name}
                size="medium"
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-[15px] text-[#353535] truncate">{persona.name}</h3>
                  <span className="text-[11px] text-[#999999] ml-2 flex-shrink-0">
                    {formatTime(persona.lastActive)}
                  </span>
                </div>
                <p className="text-[13px] text-[#999999] truncate">
                  {persona.mbti ? `${persona.mbti} · ` : ''}
                  {persona.tags?.slice(0, 2).join('·') || '点击开始对话'}
                </p>
              </div>
            </Link>
          ))}
          
          {/* Add New Button */}
          <Link
            href="/create"
            className="flex items-center justify-center gap-2 py-4 text-[#07C160] hover:bg-[#F7F7F7] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm">添加新角色</span>
          </Link>
        </div>
      )}
    </div>
  );
}
