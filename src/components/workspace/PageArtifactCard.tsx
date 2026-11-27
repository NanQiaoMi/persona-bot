"use client";

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PageArtifactCardData, SearchResultItem } from "@/lib/storage/types";

interface PageArtifactCardProps {
  card: PageArtifactCardData;
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 整理角色回复用于展示：去掉 Markdown 加粗 / 标题符号；相邻段落里前一段只是后一段的开头（流式重复）时去掉前一段 */
export function tidyPersonaTake(text: string): string {
  const paras = (text || "")
    .replace(/\*\*/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const kept: string[] = [];
  paras.forEach((p, i) => {
    const next = paras[i + 1];
    if (next && next !== p && next.startsWith(p)) return;
    if (kept[kept.length - 1] === p) return;
    kept.push(p);
  });
  return kept.join("\n\n");
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** 要点后面的来源角标：[1] [2]，点击打开对应网页（不触发展开卡片） */
function SourceRefs({ refs, sources }: { refs: number[]; sources: SearchResultItem[] }) {
  if (refs.length === 0) return null;
  return (
    <span className="inline-flex gap-1 ml-1.5 align-middle">
      {refs.map((n) => {
        const src = sources[n - 1];
        if (!src?.url) return null;
        return (
          <a
            key={n}
            href={src.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`${src.title}（${src.source}）`}
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[#18a999] hover:border-[#18a999]/40 transition-colors"
          >
            {n}
          </a>
        );
      })}
    </span>
  );
}

function SearchSummaryCard({ card, onOpen }: { card: PageArtifactCardData; onOpen: () => void }) {
  const sources = card.sources || [];
  const highlights = card.highlights || [];
  const time = formatTime(card.generatedAt);
  const domains = [...new Set(sources.map((s) => s.source).filter(Boolean))];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group/card mt-3 w-full max-w-[600px] rounded-[20px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] overflow-hidden cursor-pointer hover:border-[var(--border-strong)] transition-colors text-left"
    >
      <div className="px-5 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#18a999]">
            <SearchGlyph />
            搜索总结
          </span>
          <span className="tabular-nums">
            {time}
            {sources.length > 0 ? ` · ${sources.length} 个来源` : ""}
          </span>
        </div>

        <div className="space-y-1">
          <h4 className="text-[16px] font-semibold leading-snug text-[var(--text-primary)]">{card.title}</h4>
          {card.lede && (
            <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{card.lede}</p>
          )}
        </div>

        {highlights.length > 0 && (
          <ol className="space-y-2.5 pt-0.5">
            {highlights.map((h, idx) => (
              <li key={idx} className="flex gap-2.5">
                <span className="mt-[3px] shrink-0 w-[18px] h-[18px] rounded-full bg-[#18a999]/12 text-[#18a999] text-[10.5px] font-semibold flex items-center justify-center tabular-nums">
                  {idx + 1}
                </span>
                <div className="min-w-0 text-[13px] leading-relaxed">
                  <span className="font-medium text-[var(--text-primary)]">{h.title}</span>
                  <SourceRefs refs={h.sources} sources={sources} />
                  {h.detail && <div className="text-[12.5px] text-[var(--text-secondary)]">{h.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="px-5 py-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {domains.slice(0, 3).map((d) => (
            <span
              key={d}
              className="shrink-0 max-w-[140px] truncate px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[10.5px] text-[var(--text-muted)]"
            >
              {d}
            </span>
          ))}
          {domains.length > 3 && (
            <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">+{domains.length - 3}</span>
          )}
        </div>
        <span className="shrink-0 text-[11.5px] font-medium text-[var(--text-muted)] group-hover/card:text-[#18a999] transition-colors">
          查看全部 →
        </span>
      </div>
    </div>
  );
}

function SearchSummaryReader({ card }: { card: PageArtifactCardData }) {
  const sources = card.sources || [];
  const highlights = card.highlights || [];
  return (
    <div className="p-6 overflow-y-auto space-y-6 text-sm">
      {card.lede && (
        <p className="text-[14px] leading-relaxed text-[var(--text-primary)] px-4 py-3 rounded-2xl bg-[var(--bg-secondary)]">
          {card.lede}
        </p>
      )}

      {highlights.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-[var(--text-muted)]">要点</h4>
          <ol className="space-y-3">
            {highlights.map((h, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#18a999]/12 text-[#18a999] text-[11px] font-semibold flex items-center justify-center tabular-nums">
                  {idx + 1}
                </span>
                <div className="min-w-0 leading-relaxed">
                  <span className="text-[14px] font-medium text-[var(--text-primary)]">{h.title}</span>
                  <SourceRefs refs={h.sources} sources={sources} />
                  {h.detail && <div className="text-[13px] text-[var(--text-secondary)] mt-0.5">{h.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {card.personaTake && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-[var(--text-muted)]">{card.personaName || "TA"} 的看法</h4>
          <div className="whitespace-pre-wrap leading-relaxed text-[13.5px] text-[var(--text-primary)]">
            {tidyPersonaTake(card.personaTake)}
          </div>
        </section>
      )}

      {sources.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-[var(--text-muted)]">来源（{sources.length}）</h4>
          <ol className="space-y-1.5">
            {sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-3 p-3 rounded-xl hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <span className="shrink-0 w-5 text-[11px] font-semibold text-[var(--text-muted)] tabular-nums pt-0.5">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[var(--text-primary)] truncate">{s.title}</span>
                    <span className="block text-[11px] text-[#18a999] truncate">{s.source}</span>
                    {s.snippet && (
                      <span className="block text-[12px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">{s.snippet}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** 旧版卡片（历史消息里存的）：只显示标题、简介和全文，不再显示亲密度 / 心情 / 引擎等无关指标 */
function LegacyCard({ card, onOpen }: { card: PageArtifactCardData; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className="group/card mt-3 w-full max-w-[600px] rounded-[20px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] overflow-hidden cursor-pointer hover:border-[var(--border-strong)] transition-colors"
    >
      <div className="px-5 py-4 space-y-1">
        <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">{legacyTitle(card.title)}</h4>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
          {card.subtitle.replace(/（由 .+? 结合实时信息与人设视角整理.*?）/, "")}
        </p>
      </div>
      <div className="px-5 py-2.5 border-t border-[var(--border-subtle)] text-right text-[11.5px] font-medium text-[var(--text-muted)] group-hover/card:text-[#18a999]">
        查看全部 →
      </div>
    </div>
  );
}

function legacyTitle(title: string): string {
  return title.replace(/\s*·\s*实时情报清单$/, "");
}

function LegacyReader({ card }: { card: PageArtifactCardData }) {
  const text = (card.fullContent || card.subtitle)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^>\s*/gm, "");
  return (
    <div className="p-6 overflow-y-auto">
      <div className="whitespace-pre-wrap leading-relaxed text-[13.5px] text-[var(--text-primary)]">{text}</div>
    </div>
  );
}

function PageArtifactCard({ card }: PageArtifactCardProps) {
  const [openReader, setOpenReader] = useState(false);
  const isSearch = card.kind === "search";

  useEffect(() => {
    if (!openReader) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenReader(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openReader]);

  const sourceCount = card.sources?.length || 0;
  const time = formatTime(card.generatedAt);

  return (
    <>
      {isSearch ? (
        <SearchSummaryCard card={card} onOpen={() => setOpenReader(true)} />
      ) : (
        <LegacyCard card={card} onOpen={() => setOpenReader(true)} />
      )}

      {/* 挂到 body 上：消息行带入场动画（transform），放在里面的 fixed 浮层会被困在气泡范围内 */}
      {openReader && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in"
          onClick={() => setOpenReader(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={card.title}
            className="w-full max-w-2xl max-h-[84vh] rounded-3xl bg-[var(--bg-composer)] border border-[var(--border-strong)] shadow-2xl flex flex-col overflow-hidden animate-popover-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h3 className="text-[16px] font-semibold text-[var(--text-primary)] leading-snug">
                  {isSearch ? card.title : legacyTitle(card.title)}
                </h3>
                {isSearch && (
                  <p className="text-[11.5px] text-[var(--text-muted)]">
                    搜索总结
                    {card.personaName ? ` · ${card.personaName}` : ""}
                    {time ? ` · ${time}` : ""}
                    {sourceCount > 0 ? ` · ${sourceCount} 个来源` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpenReader(false)}
                aria-label="关闭"
                className="shrink-0 w-8 h-8 rounded-full hover:bg-[var(--bg-secondary)] flex items-center justify-center text-xs text-[var(--text-secondary)]"
              >
                ✕
              </button>
            </div>
            {isSearch ? <SearchSummaryReader card={card} /> : <LegacyReader card={card} />}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default memo(PageArtifactCard);
