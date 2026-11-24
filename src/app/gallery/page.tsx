"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { describeRequestError, useFeedback } from "@/components/feedback/FeedbackProvider";
import { Button, Card, Chip, Skeleton } from "@/components/primitives";
import BlobMascot, { getMascotConfigForPersona } from "@/components/workspace/BlobMascot";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode, PersonaSummary } from "@/lib/storage/types";

export default function GalleryPage() {
  const { toast, confirm } = useFeedback();
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
        if (active) {
          toast("角色列表没加载出来", {
            tone: "error",
            description: describeRequestError(err),
            action: { label: "刷新页面", onClick: () => window.location.reload() },
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchPersonas();
    return () => {
      active = false;
    };
  }, [toast]);

  const handleExportMarkdown = async (slug: string, name: string) => {
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!data.success || !data.persona) throw new Error("HTTP 404");
      const p = data.persona;
      const bundle = `# ${p.name} (${p.slug}) — 角色档案\n\n## 全息画像\n${p.aiProfileMd}\n\n---\n\n${p.personaMd}\n\n---\n\n${p.memoriesMd}\n`;
      const blob = new Blob([bundle], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}-${slug}-persona.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`已导出「${name}」`, { tone: "success" });
    } catch (err) {
      toast("导出失败", { tone: "error", description: describeRequestError(err) });
    }
  };

  const handleDelete = async (slug: string, name: string) => {
    const ok = await confirm({
      title: `删除「${name}」？`,
      description: "角色设定、记忆和聊天记录都会一起删除，删除后无法恢复。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    setDeleting(slug);
    try {
      const res = await fetch(
        `/api/persona/delete?slug=${encodeURIComponent(slug)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setPersonas((prev) => prev.filter((p) => p.slug !== slug));
        toast(`已删除「${name}」`, { tone: "success" });
      } else {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      toast("删除失败", { tone: "error", description: describeRequestError(err) });
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
    <div className="min-h-screen bg-surface-base text-primary flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] bg-surface-overlay backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-full bg-surface-raised hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-secondary hover:text-primary transition-colors shrink-0"
            >
              ← 返回工作台
            </Link>
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-primary truncate">角色广场</h1>
              <p className="text-[12px] text-muted truncate">
                管理预设角色与你创建的角色，支持直接进入对话或导出档案
              </p>
            </div>
          </div>

          <Link
            href="/create"
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-brand hover:bg-brand-hover text-white font-medium text-[13px] transition-colors shrink-0"
          >
            + 创建角色
          </Link>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Filter Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { id: "all", label: `全部角色 (${personas.length})` },
            {
              id: "preset",
              label: `预设角色 (${personas.filter((p) => p.isPreset).length})`,
            },
            {
              id: "custom",
              label: `我的角色 (${personas.filter((p) => !p.isPreset).length})`,
            },
          ].map((tab) => (
            <Chip
              key={tab.id}
              selected={filter === tab.id}
              onClick={() => setFilter(tab.id as "all" | "preset" | "custom")}
            >
              {tab.label}
            </Chip>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Card key={idx} variant="flat" padding="lg" className="space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton variant="circle" className="w-12 h-12 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-2/3 h-4" />
                    <Skeleton className="w-1/2 h-3" />
                  </div>
                </div>
                <Skeleton className="w-full h-3" />
                <Skeleton className="w-4/5 h-3" />
                <Skeleton className="w-full h-9 rounded-full" />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card variant="flat" padding="lg" className="text-center py-12 space-y-3">
            <div className="text-[14px] font-semibold text-primary">
              {filter === "custom" ? "还没有你自己创建的角色" : "暂时没有符合筛选条件的角色"}
            </div>
            <p className="text-[12px] text-muted max-w-md mx-auto">
              可以通过 3 步快速设定或导入真实聊天记录，几秒内生成拥有独立语气和记忆的新角色。
            </p>
            <div className="pt-2">
              <Link
                href="/create"
                className="inline-flex items-center justify-center h-9 px-5 rounded-full bg-brand hover:bg-brand-hover text-white font-medium text-[13px] transition-colors"
              >
                去创建第一个角色
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p, idx) => {
              const modeSpec =
                PERSONA_MODES[(p.defaultMode as PersonaMode) || "authentic"] ||
                PERSONA_MODES.authentic;
              const tags = p.profile?.personalityTags || [];
              const mascot = getMascotConfigForPersona(p.slug, p.profile, idx);

              return (
                <Card
                  key={p.slug}
                  variant="flat"
                  padding="lg"
                  className="hover:border-[var(--border-strong)] transition-colors flex flex-col justify-between space-y-4 bg-surface-base"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-[var(--r-lg)] bg-surface-raised border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                          <BlobMascot
                            shape={mascot.shape}
                            color={mascot.color}
                            image={mascot.image}
                            size={34}
                            trackPointer={false}
                            animated={false}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-[14px] text-primary truncate">
                              {p.name}
                            </h3>
                            {p.isPreset && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-brand font-medium shrink-0">
                                预设
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-secondary">
                            {p.profile?.mbti && <span>{p.profile.mbti}</span>}
                            {p.profile?.mbti && <span>·</span>}
                            <span>
                              {modeSpec.badge} {modeSpec.shortLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[12px] text-danger font-semibold tabular-nums shrink-0">
                        ♥ {p.intimacy || 65}%
                      </span>
                    </div>

                    <p className="text-[12px] text-secondary line-clamp-2 leading-relaxed">
                      {p.profile?.bio || "拥有完整五层人格结构与共同记忆的拟人角色"}
                    </p>

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-0.5 rounded-full bg-surface-raised border border-[var(--border-subtle)] text-[11px] text-secondary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <Link
                      href={`/chat/${p.slug}`}
                      className="flex-1 h-9 rounded-full bg-brand hover:bg-brand-hover text-white font-medium text-[13px] inline-flex items-center justify-center transition-colors"
                    >
                      进入对话
                    </Link>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleExportMarkdown(p.slug, p.name)}
                      title="导出角色档案 (.md)"
                    >
                      导出
                    </Button>

                    {!p.isPreset && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deleting === p.slug}
                        loading={deleting === p.slug}
                        onClick={() => void handleDelete(p.slug, p.name)}
                        className="text-muted hover:text-danger hover:bg-danger-soft"
                        title="删除角色"
                      >
                        删除
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
