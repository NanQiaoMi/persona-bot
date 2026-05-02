"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface InviteCode {
  id: string;
  code: string;
  createdBy: string;
  usedCount: number;
  maxUses: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export default function InviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newCodeCount, setNewCodeCount] = useState(1);
  const [newCodeMaxUses, setNewCodeMaxUses] = useState(10);
  const initialized = useRef(false);

  const loadCodes = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/invite-codes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setCodes(data.codes || []);
      }
    } catch (error) {
      console.error('Failed to load invite codes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      loadCodes();
    }
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          count: newCodeCount,
          maxUses: newCodeMaxUses,
          expiresInDays: 30
        })
      });
      const data = await res.json();

      if (data.success) {
        await loadCodes();
        setNewCodeCount(1);
      }
    } catch (error) {
      console.error('Failed to create invite codes:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个邀请码吗？')) return;

    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/admin/invite-codes?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadCodes();
    } catch (error) {
      console.error('Failed to delete invite code:', error);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    alert('已复制到剪贴板');
  };

  if (loading) {
    return <div className="text-center py-12 text-white">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-zinc-400 hover:text-white">
            ← 返回
          </Link>
          <h1 className="text-2xl font-bold">邀请码管理</h1>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">创建新邀请码</h2>
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">数量</label>
            <input
              type="number"
              min="1"
              max="50"
              value={newCodeCount}
              onChange={(e) => setNewCodeCount(parseInt(e.target.value))}
              className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-2">最大使用次数</label>
            <input
              type="number"
              min="1"
              max="100"
              value={newCodeMaxUses}
              onChange={(e) => setNewCodeMaxUses(parseInt(e.target.value))}
              className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
          >
            {creating ? '创建中...' : '创建'}
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-6 py-3 text-sm text-zinc-400">邀请码</th>
              <th className="text-left px-6 py-3 text-sm text-zinc-400">创建者</th>
              <th className="text-left px-6 py-3 text-sm text-zinc-400">使用情况</th>
              <th className="text-left px-6 py-3 text-sm text-zinc-400">过期时间</th>
              <th className="text-left px-6 py-3 text-sm text-zinc-400">状态</th>
              <th className="text-right px-6 py-3 text-sm text-zinc-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code.id} className="border-b border-zinc-800/50 hover:bg-white/5">
                <td className="px-6 py-4">
                  <button
                    onClick={() => copyToClipboard(code.code)}
                    className="font-mono text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    {code.code}
                  </button>
                </td>
                <td className="px-6 py-4 text-sm text-zinc-300">{code.createdBy}</td>
                <td className="px-6 py-4 text-sm text-zinc-300">
                  {code.usedCount} / {code.maxUses}
                </td>
                <td className="px-6 py-4 text-sm text-zinc-300">
                  {new Date(code.expiresAt).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    code.isActive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-zinc-500/20 text-zinc-400'
                  }`}>
                    {code.isActive ? '有效' : '无效'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleDelete(code.id)}
                    className="text-sm text-rose-400 hover:text-rose-300"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {codes.length === 0 && (
          <div className="text-center py-8 text-zinc-400">
            暂无邀请码
          </div>
        )}
      </div>
    </div>
  );
}
