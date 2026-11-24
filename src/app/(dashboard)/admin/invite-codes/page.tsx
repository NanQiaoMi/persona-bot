"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { describeRequestError, useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Field, FieldInput, Skeleton } from "@/components/primitives";

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
  const { toast, confirm } = useFeedback();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newCodeCount, setNewCodeCount] = useState(1);
  const [newCodeMaxUses, setNewCodeMaxUses] = useState(10);

  const fetchCodes = useCallback(async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/admin/invite-codes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }, []);

  useEffect(() => {
    let active = true;
    fetchCodes()
      .then((data) => {
        if (active && data?.success) {
          setCodes(data.codes || []);
        }
      })
      .catch((error) => {
        if (active) {
          toast("邀请码列表没加载出来", {
            tone: "error",
            description: describeRequestError(error),
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchCodes, toast]);

  const reloadCodes = async () => {
    try {
      const data = await fetchCodes();
      if (data?.success) {
        setCodes(data.codes || []);
      }
    } catch (error) {
      toast("刷新列表失败", { tone: "error", description: describeRequestError(error) });
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/invite-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          count: Math.max(1, Math.min(50, newCodeCount || 1)),
          maxUses: Math.max(1, Math.min(100, newCodeMaxUses || 1)),
          expiresInDays: 30,
        }),
      });
      const data = await res.json();

      if (data.success) {
        await reloadCodes();
        setNewCodeCount(1);
        toast("已生成新邀请码", { tone: "success" });
      } else {
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }
    } catch (error) {
      toast("生成邀请码失败", { tone: "error", description: describeRequestError(error) });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "删除这个邀请码？",
      description: "删除后，还没用过这个码的人将无法注册。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;

    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/admin/invite-codes?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await reloadCodes();
      toast("已删除邀请码", { tone: "success" });
    } catch (error) {
      toast("删除邀请码失败", { tone: "error", description: describeRequestError(error) });
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard
      .writeText(code)
      .then(() => toast("已复制邀请码", { tone: "success" }))
      .catch(() => toast("复制失败，请手动选中复制", { tone: "error" }));
  };

  return (
    <div className="min-h-screen bg-surface-base text-primary flex flex-col">
      <header className="sticky top-0 z-20 px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-surface-overlay backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded-full bg-surface-raised hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-secondary hover:text-primary transition-colors"
            >
              ← 返回后台
            </Link>
            <h1 className="text-[16px] font-bold text-primary">邀请码管理</h1>
          </div>
          <Link
            href="/"
            className="px-3 py-1.5 rounded-full bg-surface-raised hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-secondary hover:text-primary transition-colors"
          >
            工作台
          </Link>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        <Card variant="flat" padding="lg" className="space-y-4">
          <h2 className="text-[14px] font-semibold text-primary">创建新邀请码</h2>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="生成数量" htmlFor="invite-count" className="w-28">
              <FieldInput
                id="invite-count"
                type="number"
                min={1}
                max={50}
                value={newCodeCount}
                onChange={(e) => setNewCodeCount(parseInt(e.target.value, 10) || 1)}
                className="!bg-surface-base"
              />
            </Field>
            <Field label="可用次数" htmlFor="invite-max-uses" className="w-28">
              <FieldInput
                id="invite-max-uses"
                type="number"
                min={1}
                max={100}
                value={newCodeMaxUses}
                onChange={(e) => setNewCodeMaxUses(parseInt(e.target.value, 10) || 1)}
                className="!bg-surface-base"
              />
            </Field>
            <Button
              variant="primary"
              size="md"
              loading={creating}
              onClick={() => void handleCreate()}
            >
              {creating ? "创建中..." : "创建邀请码"}
            </Button>
          </div>
        </Card>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} variant="card" className="h-20" />
            ))}
          </div>
        ) : codes.length === 0 ? (
          <Card variant="flat" padding="lg" className="text-center py-10 space-y-2">
            <div className="text-[14px] font-medium text-primary">暂无邀请码</div>
            <p className="text-[12px] text-muted">
              使用上方表单生成邀请码后，新用户可凭邀请码完成注册。
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {codes.map((code) => (
              <Card
                key={code.id}
                variant="flat"
                padding="md"
                className="flex flex-col justify-between gap-3 bg-surface-base"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[14px] font-semibold text-primary truncate">
                      {code.code}
                    </div>
                    <div className="mt-1 text-[12px] text-secondary flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>创建者：{code.createdBy}</span>
                      <span>
                        已用：{code.usedCount} / {code.maxUses}
                      </span>
                      <span>
                        到期：{new Date(code.expiresAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium shrink-0 ${
                      code.isActive
                        ? "bg-success-soft text-success"
                        : "bg-surface-sunken text-muted"
                    }`}
                  >
                    {code.isActive ? "有效" : "无效"}
                  </span>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(code.code)}
                  >
                    复制
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(code.id)}
                    className="text-danger hover:bg-danger-soft"
                  >
                    删除
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
