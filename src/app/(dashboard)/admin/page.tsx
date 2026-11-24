"use client";

import Link from "next/link";
import { Card } from "@/components/primitives";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-surface-base text-primary flex flex-col">
      <header className="sticky top-0 z-20 px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-surface-overlay backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-full bg-surface-raised hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-secondary hover:text-primary transition-colors"
            >
              ← 返回工作台
            </Link>
            <h1 className="text-[16px] font-bold text-primary">管理后台</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/admin/invite-codes" className="block group">
            <Card
              variant="flat"
              padding="lg"
              className="hover:border-brand transition-colors h-full"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-primary group-hover:text-brand transition-colors">
                  邀请码管理
                </h2>
                <span className="text-muted group-hover:text-brand transition-colors">→</span>
              </div>
              <p className="mt-2 text-[13px] text-secondary leading-relaxed">
                生成、复制与作废注册邀请码，控制新用户加入权限
              </p>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  );
}
