"use client";

import { useState } from "react";
import { PageArtifactCardData } from "@/lib/storage/types";

interface PageArtifactCardProps {
  card: PageArtifactCardData;
}

function MiniChartIcon() {
  return (
    <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-end justify-center gap-0.5 p-1.5 shrink-0">
      <span className="w-1 h-2 rounded-sm bg-emerald-500" />
      <span className="w-1 h-3.5 rounded-sm bg-rose-500" />
      <span className="w-1 h-2.5 rounded-sm bg-sky-500" />
      <span className="w-1 h-4 rounded-sm bg-amber-500" />
    </div>
  );
}

export default function PageArtifactCard({ card }: PageArtifactCardProps) {
  const [openReader, setOpenReader] = useState(false);

  const toneColor = (tone?: string) => {
    if (tone === "amber") return "text-amber-600 dark:text-amber-400";
    if (tone === "teal") return "text-[#18a999]";
    if (tone === "rose") return "text-rose-500";
    return "text-[var(--text-secondary)]";
  };

  return (
    <>
      <div
        onClick={() => setOpenReader(true)}
        className="mt-2.5 w-full max-w-[660px] rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card overflow-hidden cursor-pointer hover:border-[var(--border-strong)] transition-all"
      >
        <div className="p-5 pb-4 space-y-4">
          {/* Card Title & Subtitle */}
          <div className="space-y-1.5">
            <h4 className="text-[17px] font-bold tracking-tight text-[var(--text-primary)]">
              {card.title}
            </h4>
            <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
              {card.subtitle}
            </p>
          </div>

          {/* 4-Column KPI / Insight Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {card.metrics.map((m, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                  {m.value}
                </div>
                <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                  {m.label}
                </div>
                <div
                  className={`text-[10.5px] leading-snug line-clamp-2 ${toneColor(
                    m.tone
                  )}`}
                >
                  {m.detail}
                </div>
              </div>
            ))}
          </div>

          {/* Soft Status Bar */}
          {card.statusNotice && (
            <div className="px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
              <span>⚠</span>
              <span className="truncate">{card.statusNotice}</span>
            </div>
          )}
        </div>

        {/* Footer Page Bar */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MiniChartIcon />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                {card.title}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {card.footerLabel || "页面"}
              </div>
            </div>
          </div>
          <span className="text-[11px] text-[var(--text-muted)] shrink-0">
            点击展开 →
          </span>
        </div>
      </div>

      {/* Full Page Reader Modal */}
      {openReader && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpenReader(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[84vh] rounded-3xl bg-[var(--bg-composer)] border border-[var(--border-strong)] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <MiniChartIcon />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Grok Bot 结构化情报页面
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenReader(false)}
                className="w-8 h-8 rounded-full hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-secondary)]"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                {card.metrics.map((m, idx) => (
                  <div key={idx}>
                    <div className="text-lg font-bold text-[var(--text-primary)]">
                      {m.value}
                    </div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      {m.label}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${toneColor(m.tone)}`}>
                      {m.detail}
                    </div>
                  </div>
                ))}
              </div>

              <div className="whitespace-pre-wrap leading-relaxed text-[13.5px] text-[var(--text-primary)]">
                {card.fullContent || card.subtitle}
              </div>

              {card.sources && card.sources.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-xs font-semibold text-[var(--text-secondary)]">
                    引用来源 ({card.sources.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {card.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="p-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] transition-colors block"
                      >
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          [{i + 1}] {s.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-1">
                          {s.snippet}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
