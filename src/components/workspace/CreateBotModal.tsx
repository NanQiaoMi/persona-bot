"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonaRecord } from "@/lib/storage/types";
import BlobMascot from "./BlobMascot";
import {
  MASCOT_COLORS,
  MASCOT_SHAPES,
  MascotShapeId,
} from "./mascot-palette";

interface CreateBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (persona: PersonaRecord) => void;
}

export default function CreateBotModal({
  isOpen,
  onClose,
  onCreated,
}: CreateBotModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [personalityHint, setPersonalityHint] = useState("");
  const [appearanceAnchor, setAppearanceAnchor] = useState("");
  const [shape, setShape] = useState<MascotShapeId>("splat");
  const [color, setColor] = useState<string>("#FA2D48");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          avatarShape: shape,
          avatarColor: color,
          defaultMode: "fun",
          ensureUniqueSlug: true,
          basicPersonality: personalityHint.trim() || undefined,
          appearanceAnchor: appearanceAnchor.trim() || undefined,
          basicInfo: personalityHint.trim()
            ? `${trimmed} · ${personalityHint.trim()}`
            : `${trimmed} · 专属拟人 AI Bot`,
          personalityInfo:
            personalityHint.trim() || "嘴硬心软、有鲜明脾气、说话像熟人一样的私人搭子",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.persona) {
        setError(data?.error?.message || "创建 Bot 失败");
        return;
      }
      setName("");
      setPersonalityHint("");
      setAppearanceAnchor("");
      onCreated(data.persona);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络请求失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            创建新 Bot
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-2 flex flex-col items-center">
          {/* Live Interactive Mascot Preview */}
          <div className="my-3 flex items-center justify-center">
            <BlobMascot
              shape={shape}
              color={color}
              size={84}
              trackPointer
              animated
            />
          </div>

          {/* Name Input */}
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="给你的 Bot 起个名字"
            className="w-full rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] px-4 py-2.5 text-center text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--border-strong)] transition-all"
          />

          <div className="mt-2.5 w-full space-y-2">
            <input
              type="text"
              value={personalityHint}
              onChange={(e) => setPersonalityHint(e.target.value)}
              placeholder="一句话性格（可选，如：嘴硬爱撒娇的深夜搭子）"
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
            />
            <input
              type="text"
              value={appearanceAnchor}
              onChange={(e) => setAppearanceAnchor(e.target.value)}
              placeholder="固定外貌与穿搭锚点（可选，如：黑长直微卷、甜酷穿搭）"
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          {error && (
            <p className="mt-2 text-[12px] text-rose-500">{error}</p>
          )}

          {/* 13 Shapes Picker */}
          <div className="mt-5 w-full flex flex-wrap items-center justify-center gap-2.5">
            {MASCOT_SHAPES.map((s) => {
              const selected = shape === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  title={s.label}
                  onClick={() => setShape(s.id)}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                    selected
                      ? "bg-[var(--bg-hover)] ring-2 ring-[var(--border-strong)] scale-105"
                      : "hover:bg-[var(--bg-hover)] hover:scale-105"
                  }`}
                >
                  <BlobMascot
                    shape={s.id}
                    color={color}
                    size={30}
                    trackPointer={false}
                    animated={false}
                  />
                </button>
              );
            })}
          </div>

          {/* 11 Solid Matte Colors */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 px-4">
            {MASCOT_COLORS.map((c) => {
              const selected = color.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`选择颜色 ${c}`}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                    selected
                      ? "ring-2 ring-[var(--border-strong)] ring-offset-2 ring-offset-[var(--bg-elevated)] scale-110"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              );
            })}
          </div>

          {/* Studio Deep-Distill Hint */}
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/create");
            }}
            className="mt-4 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            想用微信 / iMessage 聊天记录深度蒸馏灵魂？前往工作室 →
          </button>

          {/* Footer Actions */}
          <div className="mt-5 w-full flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!name.trim() || saving}
              onClick={() => void handleCreate()}
              className={`px-5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                name.trim() && !saving
                  ? "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90"
                  : "bg-[var(--bg-secondary)] text-[var(--text-muted)] opacity-60 cursor-not-allowed"
              }`}
            >
              {saving ? "创建中..." : "创建"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
