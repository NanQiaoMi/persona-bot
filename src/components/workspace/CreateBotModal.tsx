"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FieldInput, Modal } from "@/components/primitives";
import { PersonaRecord } from "@/lib/storage/types";
import BlobMascot from "./BlobMascot";
import {
  DEFAULT_MASCOT_COLOR,
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
  const [color, setColor] = useState<string>(DEFAULT_MASCOT_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="创建新角色"
      bodyClassName="px-6 pb-6 pt-3 flex flex-col items-center"
    >
      {/* Live Interactive Mascot Preview */}
      <div className="my-2 flex items-center justify-center">
        <BlobMascot
          shape={shape}
          color={color}
          size={84}
          trackPointer
          animated
        />
      </div>

      {/* Name Input */}
      <FieldInput
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
        placeholder="给你的角色起个名字"
        className="!rounded-full !border-[var(--border-strong)] !bg-surface-base !px-4 !py-2.5 text-center !text-[14px]"
      />

      <div className="mt-2.5 w-full space-y-2">
        <FieldInput
          type="text"
          value={personalityHint}
          onChange={(e) => setPersonalityHint(e.target.value)}
          placeholder="一句话性格（可选，如：嘴硬爱撒娇的深夜搭子）"
          className="!rounded-[var(--r-lg)] !bg-surface-base !px-3.5 !text-[12px]"
        />
        <FieldInput
          type="text"
          value={appearanceAnchor}
          onChange={(e) => setAppearanceAnchor(e.target.value)}
          placeholder="固定外貌与穿搭锚点（可选，如：黑长直微卷、甜酷穿搭）"
          className="!rounded-[var(--r-lg)] !bg-surface-base !px-3.5 !text-[12px]"
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
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
              className={`w-11 h-11 rounded-[var(--r-lg)] flex items-center justify-center transition-transform cursor-pointer ${
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
                  ? "ring-2 ring-[var(--border-strong)] ring-offset-2 ring-offset-[var(--surface-overlay)] scale-110"
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
        className="mt-4 text-[12px] text-muted hover:text-primary transition-colors cursor-pointer"
      >
        想用微信 / iMessage 聊天记录深度蒸馏灵魂？前往工作室 →
      </button>

      {/* Footer Actions */}
      <div className="mt-5 w-full flex items-center justify-end gap-2.5">
        <Button variant="ghost" size="md" onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!name.trim() || saving}
          loading={saving}
          onClick={() => void handleCreate()}
        >
          {saving ? "创建中..." : "创建"}
        </Button>
      </div>
    </Modal>
  );
}
