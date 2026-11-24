"use client";

import { useState } from "react";
import { Modal } from "@/components/primitives";
import { PageArtifactCardData } from "@/lib/storage/types";

interface PageArtifactCardProps {
  card: PageArtifactCardData;
}

function MiniChartIcon() {
  return (
    <div className="w-8 h-8 rounded-[var(--r-md)] bg-surface-raised border border-[var(--border-subtle)] flex items-end justify-center gap-0.5 p-1.5 shrink-0">
      <span className="w-1 h-2 rounded-sm bg-brand" />
      <span className="w-1 h-3.5 rounded-sm bg-danger" />
      <span className="w-1 h-2.5 rounded-sm bg-info" />
      <span className="w-1 h-4 rounded-sm bg-warning" />
    </div>
  );
}

export default function PageArtifactCard({ card }: PageArtifactCardProps) {
  const [openReader, setOpenReader] = useState(false);

  const toneColor = (tone?: string) => {
    if (tone === "amber") return "text-warning";
    if (tone === "teal") return "text-brand";
    if (tone === "rose") return "text-danger";
    return "text-secondary";
  };

  return (
    <>
      <div
        onClick={() => setOpenReader(true)}
        className="group/card mt-3 w-full max-w-[660px] rounded-[var(--r-xl)] bg-surface-base border border-[var(--border-subtle)] shadow-raised overflow-hidden cursor-pointer hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-transform transition-colors duration-[var(--motion-base)] animate-msg-spring"
      >
        {/* Subtle top accent bar */}
        <div className="h-[2px] w-full bg-gradient-to-r from-[var(--brand)]/60 via-[var(--sem-info)]/40 to-[var(--accent-violet)]/50 opacity-70" />

        <div className="p-5 pb-4 space-y-4">
          <div className="space-y-1.5">
            <h4 className="text-[16px] font-bold tracking-tight text-primary group-hover/card:text-brand transition-colors">
              {card.title}
            </h4>
            <p className="text-[13px] text-secondary leading-relaxed line-clamp-2">
              {card.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-1">
            {card.metrics.map((m, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="text-[20px] font-bold tracking-tight tabular-nums text-primary">
                  {m.value}
                </div>
                <div className="text-[11px] font-semibold text-primary">
                  {m.label}
                </div>
                <div
                  className={`text-[11px] leading-snug line-clamp-2 ${toneColor(
                    m.tone
                  )}`}
                >
                  {m.detail}
                </div>
              </div>
            ))}
          </div>

          {card.statusNotice && (
            <div className="px-3 py-2 rounded-[var(--r-md)] bg-warning-soft border border-[var(--sem-warning)]/20 text-[11px] text-muted flex items-center gap-1.5">
              <span>⚠</span>
              <span className="truncate">{card.statusNotice}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-surface-raised/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MiniChartIcon />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-primary truncate">
                {card.title}
              </div>
              <div className="text-[11px] text-muted">
                {card.footerLabel || "页面"}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium text-muted group-hover/card:text-brand group-hover/card:translate-x-0.5 transition-[transform,color] duration-[var(--motion-fast)] shrink-0">
            展开阅读 →
          </span>
        </div>
      </div>

      <Modal
        isOpen={openReader}
        onClose={() => setOpenReader(false)}
        size="lg"
        title={card.title}
        description="Grok Bot 结构化情报页面"
        bodyClassName="p-6 space-y-5 text-[14px]"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-[var(--r-lg)] bg-surface-raised border border-[var(--border-subtle)]">
          {card.metrics.map((m, idx) => (
            <div key={idx}>
              <div className="text-[16px] font-bold tabular-nums text-primary">
                {m.value}
              </div>
              <div className="text-[12px] font-semibold text-primary">
                {m.label}
              </div>
              <div className={`text-[11px] mt-0.5 ${toneColor(m.tone)}`}>
                {m.detail}
              </div>
            </div>
          ))}
        </div>

        <div className="whitespace-pre-wrap leading-relaxed text-[14px] text-primary">
          {card.fullContent || card.subtitle}
        </div>

        {card.sources && card.sources.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="text-[12px] font-semibold text-secondary">
              引用来源 ({card.sources.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {card.sources.map((s, i) => (
                <a
                  key={i}
                  href={s.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-[var(--r-md)] bg-surface-raised hover:bg-surface-sunken border border-[var(--border-subtle)] transition-colors block"
                >
                  <div className="text-[12px] font-semibold text-primary truncate">
                    [{i + 1}] {s.title}
                  </div>
                  <div className="text-[11px] text-secondary line-clamp-2 mt-1">
                    {s.snippet}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
