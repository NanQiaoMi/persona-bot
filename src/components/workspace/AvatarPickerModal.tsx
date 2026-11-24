"use client";

import { useRef, useState } from "react";
import { Button, Modal } from "@/components/primitives";
import { PersonaRecord } from "@/lib/storage/types";
import BlobMascot, {
  getMascotConfigForPersona,
  MASCOT_COLORS,
  MASCOT_SHAPES,
  MascotShapeId,
} from "./BlobMascot";
import { BLUE_MASCOT_COLOR } from "./mascot-palette";

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
    : { shape: "hexagon" as MascotShapeId, color: BLUE_MASCOT_COLOR, image: undefined };

  const [tab, setTab] = useState<"bot" | "upload">("bot");
  const [shape, setShape] = useState<MascotShapeId>(initial.shape);
  const [color, setColor] = useState<string>(initial.color);
  const [customImage, setCustomImage] = useState<string | undefined>(
    initial.image
  );
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!persona) return null;

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={`定制 ${persona.name} 形象`}
      description="移动鼠标看看角色眼神变化"
      bodyClassName="p-0"
    >
      <div className="flex flex-col items-center">
        {/* Top Live Preview Mascot */}
        <div className="py-4 flex flex-col items-center gap-1.5 bg-surface-raised/60 w-full border-b border-[var(--border-subtle)]">
          <BlobMascot
            shape={shape}
            color={color}
            image={tab === "upload" ? customImage : undefined}
            size={84}
            trackPointer
          />
        </div>

        {/* Tabs: Bot / 随机 / 上传  ---  重置 */}
        <div className="w-full px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab("bot")}
              className={`px-3 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                tab === "bot"
                  ? "bg-surface-raised text-primary"
                  : "text-secondary hover:text-primary"
              }`}
            >
              形象
            </button>
            <button
              type="button"
              onClick={handleRandomize}
              className="px-3 py-1 rounded-full font-medium text-secondary hover:text-primary hover:bg-surface-raised transition-colors cursor-pointer"
            >
              随机
            </button>
            <button
              type="button"
              onClick={() => setTab("upload")}
              className={`px-3 py-1 rounded-full font-medium transition-colors cursor-pointer ${
                tab === "upload"
                  ? "bg-surface-raised text-primary"
                  : "text-secondary hover:text-primary"
              }`}
            >
              上传
            </button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1 rounded-full text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            重置
          </button>
        </div>

        {tab === "bot" ? (
          <div className="p-5 space-y-5 w-full">
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
                      className={`p-1.5 rounded-[var(--r-lg)] transition-transform cursor-pointer ${
                        isSelected
                          ? "ring-2 ring-[var(--border-focus)] bg-surface-raised scale-105"
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
                      className={`p-1.5 rounded-[var(--r-lg)] transition-transform cursor-pointer ${
                        isSelected
                          ? "ring-2 ring-[var(--border-focus)] bg-surface-raised scale-105"
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
                      className={`w-8 h-8 rounded-full transition-transform cursor-pointer ${
                        active
                          ? "ring-2 ring-offset-2 ring-[var(--border-focus)] ring-offset-[var(--surface-overlay)] scale-105"
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
                      className={`w-8 h-8 rounded-full transition-transform cursor-pointer ${
                        active
                          ? "ring-2 ring-offset-2 ring-[var(--border-focus)] ring-offset-[var(--surface-overlay)] scale-105"
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
          <div className="p-6 text-center space-y-4 w-full">
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
              className="w-full py-8 rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-strong)] hover:bg-surface-raised text-[12px] text-secondary transition-colors cursor-pointer"
            >
              {customImage ? "✓ 已选择图片，点击更换" : "点击上传本地图片作为头像"}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="w-full px-5 py-3.5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-surface-raised/50">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={() => void handleConfirm()}
          >
            {saving ? "保存中..." : "完成"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
