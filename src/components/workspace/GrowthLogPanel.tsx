"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, FieldTextarea } from "@/components/primitives";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { capturePositions, playFlip } from "@/lib/motion/flip";
import type { LearnedItem, LearnedStatus } from "@/lib/persona/spec";

interface GrowthLogPanelProps {
  slug: string;
  /** persona 更新时间变化时重新拉取（例如自进化或纠偏后） */
  refreshKey?: string;
  onChanged?: () => Promise<void> | void;
}

interface GrowthData {
  learned: LearnedItem[];
  averageQuality: number | null;
  recentQuality: number[];
  pendingSignals: number;
}

const KIND_LABEL: Record<LearnedItem["kind"], string> = {
  habit: "相处习惯",
  style: "说话方式",
  correction: "你的纠偏",
};

const SOURCE_LABEL: Record<LearnedItem["source"], string> = {
  llm: "对话复盘",
  heuristic: "规则观察",
  "user-correction": "你纠正的",
  "user-edit": "你写的",
  migrated: "早期习得",
};

const GROUPS: Array<{ status: LearnedStatus; title: string; hint: string }> = [
  { status: "trial", title: "试用中", hint: "先试 6 轮，聊得更好才保留" },
  { status: "active", title: "生效中", hint: "已通过试用，会随对话继续调整" },
  { status: "locked", title: "已锁定", hint: "你确认过的，不会被自动改掉" },
  { status: "retired", title: "已撤下", hint: "效果不好或被你撤销，可随时恢复" },
];

const TRIAL_TURNS = 6;

