"use client";

import { useState } from 'react';
import Link from 'next/link';

export default function RegisterForm() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    inviteCode: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          inviteCode: formData.inviteCode
        })
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('token', data.data.token);
        window.location.href = '/';
      } else {
        setError(data.error?.message || '注册失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">注册</h1>
        <p className="text-zinc-400 mt-2">创建你的账号</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">邀请码</label>
          <input
            type="text"
            value={formData.inviteCode}
            onChange={(e) => setFormData({ ...formData, inviteCode: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
            placeholder="输入邀请码"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">用户名</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
            placeholder="3-30个字符"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">密码</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
            placeholder="至少8位，包含大小写字母和数字"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">确认密码</label>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50"
            placeholder="再次输入密码"
            required
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold transition-all disabled:opacity-50"
        >
          {loading ? '注册中...' : '注册'}
        </button>
      </form>

      <p className="text-center text-zinc-400 text-sm mt-6">
        已有账号？{' '}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
          登录
        </Link>
      </p>
    </div>
  );
}
