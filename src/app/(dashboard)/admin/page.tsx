"use client";

import Link from 'next/link';

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">管理后台</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/invite-codes"
          className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-all"
        >
          <h2 className="text-lg font-semibold mb-2">邀请码管理</h2>
          <p className="text-sm text-zinc-400">创建和管理邀请码，控制用户注册</p>
        </Link>
      </div>
    </div>
  );
}
