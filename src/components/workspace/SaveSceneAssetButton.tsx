"use client";

import { useState } from "react";
import { SceneAssetCategory } from "@/lib/storage/types";

interface SaveSceneAssetButtonProps {
  slug: string;
  imageUrl: string;
  defaultName?: string;
  defaultDescription?: string;
}

export default function SaveSceneAssetButton({
  slug,
  imageUrl,
  defaultName = "我的常去场景",
  defaultDescription,
}: SaveSceneAssetButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName.slice(0, 18));
  const [category, setCategory] = useState<SceneAssetCategory>("room");
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSavedNotice(null);
    try {
      const res = await fetch(
        `/api/personas/${encodeURIComponent(slug)}/assets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_existing",
            name: name.trim() || "固定场景",
            category,
            imageUrl,
            description: defaultDescription,
          }),
        }
      );
      const data = await res.json();
      if (data?.success) {
        setSavedNotice("✓ 已固定为场景资产");
        setOpen(false);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("personabot:assets-updated", { detail: { slug } })
          );
        }
      } else {
        setSavedNotice(data?.error || "保存失败");
      }
    } catch {
      setSavedNotice("保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (savedNotice && !open) {
    return (
      <span className="px-2.5 py-1 rounded-full bg-emerald-500/80 text-white font-medium">
        {savedNotice}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(defaultName.slice(0, 18) || "固定场景");
          setOpen((v) => !v);
        }}
        className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white font-medium transition-colors cursor-pointer"
      >
        🏠 存为场景资产
      </button>

      {open && (
        <div className="w-full flex flex-wrap items-center justify-center gap-1.5 pt-1.5 border-t border-white/15">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="场景名（如：我的卧室）"
            className="px-2.5 py-1 rounded-full bg-white/15 text-white placeholder-white/60 text-xs focus:outline-none w-36"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SceneAssetCategory)}
            className="px-2 py-1 rounded-full bg-white/15 text-white text-xs focus:outline-none cursor-pointer"
          >
            <option value="room" className="text-black">
              房间
            </option>
            <option value="location" className="text-black">
              地点
            </option>
            <option value="environment" className="text-black">
              环境
            </option>
          </select>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-2.5 py-1 rounded-full bg-[#18a999] hover:bg-[#159385] text-white font-medium cursor-pointer disabled:opacity-50"
          >
            {saving ? "保存中..." : "固定"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer"
          >
            取消
          </button>
        </div>
      )}
    </>
  );
}
