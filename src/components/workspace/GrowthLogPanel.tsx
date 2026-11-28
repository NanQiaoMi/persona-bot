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
      <div className="space-y-3 animate-fade-in">
        <div className="p-3.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] grid grid-cols-3 divide-x divide-[var(--border-hairline,var(--border-subtle))]">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="px-2 flex flex-col items-center gap-1.5">
              <div className="h-4 w-8 rounded-full bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
              <div className="h-2.5 w-12 rounded-full bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
            </div>
          ))}
        </div>
        <div className="p-4 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] text-center text-[11px] text-[var(--text-muted)]">
          正在翻成长日志…
        </div>
      </div>
    );
  }

  const learned = data?.learned || [];
  const counts = GROUPS.reduce<Record<string, number>>((acc, g) => {
    acc[g.status] = learned.filter((it) => it.status === g.status).length;
    return acc;
  }, {});

  return (
    <div className="space-y-3 min-w-0">
      <div className="p-3.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] grid grid-cols-3 divide-x divide-[var(--border-hairline,var(--border-subtle))] text-center">
        <div className="px-1 min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--text-primary)]">
            {data?.averageQuality ?? "—"}
          </div>
          <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5 truncate">
            最近回复质量
          </div>
        </div>
        <div className="px-1 min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--text-primary)]">
            {counts.active + counts.locked}
          </div>
          <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5 truncate">
            在用的规则
          </div>
        </div>
        <div className="px-1 min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--text-primary)]">
            {counts.trial}
          </div>
          <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5 truncate">
            试用中
          </div>
        </div>
      </div>

      {data && data.pendingSignals > 0 && (
        <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] text-[11px] text-[var(--text-secondary)] leading-relaxed">
          最近收到 <span className="tabular-nums font-medium text-[var(--text-primary)]">{data.pendingSignals}</span> 次不满意的反馈，再聊几句 TA 会复盘一下自己的说话方式
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {learned.length === 0 && (
        <div className="p-4 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-dashed border-[var(--border-hairline,var(--border-subtle))] text-center text-[11px] text-[var(--text-muted)] leading-relaxed">
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
          <div key={group.status} className="space-y-2 min-w-0">
            <button
              type="button"
              onClick={() => group.status === "retired" && setShowRetired((v) => !v)}
              className={`w-full flex items-center justify-between gap-2 px-0.5 text-[11px] font-medium tracking-[0.01em] text-[var(--text-muted)] ${
                group.status === "retired"
                  ? "cursor-pointer hover:text-[var(--text-primary)] transition-colors duration-150 focus-ring rounded-md"
                  : "cursor-default"
              }`}
            >
              <span className="truncate">
                <span className="text-[var(--text-secondary)]">{group.title}</span>{" "}
                <span className="tabular-nums">({items.length})</span>
                <span className="opacity-75"> · {group.hint}</span>
              </span>
              {group.status === "retired" && (
                <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px]">
                  <span>{showRetired ? "收起" : "展开"}</span>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={`transition-transform duration-150 ${showRetired ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              )}
            </button>

            {!collapsed &&
              items.map((item) => {
                const busy = busyId === item.id;
                const editing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] hover:border-[var(--border-strong)] transition-surface space-y-2 ${
                      item.status === "retired" ? "opacity-65" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-[var(--text-muted)]">
                      <span className="px-2 py-0.5 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[var(--text-secondary)] font-medium">
                        {KIND_LABEL[item.kind]}
                      </span>
                      <span>{SOURCE_LABEL[item.source]}</span>
                      {item.hitCount > 1 && (
                        <span className="tabular-nums">· 印证 {item.hitCount} 次</span>
                      )}
                      {item.status === "trial" && (
                        <span className="ml-auto px-2 py-0.5 rounded-full bg-[#18a999]/10 text-[#18a999] font-medium tabular-nums">
                          试用 {item.trialTurns || 0}/{TRIAL_TURNS}
                        </span>
                      )}
                    </div>

                    {editing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          autoFocus
                          className="w-full p-2.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] focus-within-ring transition-surface"
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded-full text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-interactive focus-ring cursor-pointer"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={busy || editText.trim().length < 2}
                            onClick={() => void act(item.id, "edit", editText)}
                            className="px-3 py-1 rounded-full text-[11px] font-medium bg-[#18a999] hover:bg-[#149688] disabled:opacity-40 text-white transition-interactive focus-ring cursor-pointer"
                          >
                            保存并锁定
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[12px] leading-[1.6] text-[var(--text-primary)] break-words">
                        {item.text}
                      </div>
                    )}

                    {item.status === "retired" && item.retiredReason && (
                      <div className="text-[10.5px] text-[var(--text-muted)] leading-relaxed">
                        撤下原因：{item.retiredReason}
                      </div>
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
      className="px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-interactive focus-ring cursor-pointer"
    >
      {children}
    </button>
  );
}
