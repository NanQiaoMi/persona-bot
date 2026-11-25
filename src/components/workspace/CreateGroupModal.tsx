"use client";

import { useEffect, useMemo, useState } from "react";
import { PersonaSummary } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";

interface CreateGroupModalProps {
  open: boolean;
  personas: PersonaSummary[];
  onClose: () => void;
  onCreate: (input: {
    name: string;
    memberSlugs: string[];
    topic?: string;
  }) => Promise<void>;
}

/** 未填群名时，用成员名自动拼一个群名，例如「陆汐、沈知的群」 */
function buildDefaultGroupName(names: string[]): string {
  if (names.length === 0) return "新群聊";
  if (names.length <= 3) return `${names.join("、")}的群`;
  return `${names.slice(0, 2).join("、")}等${names.length}人的群`;
}

export default function CreateGroupModal({
  open,
  personas,
  onClose,
  onCreate,
}: CreateGroupModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedPersonas = useMemo(
    () => personas.filter((p) => selected.includes(p.slug)),
    [personas, selected]
  );
  const defaultName = buildDefaultGroupName(
    selectedPersonas.map((p) => p.name)
  );
  const canCreate = selected.length >= 2 && !submitting;

  // Esc 关闭弹窗（hook 必须在 open 判断之前调用）
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const toggle = (slug: string) => {
    setError("");
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setSubmitting(true);
    setError("");
    try {
      await onCreate({
        name: name.trim() || defaultName,
        memberSlugs: selected,
        topic: topic.trim() || undefined,
      });
      setSelected([]);
      setName("");
      setTopic("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "建群失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm px-4 animate-fade-in"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-[440px] rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            发起群聊
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

        <div className="px-6 pb-6 pt-2 flex flex-col">
          {/* Member list */}
          <p className="text-[12px] text-[var(--text-muted)] mb-2">
            选择至少 2 个角色（已选 {selected.length}）
          </p>
          <div className="max-h-[280px] overflow-y-auto space-y-1 pr-1">
            {personas.map((p, index) => {
              const isSelected = selected.includes(p.slug);
              const cfg = getMascotConfigForPersona(
                p.slug,
                p.profile,
                index
              );
              return (
                <button
                  key={p.slug}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggle(p.slug)}
                  className={`w-full text-left px-3 py-2 rounded-[16px] flex items-center gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[var(--bg-hover)] ring-1 ring-[var(--border-strong)]"
                      : "hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <BlobMascot
                    shape={cfg.shape}
                    color={cfg.color}
                    image={cfg.image}
                    size={36}
                    trackPointer={false}
                    animated={false}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate">
                      {p.name}
                    </div>
                    {p.profile.occupation && (
                      <div className="text-[11.5px] text-[var(--text-secondary)] truncate">
                        {p.profile.occupation}
                      </div>
                    )}
                  </div>
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] shrink-0 ${
                      isSelected
                        ? "bg-[var(--text-primary)] border-[var(--text-primary)] text-[var(--bg-primary)]"
                        : "border-[var(--border-strong)] text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </button>
              );
            })}
          </div>

          {/* Optional fields */}
          <div className="mt-4 space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`群名（可选，默认：${defaultName}）`}
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
            />
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="话题（可选，比如：周末去哪玩）"
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          {error && <p className="mt-2 text-[12px] text-rose-500">{error}</p>}

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={() => void handleCreate()}
              className={`px-5 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                canCreate
                  ? "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 cursor-pointer"
                  : "bg-[var(--bg-secondary)] text-[var(--text-muted)] opacity-60 cursor-not-allowed"
              }`}
            >
              {submitting ? "建群中…" : "建群"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
