"use client";
import { thumbUrl } from "@/lib/media/thumb-url";

import { useEffect, useState } from "react";
import type { WorldEntry, WorldEntryKind } from "@/lib/storage/types";

interface WorldAssetsPanelProps {
  slug: string;
  personaName: string;
  refreshSignal?: number;
}

type WorldAction = "confirm" | "dismiss" | "restore" | "delete" | "edit";

const KIND_ORDER: WorldEntryKind[] = ["place", "pet", "object", "person"];

const KIND_META: Record<WorldEntryKind, { icon: string; label: string }> = {
  place: { icon: "📍", label: "地点" },
  object: { icon: "🎒", label: "物品" },
  pet: { icon: "🐾", label: "宠物" },
  person: { icon: "👤", label: "人物" },
};

interface LoadedState {
  slug: string;
  entries: WorldEntry[];
}

function latestSnippet(entry: WorldEntry): string {
  const sorted = [...(entry.sources ?? [])].sort((a, b) =>
    String(b.at).localeCompare(String(a.at))
  );
  return sorted[0]?.snippet?.trim() ?? "";
}

function KindThumb({ entry }: { entry: WorldEntry }) {
  if (entry.imageUrl) {
    return (
      <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--border-strong)] shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl(entry.imageUrl)}
          alt={entry.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-[var(--bg-composer)] border border-[var(--border-subtle)] flex items-center justify-center text-[18px] shrink-0">
      {KIND_META[entry.kind]?.icon ?? "✨"}
    </div>
  );
}

