'use client';

import { useState, useEffect } from 'react';
import WeChatAvatar from '../ui/WeChatAvatar';

interface Persona {
  slug: string;
  name: string;
  mbti?: string;
  currentEmotion?: string;
}

interface PersonaSwitcherProps {
  currentSlug: string;
  onSwitch: (slug: string) => void;
}

export default function PersonaSwitcher({
  currentSlug,
  onSwitch,
}: PersonaSwitcherProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/personas', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        setPersonas(data.personas || []);
      }
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  };

  const handleSwitch = async (slug: string) => {
    if (slug === currentSlug || loading) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/personas/${slug}/switch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        onSwitch(slug);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to switch persona:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentPersona = personas.find((p) => p.slug === currentSlug);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
      >
        <WeChatAvatar name={currentPersona?.name || currentSlug} size="small" />
        <span className="text-sm text-white">
          {currentPersona?.name || currentSlug}
        </span>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2">
            <div className="text-xs text-zinc-400 px-3 py-2">切换角色</div>
            {personas.map((persona) => (
              <button
                key={persona.slug}
                onClick={() => handleSwitch(persona.slug)}
                disabled={loading}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  persona.slug === currentSlug
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'hover:bg-white/5 text-white'
                }`}
              >
                <WeChatAvatar name={persona.name} size="small" />
                <div className="text-left">
                  <div className="text-sm font-medium">{persona.name}</div>
                  {persona.mbti && (
                    <div className="text-xs text-zinc-400">{persona.mbti}</div>
                  )}
                </div>
                {persona.slug === currentSlug && (
                  <svg
                    className="w-4 h-4 ml-auto text-indigo-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
