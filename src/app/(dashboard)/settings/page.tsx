"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ImportModal from '@/components/ImportModal';
import SkillPanel from '@/components/SkillPanel';

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
  const [showImport, setShowImport] = useState(false);
  const [showSkills, setShowSkills] = useState(false);

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
      {/* Header */}
      <div className="glass sticky top-14 z-40 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="w-9 h-9 rounded-lg bg-white/60 backdrop-blur-sm flex items-center justify-center text-[#576B95] hover:text-[#07C160] hover:bg-white/80 transition-all border border-white/40">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-base font-semibold text-[#353535]">设置</h1>
        <div className="w-9" />
      </div>

      {/* Quick Actions */}
      <div className="px-4 pt-4 pb-2">
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

      {/* LLM Settings */}
      <div className="px-4 pt-4 pb-2">
        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#07C160]/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#07C160]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-[#353535]">LLM 设置</h2>
          </div>

          <div>
            <label className="block text-xs text-[#999999] mb-2 font-medium">LLM 提供商</label>
            <select
              value={settings.llmProvider}
              onChange={(e) => setSettings({ ...settings, llmProvider: e.target.value })}
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm text-[#353535]"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#999999] mb-2 font-medium">API 密钥（可选）</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="留空使用系统默认密钥"
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm text-[#353535] placeholder-[#CCCCCC]"
            />
            <p className="text-[11px] text-[#B0B0B0] mt-1.5">
              如果填写，将优先使用你的API密钥
            </p>
          </div>
        </div>
      </div>

      {/* Appearance Settings */}
      <div className="px-4 pt-2 pb-2">
        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#576B95]/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#576B95]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-[#353535]">外观设置</h2>
          </div>

          <div>
            <label className="block text-xs text-[#999999] mb-2 font-medium">主题</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSettings({ ...settings, theme: 'dark' })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  settings.theme === 'dark'
                    ? 'bg-[#353535] text-white shadow-sm'
                    : 'bg-[#F7F7F7] text-[#999999] hover:bg-[#EDEDED]'
                }`}
              >
                深色
              </button>
              <button
                onClick={() => setSettings({ ...settings, theme: 'light' })}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  settings.theme === 'light'
                    ? 'bg-white text-[#353535] shadow-sm border border-[#E5E5E5]'
                    : 'bg-[#F7F7F7] text-[#999999] hover:bg-[#EDEDED]'
                }`}
              >
                浅色
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#999999] mb-2 font-medium">语言</label>
            <select
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value })}
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm text-[#353535]"
            >
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="px-4 pt-4 pb-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#07C160] to-[#06AD56] hover:from-[#06AD56] hover:to-[#059A4F] text-white text-sm font-medium transition-all shadow-sm shadow-[#07C160]/30 hover:shadow-md hover:shadow-[#07C160]/40 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>

        {message && (
          <div className={`mt-3 p-3 rounded-lg text-sm text-center ${
            message.includes('已保存') 
              ? 'bg-[#07C160]/10 text-[#07C160]' 
              : 'bg-[#FA5151]/10 text-[#FA5151]'
          }`}>
            {message}
          </div>
        )}
      </div>

      {/* Modals */}
      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => window.location.reload()}
      />
      <SkillPanel
        isOpen={showSkills}
        onClose={() => setShowSkills(false)}
      />
    </div>
  );
}
