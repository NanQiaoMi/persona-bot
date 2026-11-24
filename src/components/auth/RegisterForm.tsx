"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, FieldInput } from "@/components/primitives";
import BlobMascot from "@/components/workspace/BlobMascot";
import { BLUE_MASCOT_COLOR } from "@/components/workspace/mascot-palette";

export default function RegisterForm() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    inviteCode: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (formData.password.length < 8) {
      setError("密码长度至少需要 8 位");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          inviteCode: formData.inviteCode,
        }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem("token", data.data.token);
        window.location.href = "/";
      } else {
        setError(data.error?.message || "注册失败，请检查邀请码和输入信息");
      }
    } catch {
      setError("连不上服务器，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base text-primary flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex flex-col items-center gap-2">
            <BlobMascot shape="circle" color={BLUE_MASCOT_COLOR} size={48} trackPointer />
            <span className="text-[16px] font-bold text-primary">PersonaBot</span>
          </Link>
          <div>
            <h1 className="text-[20px] font-bold text-primary">创建账号</h1>
            <p className="text-[13px] text-secondary mt-1">注册后开始创建你的专属角色</p>
          </div>
        </div>

        <Card variant="raised" padding="lg" className="bg-surface-base">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="邀请码" htmlFor="reg-invite" hint="邀请码由管理员提供">
              <FieldInput
                id="reg-invite"
                type="text"
                value={formData.inviteCode}
                onChange={(e) => setFormData({ ...formData, inviteCode: e.target.value })}
                placeholder="输入邀请码"
                required
              />
            </Field>

            <Field label="用户名" htmlFor="reg-username">
              <FieldInput
                id="reg-username"
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="3-30 个字符"
                required
              />
            </Field>

            <Field label="密码" htmlFor="reg-password">
              <FieldInput
                id="reg-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="至少 8 位，建议包含大小写字母与数字"
                required
              />
            </Field>

            <Field label="确认密码" htmlFor="reg-confirm">
              <FieldInput
                id="reg-confirm"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                placeholder="再次输入密码"
                required
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-[var(--r-md)] bg-danger-soft border border-[var(--sem-danger)]/25 text-danger text-[12px]"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              {loading ? "注册中..." : "注册"}
            </Button>
          </form>

          <div className="mt-5 pt-5 border-t border-[var(--border-subtle)] text-center text-[13px] text-secondary">
            已有账号？{" "}
            <Link href="/login" className="text-brand hover:underline font-medium">
              立即登录
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