export default function WorldAssetsPanel({
  slug,
  personaName,
  refreshSignal,
}: WorldAssetsPanelProps) {
  const endpoint = `/api/personas/${encodeURIComponent(slug)}/world`;

  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);

  // 拉取条目：slug 或 refreshSignal 变化时重新读取；忽略过期的响应
  useEffect(() => {
    let cancelled = false;
    fetch(endpoint, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.success && Array.isArray(data.entries)) {
          setLoaded({ slug, entries: data.entries as WorldEntry[] });
          setLoadError(null);
        } else {
          setLoadError(data?.error || "读取世界设定失败");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("网络异常，读取世界设定失败");
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, slug, refreshSignal]);

  // loaded 属于旧 slug 时视为尚未加载，避免切换角色时短暂显示旧数据
  const isCurrent = loaded !== null && loaded.slug === slug;
  const entries: WorldEntry[] = isCurrent ? loaded.entries : [];
  const isLoading = !isCurrent && !loadError;

  async function mutate(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.entries)) {
        setLoaded({ slug, entries: data.entries as WorldEntry[] });
        return true;
      }
      setActionError(data?.error || "操作失败，请稍后重试");
      return false;
    } catch {
      setActionError("网络异常，操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function act(id: string, action: Exclude<WorldAction, "edit">) {
    void mutate({ id, action });
  }

  function remove(entry: WorldEntry) {
    const ok = window.confirm(
      `确定移除「${entry.name}」吗？之后如果又被反复提到，会重新出现在待确认里`
    );
    if (!ok) return;
    void mutate({ id: entry.id, action: "delete" });
  }

  function startEdit(entry: WorldEntry) {
    setActionError(null);
    setEditingId(entry.id);
    setEditName(entry.name);
    setEditDesc(entry.description ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDesc("");
  }

  async function saveEdit(entry: WorldEntry) {
    const name = editName.trim();
    if (!name) {
      setActionError("名称不能为空");
      return;
    }
    const ok = await mutate({
      id: entry.id,
      action: "edit",
      name,
      description: editDesc.trim(),
    });
    if (ok) cancelEdit();
  }

  const candidates = entries
    .filter((e) => e.status === "candidate")
    .sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0));
  const confirmed = entries.filter((e) => e.status === "confirmed");
  const dismissed = entries.filter((e) => e.status === "dismissed");

  const confirmedByKind = KIND_ORDER.map((kind) => ({
    kind,
    items: confirmed.filter((e) => e.kind === kind),
  })).filter((group) => group.items.length > 0);

  const pendingClass =
    "py-1 px-2.5 rounded-lg bg-[#18a999] hover:bg-[#149688] disabled:opacity-50 text-white text-[11px] font-medium cursor-pointer";
  const secondaryClass =
    "py-1 px-2.5 rounded-lg bg-[var(--bg-composer)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] cursor-pointer disabled:opacity-50";
  const linkClass =
    "text-[#18a999] text-[11px] font-medium hover:underline cursor-pointer disabled:opacity-50";
  const inputClass =
    "w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-composer)] border border-[var(--border-subtle)] text-[11px] focus:outline-none";

  return (
    <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[var(--text-primary)]">
          🌍 世界设定
        </span>
        {isCurrent && (
          <span className="text-[10.5px] text-[var(--text-muted)] shrink-0">
            已收录 {confirmed.length} · 待确认 {candidates.length}
          </span>
        )}
      </div>

      <p className="text-[10.5px] text-[var(--text-muted)] leading-relaxed">
        从和 {personaName} 的聊天、朋友圈和照片里自动归纳的地点、物品、宠物和人物；被提到 3 次以上会自动收录，收录后聊天和拍照都会保持一致。
      </p>

      {actionError && (
        <div className="text-[10.5px] text-rose-500 px-1">{actionError}</div>
      )}

      {isLoading && (
        <div className="text-[10.5px] text-[var(--text-muted)] px-1">
          正在读取世界设定…
        </div>
      )}

      {loadError && (
        <div className="text-[10.5px] text-rose-500 px-1">{loadError}</div>
      )}

      {isCurrent && entries.length === 0 && (
        <div className="p-3 rounded-xl border border-dashed border-[var(--border-subtle)] text-center text-[10.5px] text-[var(--text-muted)]">
          还没有归纳出世界设定；多聊几轮、发几条朋友圈后会自动出现在这里
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-[var(--text-primary)]">
            待确认
          </div>
          {candidates.map((entry) => {
            const snippet = latestSnippet(entry);
            return (
              <div
                key={entry.id}
                className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[14px] leading-none mt-0.5 shrink-0">
                    {KIND_META[entry.kind]?.icon ?? "✨"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-[11px] text-[var(--text-primary)] truncate">
                        {entry.name}
                      </span>
                      <span className="text-[9.5px] text-[var(--text-muted)] shrink-0">
                        提到 {entry.mentionCount} 次
                      </span>
                    </div>
                    {entry.description && (
                      <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                        {entry.description}
                      </div>
                    )}
                    {snippet && (
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        “{snippet}”
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(entry.id, "confirm")}
                    className={pendingClass}
                  >
                    收录
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act(entry.id, "dismiss")}
                    className={secondaryClass}
                  >
                    忽略
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmedByKind.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-[var(--text-primary)]">
            已收录
          </div>
          {confirmedByKind.map(({ kind, items }) => (
            <div key={kind} className="space-y-1.5">
              <div className="text-[10px] text-[var(--text-muted)] px-0.5">
                {KIND_META[kind].icon} {KIND_META[kind].label}
              </div>
              {items.map((entry) =>
                editingId === entry.id ? (
                  <div
                    key={entry.id}
                    className="p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1.5"
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="名称"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="描述（可选）"
                      className={inputClass}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit(entry)}
                        className={pendingClass}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={cancelEdit}
                        className={secondaryClass}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={entry.id}
                    className="group flex items-center gap-2.5 p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                  >
                    <KindThumb entry={entry} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                        {entry.name}
                      </div>
                      {entry.description && (
                        <div className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                          {entry.description}
                        </div>
                      )}
                      <div className="text-[9.5px] text-[var(--text-muted)]">
                        提到 {entry.mentionCount} 次
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(entry)}
                        className={linkClass}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(entry)}
                        className="text-rose-500 text-[11px] font-medium hover:underline cursor-pointer disabled:opacity-50"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {dismissed.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowIgnored((v) => !v)}
            className="w-full flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span>已忽略 ({dismissed.length})</span>
            <span>{showIgnored ? "收起" : "展开"}</span>
          </button>
          {showIgnored &&
            dismissed.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
              >
                <span className="text-[11px] text-[var(--text-muted)] truncate">
                  {KIND_META[entry.kind]?.icon ?? "✨"} {entry.name}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(entry.id, "restore")}
                  className={linkClass}
                >
                  恢复
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
