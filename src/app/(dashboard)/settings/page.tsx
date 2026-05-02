"use client";

import { useState, useEffect } from 'react';

interface UserSettings {
  llmProvider: string;
  apiKey: string;
  theme: 'light' | 'dark';
  language: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    llmProvider: 'openai',
    apiKey: '',
    theme: 'light',
    language: 'zh-CN',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/user/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!cancelled && data.success && data.user.settings) {
          setSettings({
            llmProvider: data.user.settings.llmProvider || 'openai',
            apiKey: data.user.settings.apiKeyEncrypted || '',
            theme: data.user.settings.theme || 'light',
            language: data.user.settings.language || 'zh-CN',
          });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage('设置已保存');
      } else {
        setMessage('保存失败：' + (data.error?.message || '未知错误'));
      }
    } catch {
      setMessage('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-white">加载中...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">设置</h1>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">LLM 设置</h2>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">LLM 提供商</label>
          <select
            value={settings.llmProvider}
            onChange={(e) => setSettings({ ...settings, llmProvider: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">自定义</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">API 密钥（可选）</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            placeholder="留空使用系统默认密钥"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-zinc-600"
          />
          <p className="text-xs text-zinc-500 mt-1">
            如果填写，将优先使用你的API密钥
          </p>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">外观设置</h2>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">主题</label>
          <div className="flex gap-4">
            <button
              onClick={() => setSettings({ ...settings, theme: 'dark' })}
              className={`px-4 py-2 rounded-lg border ${
                settings.theme === 'dark'
                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400'
                  : 'border-white/10 text-zinc-400'
              }`}
            >
              深色
            </button>
            <button
              onClick={() => setSettings({ ...settings, theme: 'light' })}
              className={`px-4 py-2 rounded-lg border ${
                settings.theme === 'light'
                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400'
                  : 'border-white/10 text-zinc-400'
              }`}
            >
              浅色
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">语言</label>
          <select
            value={settings.language}
            onChange={(e) => setSettings({ ...settings, language: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>

        {message && (
          <span
            className={`text-sm ${
              message.includes('已保存') ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
