"use client";

import { useEffect, useState } from "react";
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
      await onChanged?.();
    } catch {
      setError("网络异常，稍后再试");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-2xl border border-dashed border-[var(--border-hairline,var(--border-subtle))] text-center text-[11px] text-[var(--text-muted)]">
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
    <div className="space-y-3">
      <div className="p-3.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] grid grid-cols-3 divide-x divide-[var(--border-hairline,var(--border-subtle))] text-center">
        <div className="px-1">
          <div className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
            {data?.averageQuality ?? "—"}
          </div>
          <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">最近回复质量</div>
        </div>
        <div className="px-1">
          <div className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
            {counts.active + counts.locked}
          </div>
          <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">在用的规则</div>
        </div>
        <div className="px-1">
          <div className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">{counts.trial}</div>
          <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">试用中</div>
        </div>
      </div>

      {data && data.pendingSignals > 0 && (
        <div className="px-3 py-2 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[11px] text-[var(--text-secondary)] leading-relaxed">
          最近收到 {data.pendingSignals} 次不满意的反馈，再聊几句 TA 会复盘一下自己的说话方式
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {learned.length === 0 && (
        <div className="p-4 rounded-2xl border border-dashed border-[var(--border-hairline,var(--border-subtle))] text-center text-[11px] text-[var(--text-muted)]">
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
              className={`w-full flex items-baseline justify-between text-[11px] font-medium tracking-[0.02em] text-[var(--text-muted)] ${
                group.status === "retired" ? "cursor-pointer hover:text-[var(--text-primary)] transition-colors duration-150" : "cursor-default"
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
                    className={`p-3 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] transition-colors duration-150 space-y-1.5 ${
                      item.status === "retired" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-muted)]">
                      <span className="px-1.5 py-0.5 rounded-md bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[var(--text-secondary)]">
                        {KIND_LABEL[item.kind]}
                      </span>
                      <span>{SOURCE_LABEL[item.source]}</span>
                      {item.hitCount > 1 && <span>· 印证 {item.hitCount} 次</span>}
                      {item.status === "trial" && (
                        <span className="ml-auto tabular-nums">
                          试用 {item.trialTurns || 0}/{TRIAL_TURNS}
                        </span>
                      )}
                    </div>

                    {editing ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          autoFocus
                          className="w-full p-2 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-xs focus:outline-none focus:border-[var(--border-strong)] transition-colors duration-150"
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded-full text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors duration-150 cursor-pointer"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={busy || editText.trim().length < 2}
                            onClick={() => void act(item.id, "edit", editText)}
                            className="px-2.5 py-1 rounded-full text-[11px] bg-[#18a999] hover:bg-[#149688] disabled:opacity-40 text-white transition-colors duration-150 cursor-pointer"
                          >
                            保存并锁定
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[12.5px] leading-relaxed text-[var(--text-primary)]">
                        {item.text}
                      </div>
                    )}

                    {item.status === "retired" && item.retiredReason && (
                      <div className="text-[10.5px] text-[var(--text-muted)]">撤下原因：{item.retiredReason}</div>
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
      className="px-2.5 py-1 rounded-full text-[11px] bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors duration-150 cursor-pointer"
    >
      {children}
    </button>
  );
}
