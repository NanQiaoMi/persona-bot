"use client";

import { useRef, useState } from "react";
import { PersonaRecord } from "@/lib/storage/types";
import BlobMascot, {
  getMascotConfigForPersona,
  MASCOT_COLORS,
  MASCOT_SHAPES,
  MascotShapeId,
} from "./BlobMascot";

interface AvatarPickerModalProps {
  isOpen: boolean;
  persona: PersonaRecord | null;
  onClose: () => void;
  onSave: (patch: Partial<PersonaRecord>) => Promise<void>;
}

export default function AvatarPickerModal({
  isOpen,
  persona,
  onClose,
  onSave,
}: AvatarPickerModalProps) {
  const initial = persona
    ? getMascotConfigForPersona(persona.slug, persona.profile)
    : { shape: "hexagon" as MascotShapeId, color: "#1683FF", image: undefined };

  const [tab, setTab] = useState<"bot" | "upload">("bot");
  const [shape, setShape] = useState<MascotShapeId>(initial.shape);
  const [color, setColor] = useState<string>(initial.color);
  const [customImage, setCustomImage] = useState<string | undefined>(
    initial.image
  );
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !persona) return null;

  const handleRandomize = () => {
    const nextShape =
      MASCOT_SHAPES[Math.floor(Math.random() * MASCOT_SHAPES.length)].id;
    const nextColor =
      MASCOT_COLORS[Math.floor(Math.random() * MASCOT_COLORS.length)];
    setCustomImage(undefined);
    setShape(nextShape);
    setColor(nextColor);
    setTab("bot");
  };

  const handleReset = () => {
    const def = getMascotConfigForPersona(persona.slug);
    setCustomImage(undefined);
    setShape(def.shape);
    setColor(def.color);
    setTab("bot");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    setSaving(true);
    await onSave({
      profile: {
        ...persona.profile,
        avatarShape: shape,
        avatarColor: color,
        avatarImage: tab === "upload" ? customImage : undefined,
      },
    });
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] flex flex-col items-center gap-5 animate-msg-spring"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Live Preview Mascot (Tracks Pointer in Real Time) */}
        <div className="flex flex-col items-center gap-2">
          <BlobMascot
            shape={shape}
            color={color}
            image={tab === "upload" ? customImage : undefined}
            size={88}
            trackPointer
          />
          <span className="text-xs font-medium text-white/90 drop-shadow">
            移动鼠标看看 {persona.name} 的眼神变化
          </span>
        </div>

        {/* Clean White Grok Bot Picker Card */}
        <div className="w-full rounded-[28px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card overflow-hidden">
          {/* Card Header Tabs: Bot / 随机 / 上传  ---  重置 */}
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTab("bot")}
                className={`px-3 py-1 rounded-full font-medium transition-colors ${
                  tab === "bot"
                    ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Bot
              </button>
              <button
                type="button"
                onClick={handleRandomize}
                className="px-3 py-1 rounded-full font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                随机
              </button>
              <button
                type="button"
                onClick={() => setTab("upload")}
                className={`px-3 py-1 rounded-full font-medium transition-colors ${
                  tab === "upload"
                    ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                上传
              </button>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              重置
            </button>
          </div>

          {tab === "bot" ? (
            <div className="p-5 space-y-6">
              {/* 13 Shapes Grid (5 + 5 + 3 centered) */}
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-2 place-items-center">
                  {MASCOT_SHAPES.slice(0, 10).map((s) => {
                    const isSelected = shape === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setCustomImage(undefined);
                          setShape(s.id);
                        }}
                        title={s.label}
                        className={`p-1.5 rounded-2xl transition-all ${
                          isSelected
                            ? "ring-2 ring-black/20 dark:ring-white/30 bg-[var(--bg-secondary)] scale-105"
                            : "hover:scale-105"
                        }`}
                      >
                        <BlobMascot
                          shape={s.id}
                          color={color}
                          size={40}
                          trackPointer={false}
                          animated={false}
                        />
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-center gap-3">
                  {MASCOT_SHAPES.slice(10).map((s) => {
                    const isSelected = shape === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setCustomImage(undefined);
                          setShape(s.id);
                        }}
                        title={s.label}
                        className={`p-1.5 rounded-2xl transition-all ${
                          isSelected
                            ? "ring-2 ring-black/20 dark:ring-white/30 bg-[var(--bg-secondary)] scale-105"
                            : "hover:scale-105"
                        }`}
                      >
                        <BlobMascot
                          shape={s.id}
                          color={color}
                          size={40}
                          trackPointer={false}
                          animated={false}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 11 Solid Matte Color Swatches (6 + 5 centered) */}
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3.5">
                  {MASCOT_COLORS.slice(0, 6).map((c) => {
                    const active = color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`选择颜色 ${c}`}
                        className={`w-8 h-8 rounded-full transition-transform ${
                          active
                            ? "ring-2 ring-offset-2 ring-black/25 dark:ring-white/40 ring-offset-[var(--bg-composer)] scale-105"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-3.5">
                  {MASCOT_COLORS.slice(6).map((c) => {
                    const active = color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`选择颜色 ${c}`}
                        className={`w-8 h-8 rounded-full transition-transform ${
                          active
                            ? "ring-2 ring-offset-2 ring-black/25 dark:ring-white/40 ring-offset-[var(--bg-composer)] scale-105"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center space-y-4">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-2xl border-2 border-dashed border-[var(--border-strong)] hover:bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)] transition-colors"
              >
                {customImage ? "✓ 已选择图片，点击更换" : "点击上传本地图片作为头像"}
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-secondary)]/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-full text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirm}
              className="px-5 py-1.5 rounded-full bg-[var(--text-primary)] text-[var(--bg-primary)] text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              {saving ? "保存中..." : "完成"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