export default function GrowthLogPanel({ slug, refreshKey, onChanged }: GrowthLogPanelProps) {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const reducedMotion = useReducedMotion();

  const learnedLayoutKey = (data?.learned || [])
    .map((it) => `${it.id}:${it.status}`)
    .join("|");

  useLayoutEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;
    const finalRects = capturePositions(container);
    if (prevRectsRef.current.size > 0) {
      playFlip(container, prevRectsRef.current, { reducedMotion });
    }
    prevRectsRef.current = finalRects;
  }, [learnedLayoutKey, showRetired, reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/personas/${encodeURIComponent(slug)}/learned`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json?.success) return;
        setData({
          learned: json.learned || [],
          averageQuality: json.averageQuality ?? null,
          recentQuality: json.recentQuality || [],
          pendingSignals: json.pendingSignals ?? 0,
        });
      })
      .catch(() => {
        if (!cancelled) setError("成长日志加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, refreshKey]);

  const act = async (id: string, action: string, text?: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(slug)}/learned`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, text }),
      });
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error || "操作失败");
        return;
      }
      setData((prev) => ({
        learned: json.learned || [],
        averageQuality: json.averageQuality ?? prev?.averageQuality ?? null,
        recentQuality: json.recentQuality || [],
        pendingSignals: json.pendingSignals ?? 0,
      }));
      setEditingId(null);
      if (action === "lock" || action === "restore" || action === "edit") {
        setHighlightedId(id);
        setTimeout(() => {
          setHighlightedId((curr) => (curr === id ? null : curr));
        }, 950);
      }
      await onChanged?.();
    } catch {
      setError("网络异常，稍后再试");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-[var(--r-lg)] border border-dashed border-[var(--border-subtle)] text-center text-[12px] text-muted">
        正在翻成长日志...
      </div>
    );
  }

  const learned = data?.learned || [];
  const counts = GROUPS.reduce<Record<string, number>>((acc, g) => {
    acc[g.status] = learned.filter((it) => it.status === g.status).length;
    return acc;
  }, {});

  return (
    <div ref={listContainerRef} className="space-y-3">
      <div className="p-3.5 rounded-[var(--r-lg)] bg-surface-base border border-[var(--border-subtle)] grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[16px] font-semibold text-primary">
            {data?.averageQuality ?? "—"}
          </div>
          <div className="text-[11px] text-muted">最近回复质量</div>
        </div>
        <div>
          <div className="text-[16px] font-semibold text-primary">
            {counts.active + counts.locked}
          </div>
          <div className="text-[11px] text-muted">在用的规则</div>
        </div>
        <div>
          <div className="text-[16px] font-semibold text-primary">{counts.trial}</div>
          <div className="text-[11px] text-muted">试用中</div>
        </div>
      </div>

      {data && data.pendingSignals > 0 && (
        <div className="px-3 py-2 rounded-[var(--r-md)] bg-surface-raised text-[11px] text-secondary">
          最近收到 {data.pendingSignals} 次不满意的反馈，再聊几句 TA 会复盘一下自己的说话方式
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-[var(--r-md)] bg-danger-soft text-[11px] text-danger">{error}</div>
      )}

      {learned.length === 0 && (
        <div className="p-4 rounded-[var(--r-lg)] border border-dashed border-[var(--border-subtle)] text-center text-[12px] text-muted">
          还没有学到新东西，多聊几轮或在聊天气泡上右键「不像 TA」
        </div>
      )}

      {GROUPS.map((group) => {
        const items = learned
          .filter((it) => it.status === group.status)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (items.length === 0) return null;
        const collapsed = group.status === "retired" && !showRetired;
        return (
          <div key={group.status} className="space-y-2">
            <button
              type="button"
              onClick={() => group.status === "retired" && setShowRetired((v) => !v)}
              className={`w-full flex items-baseline justify-between text-[11px] text-muted ${
                group.status === "retired" ? "cursor-pointer hover:text-primary" : "cursor-default"
              }`}
            >
              <span>
                {group.title} ({items.length}) · {group.hint}
              </span>
              {group.status === "retired" && <span>{showRetired ? "收起" : "展开"}</span>}
            </button>

            {!collapsed &&
              items.map((item) => {
                const busy = busyId === item.id;
                const editing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    data-flip-id={item.id}
                    className={`p-3 rounded-[var(--r-lg)] bg-surface-base border border-[var(--border-subtle)] space-y-1.5 ${
                      item.status === "retired" ? "opacity-60" : ""
                    } ${highlightedId === item.id ? "animate-highlight-pulse" : ""}`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="px-1.5 py-0.5 rounded-[var(--r-sm)] bg-surface-raised text-secondary">
                        {KIND_LABEL[item.kind]}
                      </span>
                      <span>{SOURCE_LABEL[item.source]}</span>
                      {item.hitCount > 1 && <span>· 印证 {item.hitCount} 次</span>}
                      {item.status === "trial" && (
                        <span className="ml-auto">
                          试用 {item.trialTurns || 0}/{TRIAL_TURNS}
                        </span>
                      )}
                    </div>

                    {editing ? (
                      <div className="space-y-1.5">
                        <FieldTextarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          autoFocus
                          className="text-[12px]"
                        />
                        <div className="flex gap-1.5 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy || editText.trim().length < 2}
                            onClick={() => void act(item.id, "edit", editText)}
                          >
                            保存并锁定
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[13px] leading-relaxed text-primary">
                        {item.text}
                      </div>
                    )}

                    {item.status === "retired" && item.retiredReason && (
                      <div className="text-[11px] text-muted">撤下原因：{item.retiredReason}</div>
                    )}

                    {!editing && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {item.status === "retired" ? (
                          <ActionButton disabled={busy} onClick={() => void act(item.id, "restore")}>
                            恢复
                          </ActionButton>
                        ) : (
                          <>
                            {item.status === "locked" ? (
                              <ActionButton disabled={busy} onClick={() => void act(item.id, "unlock")}>
                                解锁
                              </ActionButton>
                            ) : (
                              <ActionButton disabled={busy} onClick={() => void act(item.id, "lock")}>
                                {item.status === "trial" ? "直接保留" : "锁定"}
                              </ActionButton>
                            )}
                            <ActionButton
                              disabled={busy}
                              onClick={() => {
                                setEditingId(item.id);
                                setEditText(item.text);
                              }}
                            >
                              编辑
                            </ActionButton>
                            <ActionButton disabled={busy} onClick={() => void act(item.id, "retire")}>
                              撤销
                            </ActionButton>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-[11px] bg-surface-raised hover:bg-[var(--bg-hover)] text-secondary disabled:opacity-40 transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}
