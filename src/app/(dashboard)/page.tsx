"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PersonaCard from '@/components/persona/PersonaCard';

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
      <div className="text-center py-12">
        <div className="text-white">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的角色</h1>
        <Link
          href="/create"
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all"
        >
          + 创建新角色
        </Link>
      </div>

      {personas.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900/50 rounded-2xl border border-zinc-800">
          <p className="text-zinc-400 mb-4">还没有创建任何角色</p>
          <Link
            href="/create"
            className="inline-block px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
          >
            创建第一个 Persona
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map((persona) => (
            <PersonaCard
              key={persona.slug}
              name={persona.name}
              slug={persona.slug}
              mbti={persona.mbti}
              tags={persona.tags}
              lastActive={persona.lastActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}
