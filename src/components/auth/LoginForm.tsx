"use client";

import { useState } from 'react';
import Link from 'next/link';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('token', data.data.token);
        window.location.href = '/';
      } else {
        setError(data.error?.message || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#07C160] flex items-center justify-center">
              <span className="text-white text-xl">💬</span>
            </div>
            <span className="text-xl font-bold text-[#353535]">PersonaBot</span>
          </Link>
          <h1 className="text-2xl font-bold text-[#353535] mb-2">欢迎回来</h1>
          <p className="text-[#999999]">登录你的账号继续对话</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl p-8 border border-[#E5E5E5] shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#353535] mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#F7F7F7] border border-[#E5E5E5] text-[#353535] placeholder-[#CCCCCC] focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all"
                placeholder="输入你的用户名"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#353535] mb-2">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#F7F7F7] border border-[#E5E5E5] text-[#353535] placeholder-[#CCCCCC] focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all"
                placeholder="输入你的密码"
                required
              />
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-[#FA5151]/10 border border-[#FA5151]/20 text-[#FA5151] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#07C160] hover:bg-[#06AD56] text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  登录中...
                </span>
              ) : (
                '登录'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E5E5E5] text-center">
            <p className="text-[#999999]">
              还没有账号？{' '}
              <Link href="/register" className="text-[#576B95] hover:text-[#07C160] font-medium transition-colors">
                立即注册
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
