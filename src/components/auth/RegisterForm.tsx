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

    if (formData.password.length < 8) {
      setError('密码长度至少8位');
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
          <h1 className="text-2xl font-bold text-[#353535] mb-2">创建账号</h1>
          <p className="text-[#999999]">注册后开始创建你的AI角色</p>
        </div>

        {/* Register Form */}
        <div className="bg-white rounded-2xl p-8 border border-[#E5E5E5] shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#353535] mb-2">
                邀请码
              </label>
              <input
                type="text"
                value={formData.inviteCode}
                onChange={(e) => setFormData({ ...formData, inviteCode: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-[#F7F7F7] border border-[#E5E5E5] text-[#353535] placeholder-[#CCCCCC] focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all"
                placeholder="输入邀请码"
                required
              />
              <p className="mt-2 text-xs text-[#CCCCCC]">
                邀请码由管理员提供
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#353535] mb-2">
                用户名
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-[#F7F7F7] border border-[#E5E5E5] text-[#353535] placeholder-[#CCCCCC] focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all"
                placeholder="3-30个字符"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#353535] mb-2">
                密码
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-[#F7F7F7] border border-[#E5E5E5] text-[#353535] placeholder-[#CCCCCC] focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all"
                placeholder="至少8位，包含大小写字母和数字"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#353535] mb-2">
                确认密码
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-[#F7F7F7] border border-[#E5E5E5] text-[#353535] placeholder-[#CCCCCC] focus:outline-none focus:border-[#07C160] focus:ring-2 focus:ring-[#07C160]/20 transition-all"
                placeholder="再次输入密码"
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
                  注册中...
                </span>
              ) : (
                '注册'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E5E5E5] text-center">
            <p className="text-[#999999]">
              已有账号？{' '}
              <Link href="/login" className="text-[#576B95] hover:text-[#07C160] font-medium transition-colors">
                立即登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
