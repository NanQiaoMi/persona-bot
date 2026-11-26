"use client";

import { useState } from "react";
import type { BotCreatedCard } from "@/lib/storage/types";
import BlobMascot from "./BlobMascot";
import type { MascotShapeId } from "./mascot-palette";

/** 角色列表变了（建好 / 撤销）：工作台监听这个事件刷新侧栏和群列表 */
export const PERSONAS_CHANGED_EVENT = "personabot:personas-changed";

/**
 * 主 bot 在对话里建好新 Bot 后留下的卡片：去聊天 / 撤销。
 * exists=false 表示这个角色已经不在了（被撤销或删掉）。
 */
export default function BotCreatedCardView({
  card,
  exists,
  onOpen,
}: {
  card: BotCreatedCard;
  exists: boolean;
  onOpen?: (slug: string) => void;
}) {
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const gone = undone || !exists;

  const handleUndo = async () => {
    if (undoing || gone) return;
    if (!window.confirm(`撤销后会删除「${card.name}」和 TA 的聊天记录，确定吗？`)) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(card.slug)}`, { method: "DELETE" });
      if (res.ok) {
        setUndone(true);
        window.dispatchEvent(new Event(PERSONAS_CHANGED_EVENT));
      }
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="mt-1 w-full max-w-[320px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-composer)] px-4 py-3">
      <div className="flex items-center gap-3">
        <BlobMascot
          shape={(card.shape as MascotShapeId) || "circle"}
          color={card.color || "#1683FF"}
          size={36}
          trackPointer={false}
          animated={false}
          className={gone ? "opacity-40 grayscale" : ""}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
            新 Bot · {card.name}
          </div>
          <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)] truncate">
            {card.personality || "性格还没写，可以在资料库里慢慢补"}
          </div>
          {card.appearance && (
            <div className="text-[11px] text-[var(--text-muted)] truncate">外貌：{card.appearance}</div>
          )}
        </div>
      </div>
      {gone ? (
        <div className="mt-2 text-[12px] text-[var(--text-muted)]">已撤销</div>
      ) : (
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onOpen?.(card.slug)}
            className="text-[12px] font-medium text-[var(--accent,#1683FF)] hover:underline cursor-pointer"
          >
            {card.joinedGroupId ? "单聊 TA ›" : "去聊天 ›"}
          </button>
          <button
            type="button"
            disabled={undoing}
            onClick={() => void handleUndo()}
            className="text-[11.5px] text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-50 cursor-pointer"
          >
            {undoing ? "撤销中…" : "撤销"}
          </button>
        </div>
      )}
    </div>
  );
}
