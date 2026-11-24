"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, FieldInput } from "@/components/primitives";
import BlobMascot from "@/components/workspace/BlobMascot";
import { BLUE_MASCOT_COLOR } from "@/components/workspace/mascot-palette";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem("token", data.data.token);
        window.location.href = "/";
      } else {
        setError(data.error?.message || "用户名或密码不正确，请检查后重试");
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
            <h1 className="text-[20px] font-bold text-primary">欢迎回来</h1>
            <p className="text-[13px] text-secondary mt-1">登录账号继续你的对话</p>
          </div>
        </div>

        <Card variant="raised" padding="lg" className="bg-surface-base">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="用户名" htmlFor="login-username">
              <FieldInput
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入你的用户名"
                required
              />
            </Field>

            <Field label="密码" htmlFor="login-password">
              <FieldInput
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入你的密码"
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
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>

          <div className="mt-5 pt-5 border-t border-[var(--border-subtle)] text-center text-[13px] text-secondary">
            还没有账号？{" "}
            <Link href="/register" className="text-brand hover:underline font-medium">
              立即注册
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
