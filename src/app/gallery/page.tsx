"use client";

import Link from "next/link";
import LineIcon from "@/components/workspace/LineIcon";
import { useEffect, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode, PersonaSummary } from "@/lib/storage/types";

export default function GalleryPage() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "preset" | "custom">("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchPersonas = async () => {
      try {
        const res = await fetch("/api/personas");
        const data = await res.json();
        if (active && data.success) {
          setPersonas(data.personas || []);
        }
      } catch (err) {
        console.error("Failed to load personas:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPersonas();
    return () => {
      active = false;
    };
  }, []);

  const handleExportMarkdown = async (slug: string, name: string) => {
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!data.success || !data.persona) return;
      const p = data.persona;
      const bundle = `# ${p.name} (${p.slug}) — PersonaBot v2.0 角色灵魂包\n\n## 全息画像\n${p.aiProfileMd}\n\n---\n\n${p.personaMd}\n\n---\n\n${p.memoriesMd}\n`;
      const blob = new Blob([bundle], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}-${slug}-persona.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const handleDelete = async (slug: string, name: string) => {
    if (!confirm(`确定要删除角色「${name}」吗？`)) return;
    setDeleting(slug);
    try {
      const res = await fetch(
        `/api/persona/delete?slug=${encodeURIComponent(slug)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setPersonas((prev) => prev.filter((p) => p.slug !== slug));
      }
    } finally {
      setDeleting(null);
    }
  };

  const filtered = personas.filter((p) => {
    if (filter === "preset" && !p.isPreset) return false;
    if (filter === "custom" && p.isPreset) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-tertiary)] hover:bg-white/10 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            ← 返回 Grok 工作台
          </Link>
          <div>
            <h1 className="text-base font-bold">
              🪐 角色引力场广场 (Persona Gravity Gallery)
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              开箱即用的 Grok 标杆角色与你蒸馏的专属真人灵魂，支持一键导出 Markdown 角色卡
            </p>
          </div>
        </div>

        <Link
          href="/create"
          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20"
        >
          + 蒸馏 / 创建新角色
        </Link>
      </header>

      <div className="max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Filter Bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {[
              { id: "all", label: `全部角色 (${personas.length})` },
              {
                id: "preset",
                label: `Grok 标杆角色 (${personas.filter((p) => p.isPreset).length})`,
              },
              {
                id: "custom",
                label: `我的专属蒸馏 (${personas.filter((p) => !p.isPreset).length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() =>
                  setFilter(tab.id as "all" | "preset" | "custom")
                }
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  filter === tab.id
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                    : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="py-24 text-center text-xs text-[var(--text-muted)]">
            正在加载角色引力场...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => {
              const modeSpec =
                PERSONA_MODES[(p.defaultMode as PersonaMode) || "authentic"] ||
                PERSONA_MODES.authentic;
              const tags = p.profile?.personalityTags || [];

              return (
                <div
                  key={p.slug}
                  className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-strong)] flex items-center justify-center text-2xl">
                          {p.profile?.avatarEmoji || p.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm">{p.name}</h3>
                            {p.isPreset && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                                Grok 标杆
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--text-secondary)]">
                            {p.profile?.mbti && <span>{p.profile.mbti}</span>}
                            <span>·</span>
                            <span>
                              <LineIcon name={modeSpec.icon} size={12} className="inline -mt-0.5 mr-1" />{modeSpec.shortLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-rose-400 font-semibold">
                        ♥ {p.intimacy || 65}%
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {p.profile?.bio || "拥有完整五层性格结构与共同记忆的拟人角色"}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <Link
                      href={`/chat/${p.slug}`}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs text-center transition-all"
                    >
                      进入对话 →
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleExportMarkdown(p.slug, p.name)}
                      className="px-3 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-white/10 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]"
                      title="导出 Markdown 角色卡"
                    >
                      导出 .md
                    </button>

                    {!p.isPreset && (
                      <button
                        type="button"
                        disabled={deleting === p.slug}
                        onClick={() => handleDelete(p.slug, p.name)}
                        className="px-2.5 py-2 rounded-xl bg-[var(--bg-tertiary)] hover:bg-rose-500/20 text-xs text-[var(--text-muted)] hover:text-rose-300"
                        title="删除角色"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
