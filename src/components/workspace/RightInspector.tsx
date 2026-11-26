"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LineIcon from "@/components/workspace/LineIcon";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { heuristicTraits } from "@/lib/persona/traits";
import {
  PersonaMode,
  PersonaRecord,
  PersonaSnapshotMeta,
  SceneAsset,
  SceneAssetCategory,
} from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import GrowthLogPanel from "./GrowthLogPanel";
import MomentsFeed from "./MomentsFeed";
import WorldAssetsPanel from "./WorldAssetsPanel";

type LibraryTab = "emotion" | "persona" | "memories" | "growth" | "corrections";

interface RightInspectorProps {
  persona: PersonaRecord | null;
  isStreaming?: boolean;
  autoNudgeEnabled?: boolean;
  onToggleAutoNudge?: () => void;
  thinkMode?: boolean;
  onToggleThink?: () => void;
  deepSearch?: boolean;
  onToggleDeepSearch?: () => void;
  activeMode?: PersonaMode;
  onChangeMode?: (mode: PersonaMode) => void;
  onSavePersonaPatch: (patch: Partial<PersonaRecord>) => Promise<void>;
  onAddCorrection: (reason: string, category: string) => Promise<void>;
  onTriggerProactive: (hoursIdle?: number) => Promise<void>;
  onRefreshPersona?: () => Promise<void>;
  isRefiningReference?: boolean;
  refineReferenceNotice?: string | null;
  latestGrowthNotice?: string | null;
  onDismissGrowthNotice?: () => void;
  onReportGrowth?: (notice: string) => void;
  onRefineReferencePortrait?: (sourceImageUrl?: string) => Promise<void>;
  hasUnreadMoments?: boolean;
  momentsRefreshSignal?: number;
  onClearUnreadMoments?: () => void;
  onMomentsFeedLoaded?: (latestPostId?: string) => void;
  onOpenAvatarPicker: () => void;
  onClose: () => void;
}

export default function RightInspector({
  persona,
  isStreaming = false,
  autoNudgeEnabled = true,
  onToggleAutoNudge,
  thinkMode = true,
  onToggleThink,
  deepSearch = false,
  onToggleDeepSearch,
  activeMode = "authentic",
  onChangeMode,
  onSavePersonaPatch,
  onAddCorrection,
  onTriggerProactive,
  onRefreshPersona,
  isRefiningReference = false,
  refineReferenceNotice = null,
  latestGrowthNotice = null,
  onDismissGrowthNotice,
  onReportGrowth,
  onRefineReferencePortrait,
  hasUnreadMoments = false,
  momentsRefreshSignal = 0,
  onClearUnreadMoments,
  onMomentsFeedLoaded,
  onOpenAvatarPicker,
  onClose,
}: RightInspectorProps) {
  const [section, setSection] = useState<"activity" | "library">("activity");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("emotion");
  const [editingPersonaMd, setEditingPersonaMd] = useState<string | null>(null);
  const [editingMemoriesMd, setEditingMemoriesMd] = useState<string | null>(
    null
  );
  const [editingAppearance, setEditingAppearance] = useState<string | null>(
    null
  );
  const [newCorrection, setNewCorrection] = useState("");
  const [saving, setSaving] = useState(false);
  const [snapshots, setSnapshots] = useState<PersonaSnapshotMeta[]>([]);
  const [snapshotsExpanded, setSnapshotsExpanded] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [importingBundle, setImportingBundle] = useState(false);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [autoGeneratingAnchor, setAutoGeneratingAnchor] = useState(false);
  const [previewRefOpen, setPreviewRefOpen] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [evolutionNotice, setEvolutionNotice] = useState<string | null>(null);
  const [sceneAssets, setSceneAssets] = useState<SceneAsset[]>([]);
  const [assetsRefreshTick, setAssetsRefreshTick] = useState(0);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetCategory, setNewAssetCategory] =
    useState<SceneAssetCategory>("room");
  const [newAssetDesc, setNewAssetDesc] = useState("");
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [assetNotice, setAssetNotice] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<SceneAsset | null>(null);
  const bundleFileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const slug = persona?.slug;
    if (!slug || section !== "library" || libraryTab !== "emotion") return;

    let cancelled = false;
    fetch(`/api/personas/${encodeURIComponent(slug)}/assets`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.assets)) {
          setSceneAssets(data.assets as SceneAsset[]);
        }
      })
      .catch(() => {
        // Ignore asset fetch error
      });

    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ slug?: string }>).detail;
      if (!detail?.slug || detail.slug === slug) {
        setAssetsRefreshTick((t) => t + 1);
      }
    };
    window.addEventListener("personabot:assets-updated", onUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("personabot:assets-updated", onUpdated);
    };
  }, [persona?.slug, section, libraryTab, assetsRefreshTick]);

  useEffect(() => {
    const slug = persona?.slug;
    if (!slug || section !== "library" || libraryTab !== "memories") return;

    let cancelled = false;
    fetch(`/api/personas/${encodeURIComponent(slug)}/evolve`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.snapshots)) {
          setSnapshots(data.snapshots as PersonaSnapshotMeta[]);
        }
      })
      .catch(() => {
        // Ignore snapshot fetch error
      });

    return () => {
      cancelled = true;
    };
  }, [persona?.slug, section, libraryTab]);

  useEffect(() => {
    if (!previewRefOpen && !previewAsset) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewRefOpen(false);
        setPreviewAsset(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewRefOpen, previewAsset]);

  if (!persona) {
    return (
      <aside className="w-80 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 flex items-center justify-center text-xs text-[var(--text-muted)]">
        正在加载角色状态舱...
      </aside>
    );
  }

  const pleasurePct = Math.round(
    ((persona.emotionState.pleasure + 1) / 2) * 100
  );
  const arousalPct = Math.round(persona.emotionState.arousal * 100);
  const dominancePct = Math.round(persona.emotionState.dominance * 100);
  const mascotCfg = getMascotConfigForPersona(persona.slug, persona.profile);

  return (
    <aside className="w-[312px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col h-screen animate-fade-in">
      {/* Top Close & Centered Hero Avatar (Screenshot 3 Layout) */}
      <div className="relative px-4 pt-4 pb-3 flex flex-col items-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          title="收起右侧面板"
        >
          ✕
        </button>

        <button
          type="button"
          onClick={onOpenAvatarPicker}
          className="group flex flex-col items-center cursor-pointer focus:outline-none"
          title="点击更换角色形状与颜色"
        >
          <BlobMascot
            shape={mascotCfg.shape}
            color={mascotCfg.color}
            image={mascotCfg.image}
            size={56}
            trackPointer
            state={isStreaming ? "working" : "idle"}
          />
          <h3 className="mt-2.5 text-[15px] font-semibold text-[var(--text-primary)] group-hover:opacity-75 transition-opacity">
            {persona.name}
          </h3>
        </button>

        {/* Segmented Control: 动态 | 资料库 */}
        <div className="mt-3 inline-flex items-center p-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setSection("activity");
              onClearUnreadMoments?.();
            }}
            className={`relative px-3.5 py-1 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
              section === "activity"
                ? "bg-[var(--bg-composer)] text-[var(--text-primary)] grok-active-row"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span>动态</span>
            {hasUnreadMoments && section !== "activity" && (
              <span
                aria-label="有新朋友圈动态"
                className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[var(--bg-secondary)]"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setSection("library")}
            className={`px-3.5 py-1 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
              section === "library"
                ? "bg-[var(--bg-composer)] text-[var(--text-primary)] grok-active-row"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            资料库
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-5 space-y-4 text-xs">
        {section === "activity" ? (
          <MomentsFeed
            key={persona.slug}
            persona={persona}
            refreshSignal={momentsRefreshSignal}
            onFeedLoaded={onMomentsFeedLoaded}
          />
        ) : (
          <div className="space-y-3.5 animate-fade-in">
            {/* Sub-tabs inside 资料库 */}
            <div className="grid grid-cols-5 gap-1 p-1 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] text-[11px]">
              {[
                { id: "emotion", label: "情绪雷达" },
                { id: "persona", label: "五层人格" },
                { id: "memories", label: "共同记忆" },
                { id: "growth", label: "成长日志" },
                { id: "corrections", label: "纠偏OOC" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLibraryTab(tab.id as LibraryTab)}
                  className={`py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                    libraryTab === tab.id
                      ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {latestGrowthNotice && (
              <div className="flex items-start justify-between gap-2 p-2.5 rounded-2xl bg-[#18a999]/10 border border-[#18a999]/30 text-[11px] text-[#18a999]">
                <span className="leading-relaxed">
                  ✨ 刚刚成长：{latestGrowthNotice}
                </span>
                {onDismissGrowthNotice && (
                  <button
                    type="button"
                    onClick={onDismissGrowthNotice}
                    className="shrink-0 text-[10px] opacity-75 hover:opacity-100 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {libraryTab === "emotion" && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">当前心情</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#18a999]/12 text-[#18a999] font-semibold">
                      {persona.emotionState.moodLabel ||
                        persona.emotionState.primary}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[var(--text-secondary)]">
                        亲密度 / 好感度
                      </span>
                      <span className="text-rose-500 font-bold tabular-nums">
                        ♥ {persona.intimacy}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-[#18a999] transition-all duration-500"
                        style={{ width: `${persona.intimacy}%` }}
                      />
                    </div>
                  </div>
                  {persona.emotionState.sulking && (
                    <div className="mt-1 p-2.5 rounded-xl bg-rose-500/8 border border-rose-500/20 flex items-center justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[11px] font-semibold text-rose-500 flex items-center gap-1.5">
                          <span>
                            {persona.emotionState.sulking.level >= 3
                              ? "冷处理中"
                              : persona.emotionState.sulking.level === 2
                                ? "有点闹别扭"
                                : "微微介意"}
                          </span>
                          <span className="text-[10px] font-normal text-[var(--text-muted)]">
                            · 约 {persona.emotionState.sulking.remainingTurns} 轮缓和
                          </span>
                        </div>
                        <div className="text-[10.5px] text-[var(--text-secondary)] truncate">
                          {persona.emotionState.sulking.reason}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          if (saving) return;
                          setSaving(true);
                          try {
                            await onSavePersonaPatch({
                              emotionState: {
                                ...persona.emotionState,
                                moodLabel: "平复下来了",
                                pleasure: Math.max(persona.emotionState.pleasure, 0.1),
                                sulking: null as unknown as undefined,
                              },
                            });
                          } finally {
                            setSaving(false);
                          }
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[10.5px] font-medium text-[var(--text-primary)] hover:border-rose-400 cursor-pointer disabled:opacity-50"
                      >
                        直接翻篇
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5">
                  <div className="font-semibold text-[var(--text-primary)]">
                    PAD 三维情绪状态机
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[var(--text-secondary)]">
                        愉悦度 (Pleasure)
                      </span>
                      <span className="tabular-nums font-medium">
                        {pleasurePct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#18a999]"
                        style={{ width: `${pleasurePct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[var(--text-secondary)]">
                        激活度 (Arousal)
                      </span>
                      <span className="tabular-nums font-medium">
                        {arousalPct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${arousalPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[var(--text-secondary)]">
                        掌控感 (Dominance)
                      </span>
                      <span className="tabular-nums font-medium">
                        {dominancePct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500"
                        style={{ width: `${dominancePct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2">
                  <div className="font-semibold text-[var(--text-primary)]">
                    人格指纹
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.profile.mbti && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#18a999]/12 text-[#18a999] font-medium">
                        {persona.profile.mbti}
                      </span>
                    )}
                    {persona.profile.zodiac && (
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-500/12 text-purple-600 dark:text-purple-300 font-medium">
                        {persona.profile.zodiac}
                      </span>
                    )}
                    {persona.profile.personalityTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {(() => {
                  const t =
                    persona.spec?.traits ||
                    heuristicTraits(persona.personaMd, persona.profile);
                  const dims = [
                    { label: "脑洞好奇", value: t.openness },
                    { label: "自律靠谱", value: t.conscientiousness },
                    { label: "外向热场", value: t.extraversion },
                    { label: "温和包容", value: t.agreeableness },
                    { label: "情绪敏感", value: t.neuroticism },
                    { label: "好哄程度", value: t.recoveryRate },
                  ];
                  return (
                    <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--text-primary)]">
                          性格驱动维度
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {t.source === "llm" ? "模型蒸馏" : "人设推断"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {dims.map((d) => {
                          const pct = Math.round(
                            Math.max(0, Math.min(1, d.value)) * 100
                          );
                          return (
                            <div key={d.label} className="space-y-1">
                              <div className="flex justify-between text-[10.5px]">
                                <span className="text-[var(--text-secondary)]">
                                  {d.label}
                                </span>
                                <span className="tabular-nums text-[var(--text-primary)] font-medium">
                                  {pct}%
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#18a999]/80"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Consistent Photo Appearance Anchor Editor */}
                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        固定外貌与画风锚点
                      </span>
                      {persona.profile.appearanceAnchor && (
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9.5px] font-medium ${
                            persona.profile.appearanceAnchorLocked
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                              : "bg-[#18a999]/12 text-[#18a999]"
                          }`}
                        >
                          {persona.profile.appearanceAnchorLocked
                            ? "已手动锁定"
                            : "自动同步"}
                        </span>
                      )}
                    </div>
                    {editingAppearance === null ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={autoGeneratingAnchor}
                          onClick={async () => {
                            if (autoGeneratingAnchor) return;
                            setAutoGeneratingAnchor(true);
                            try {
                              const res = await fetch(
                                `/api/personas/${encodeURIComponent(persona.slug)}/assets`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "auto_anchor" }),
                                }
                              );
                              const data = await res.json();
                              if (data?.success) {
                                await onRefreshPersona?.();
                                onReportGrowth?.(
                                  data.usedVision
                                    ? "已看图反推更新外貌与画风锚点"
                                    : "已自动生成外貌与画风锚点"
                                );
                              }
                            } catch {
                              // Ignore auto anchor error
                            } finally {
                              setAutoGeneratingAnchor(false);
                            }
                          }}
                          className="text-[#18a999] text-[10.5px] font-medium hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {autoGeneratingAnchor ? "生成中..." : "✨ 自动生成"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingAppearance(
                              persona.profile.appearanceAnchor || ""
                            )
                          }
                          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-medium hover:underline cursor-pointer"
                        >
                          {persona.profile.appearanceAnchor ? "修改" : "设定"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 text-[11px] shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingAppearance(null)}
                          className="text-[var(--text-muted)] cursor-pointer"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            const trimmed = editingAppearance.trim();
                            await onSavePersonaPatch({
                              profile: {
                                ...persona.profile,
                                appearanceAnchor: trimmed || undefined,
                                appearanceAnchorLocked: Boolean(trimmed),
                              },
                            });
                            setEditingAppearance(null);
                            setSaving(false);
                          }}
                          className="text-[#18a999] font-semibold cursor-pointer"
                        >
                          保存
                        </button>
                      </div>
                    )}
                  </div>

                  {editingAppearance !== null ? (
                    <textarea
                      value={editingAppearance}
                      onChange={(e) => setEditingAppearance(e.target.value)}
                      rows={3}
                      placeholder="例如：20出头黑长直甜酷少女，常穿卫衣或短裙配长靴，拍照时保持一致外貌特征..."
                      className="w-full p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11.5px] focus:outline-none"
                    />
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {persona.profile.appearanceAnchor ||
                        "未设定固定外貌特征；设定后每次自拍/生图都会自动保持同一人物外貌与画风。"}
                    </p>
                  )}

                  {/* Reference Image Identity Lock */}
                  <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-[var(--text-secondary)]">
                        人物一致性参考图
                      </span>
                      {persona.profile.referenceImageUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onSavePersonaPatch({
                              profile: {
                                ...persona.profile,
                                referenceImageUrl: undefined,
                              },
                            });
                          }}
                          className="text-[var(--text-muted)] hover:text-rose-500 cursor-pointer"
                        >
                          清除
                        </button>
                      )}
                    </div>

                    {isRefiningReference && (
                      <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-[#18a999]/10 border border-[#18a999]/30 text-[11px] text-[#18a999]">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#18a999] animate-pulse shrink-0" />
                        <span>✨ 正在提炼标准棚拍参考图…</span>
                      </div>
                    )}

                    {persona.profile.referenceImageUrl ? (
                      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => setPreviewRefOpen(true)}
                          title="点击放大查看参考图"
                          className="relative group shrink-0 rounded-lg overflow-hidden border border-[var(--border-strong)] cursor-zoom-in"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={persona.profile.referenceImageUrl}
                            alt="人物参考图"
                            className="w-12 h-12 object-cover"
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-[#18a999]">
                            ✓ 已锁定参考图底稿
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] truncate">
                            后续发自拍将参考此图五官（点击缩略图可放大）
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10.5px] text-[var(--text-muted)]">
                        尚未锁定参考图；发送首张自拍后会自动提炼标准定妆照，也可手动上传或直接生成：
                      </div>
                    )}

                    {onRefineReferencePortrait && (
                      <button
                        type="button"
                        disabled={isRefiningReference || uploadingRef}
                        onClick={() =>
                          void onRefineReferencePortrait(
                            persona.profile.referenceImageUrl
                          )
                        }
                        className="w-full py-1.5 px-2.5 rounded-xl bg-[#18a999]/12 hover:bg-[#18a999]/20 border border-[#18a999]/30 text-[11px] font-medium text-[#18a999] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isRefiningReference
                          ? "✨ 正在提炼标准参考图..."
                          : persona.profile.referenceImageUrl
                            ? "✨ 重生成标准参考图"
                            : "✨ 生成标准参考图"}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={uploadingRef || isRefiningReference}
                      onClick={() => refImageInputRef.current?.click()}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {uploadingRef
                        ? "正在保存参考图..."
                        : persona.profile.referenceImageUrl
                          ? "📷 更换人物参考图"
                          : "📷 上传人物参考图"}
                    </button>
                    {refineReferenceNotice && (
                      <div className="text-[10.5px] text-[var(--text-muted)] leading-relaxed px-1">
                        {refineReferenceNotice}
                      </div>
                    )}
                    <input
                      ref={refImageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setUploadingRef(true);
                        try {
                          const dataUrl = await new Promise<string>(
                            (resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () =>
                                resolve(String(reader.result || ""));
                              reader.onerror = () => reject(new Error("Read error"));
                              reader.readAsDataURL(file);
                            }
                          );
                          const res = await fetch("/api/media/reference", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              slug: persona.slug,
                              dataUrl,
                            }),
                          });
                          const data = await res.json();
                          if (data?.success) {
                            await onRefreshPersona?.();
                            if (data.appearanceAnchorUpdated) {
                              onReportGrowth?.(
                                "已上传参考图，并自动同步外貌与画风锚点"
                              );
                            }
                          }
                        } catch {
                          // Ignore upload error
                        } finally {
                          setUploadingRef(false);
                        }
                      }}
                    />
                  </div>
                </div>

                {/* 世界设定：从聊天 / 朋友圈 / 照片里自动归纳的地点、宠物、物品、人物 */}
                <WorldAssetsPanel slug={persona.slug} personaName={persona.name} />

                {/* Scene / Environment Fixed Asset Library */}
                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      🏠 固定场景资产库
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAddAssetOpen((v) => !v);
                        setAssetNotice(null);
                      }}
                      className="text-[#18a999] text-[11px] font-medium hover:underline cursor-pointer shrink-0"
                    >
                      {addAssetOpen ? "收起" : "+ 新增场景"}
                    </button>
                  </div>

                  <p className="text-[10.5px] text-[var(--text-muted)] leading-relaxed">
                    固定 TA 的房间、书桌或常去地点，后续拍照与朋友圈提到对应地点会自动保持环境一致。
                  </p>

                  {addAssetOpen && (
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-2 animate-fade-in">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newAssetName}
                          onChange={(e) => setNewAssetName(e.target.value)}
                          placeholder="名称（如：我的卧室）"
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--bg-composer)] border border-[var(--border-subtle)] text-[11px] focus:outline-none"
                        />
                        <select
                          value={newAssetCategory}
                          onChange={(e) =>
                            setNewAssetCategory(
                              e.target.value as SceneAssetCategory
                            )
                          }
                          className="px-2 py-1.5 rounded-lg bg-[var(--bg-composer)] border border-[var(--border-subtle)] text-[11px] focus:outline-none cursor-pointer"
                        >
                          <option value="room">房间</option>
                          <option value="location">地点</option>
                          <option value="environment">环境</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        value={newAssetDesc}
                        onChange={(e) => setNewAssetDesc(e.target.value)}
                        placeholder="补充描述（可选，如：暖黄台灯、原木书桌和落地窗）"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-composer)] border border-[var(--border-subtle)] text-[11px] focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          disabled={creatingAsset}
                          onClick={async () => {
                            if (!newAssetName.trim()) {
                              setAssetNotice("请先输入场景名称（如：我的卧室）");
                              return;
                            }
                            setCreatingAsset(true);
                            setAssetNotice(null);
                            try {
                              const res = await fetch(
                                `/api/personas/${encodeURIComponent(persona.slug)}/assets`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    action: "generate",
                                    name: newAssetName.trim(),
                                    category: newAssetCategory,
                                    description: newAssetDesc.trim() || undefined,
                                  }),
                                }
                              );
                              const data = await res.json();
                              if (data?.success && Array.isArray(data.assets)) {
                                setSceneAssets(data.assets);
                                setNewAssetName("");
                                setNewAssetDesc("");
                                setAddAssetOpen(false);
                              } else {
                                setAssetNotice(data?.error || "生成场景图失败");
                              }
                            } catch {
                              setAssetNotice("网络异常，生成场景图失败");
                            } finally {
                              setCreatingAsset(false);
                            }
                          }}
                          className="py-1.5 px-2 rounded-lg bg-[#18a999] hover:bg-[#149688] disabled:opacity-50 text-white text-[11px] font-medium cursor-pointer"
                        >
                          {creatingAsset ? "生成中..." : "✨ AI 生成场景图"}
                        </button>
                        <button
                          type="button"
                          disabled={creatingAsset}
                          onClick={() => assetFileInputRef.current?.click()}
                          className="py-1.5 px-2 rounded-lg bg-[var(--bg-composer)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
                        >
                          📷 上传场景图
                        </button>
                      </div>
                      <input
                        ref={assetFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setCreatingAsset(true);
                          setAssetNotice(null);
                          try {
                            const dataUrl = await new Promise<string>(
                              (resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () =>
                                  resolve(String(reader.result || ""));
                                reader.onerror = () =>
                                  reject(new Error("Read error"));
                                reader.readAsDataURL(file);
                              }
                            );
                            const res = await fetch(
                              `/api/personas/${encodeURIComponent(persona.slug)}/assets`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "upload",
                                  name:
                                    newAssetName.trim() ||
                                    file.name.replace(/\.[^.]+$/, "") ||
                                    "上传场景",
                                  category: newAssetCategory,
                                  dataUrl,
                                  description: newAssetDesc.trim() || undefined,
                                }),
                              }
                            );
                            const data = await res.json();
                            if (data?.success && Array.isArray(data.assets)) {
                              setSceneAssets(data.assets);
                              setNewAssetName("");
                              setNewAssetDesc("");
                              setAddAssetOpen(false);
                            } else {
                              setAssetNotice(data?.error || "上传失败");
                            }
                          } catch {
                            setAssetNotice("上传场景图失败");
                          } finally {
                            setCreatingAsset(false);
                          }
                        }}
                      />
                    </div>
                  )}

                  {assetNotice && (
                    <div className="text-[10.5px] text-rose-500 px-1">
                      {assetNotice}
                    </div>
                  )}

                  {sceneAssets.length === 0 ? (
                    <div className="p-3 rounded-xl border border-dashed border-[var(--border-subtle)] text-center text-[10.5px] text-[var(--text-muted)]">
                      暂无固定场景；点上方「+ 新增场景」或点开聊天/朋友圈照片选「🏠 存为场景资产」
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {sceneAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewAsset(asset)}
                            className="w-11 h-11 rounded-lg overflow-hidden border border-[var(--border-strong)] shrink-0 cursor-zoom-in"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={asset.imageUrl}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                                {asset.name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-[var(--bg-composer)] text-[9.5px] text-[var(--text-muted)] shrink-0">
                                {asset.category === "room"
                                  ? "房间"
                                  : asset.category === "location"
                                    ? "地点"
                                    : "环境"}
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">
                              {asset.description}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await fetch(
                                  `/api/personas/${encodeURIComponent(persona.slug)}/assets?assetId=${encodeURIComponent(asset.id)}`,
                                  { method: "DELETE" }
                                );
                                const data = await res.json();
                                if (data?.success && Array.isArray(data.assets)) {
                                  setSceneAssets(data.assets);
                                }
                              } catch {
                                // Ignore delete error
                              }
                            }}
                            title="删除场景资产"
                            className="text-[var(--text-muted)] hover:text-rose-500 text-[11px] px-1 cursor-pointer shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {libraryTab === "persona" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">五层性格结构 (persona.md)</span>
                  {editingPersonaMd === null ? (
                    <button
                      type="button"
                      onClick={() => setEditingPersonaMd(persona.personaMd)}
                      className="text-[#18a999] font-medium hover:underline cursor-pointer"
                    >
                      编辑设定
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPersonaMd(null)}
                        className="text-[var(--text-muted)] cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          await onSavePersonaPatch({
                            personaMd: editingPersonaMd,
                          });
                          setEditingPersonaMd(null);
                          setSaving(false);
                        }}
                        className="text-[#18a999] font-semibold cursor-pointer"
                      >
                        保存
                      </button>
                    </div>
                  )}
                </div>

                {editingPersonaMd !== null ? (
                  <textarea
                    value={editingPersonaMd}
                    onChange={(e) => setEditingPersonaMd(e.target.value)}
                    rows={18}
                    className="w-full p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-strong)] text-xs font-mono leading-relaxed focus:outline-none"
                  />
                ) : (
                  <pre className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] whitespace-pre-wrap break-words text-[11.5px] text-[var(--text-secondary)] leading-relaxed font-sans">
                    {persona.personaMd}
                  </pre>
                )}
              </div>
            )}

            {libraryTab === "memories" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">共同记忆库 (memories.md)</span>
                  {editingMemoriesMd === null ? (
                    <button
                      type="button"
                      onClick={() => setEditingMemoriesMd(persona.memoriesMd)}
                      className="text-[#18a999] font-medium hover:underline cursor-pointer"
                    >
                      编辑记忆
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingMemoriesMd(null)}
                        className="text-[var(--text-muted)] cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          await onSavePersonaPatch({
                            memoriesMd: editingMemoriesMd,
                          });
                          setEditingMemoriesMd(null);
                          setSaving(false);
                        }}
                        className="text-[#18a999] font-semibold cursor-pointer"
                      >
                        保存
                      </button>
                    </div>
                  )}
                </div>

                {editingMemoriesMd !== null ? (
                  <textarea
                    value={editingMemoriesMd}
                    onChange={(e) => setEditingMemoriesMd(e.target.value)}
                    rows={16}
                    className="w-full p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-strong)] text-xs font-mono leading-relaxed focus:outline-none"
                  />
                ) : (
                  <pre className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] whitespace-pre-wrap break-words text-[11.5px] text-[var(--text-secondary)] leading-relaxed font-sans">
                    {persona.memoriesMd}
                  </pre>
                )}

                {/* Evolution, Snapshots & Soul Bundle Card */}
                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)]">
                      ✨ 记忆自进化与灵魂备份
                    </span>
                    <span className="text-[10.5px] text-[var(--text-muted)]">
                      每 4 轮自省学习
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={evolving}
                    onClick={async () => {
                      setEvolving(true);
                      setEvolutionNotice(null);
                      try {
                        const res = await fetch(
                          `/api/personas/${encodeURIComponent(persona.slug)}/evolve`,
                          { method: "POST" }
                        );
                        const data = await res.json();
                        if (data?.success) {
                          if (Array.isArray(data.snapshots)) {
                            setSnapshots(data.snapshots as PersonaSnapshotMeta[]);
                          }
                          setEvolutionNotice(
                            data.summary || "记忆与习惯检查完成"
                          );
                          if (data.evolved) {
                            await onRefreshPersona?.();
                            if (data.summary) {
                              onReportGrowth?.(data.summary);
                            }
                          }
                        } else {
                          setEvolutionNotice(data?.error || "整理失败");
                        }
                      } catch {
                        setEvolutionNotice("网络异常，整理失败");
                      } finally {
                        setEvolving(false);
                      }
                    }}
                    className="w-full py-2 px-3 rounded-full bg-[#18a999] hover:bg-[#149688] disabled:opacity-50 text-white font-semibold text-xs transition-all cursor-pointer"
                  >
                    {evolving
                      ? "正在归纳记忆与习惯..."
                      : "✨ 立即整理记忆与习惯"}
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    <a
                      href={`/api/personas/${encodeURIComponent(persona.slug)}/bundle`}
                      download={`persona-soul-${persona.slug}.json`}
                      className="py-1.5 px-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-center text-[11px] font-medium text-[var(--text-primary)] transition-colors"
                    >
                      📦 导出灵魂包
                    </a>
                    <button
                      type="button"
                      disabled={importingBundle}
                      onClick={() => bundleFileInputRef.current?.click()}
                      className="py-1.5 px-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {importingBundle ? "导入中..." : "📥 导入灵魂包"}
                    </button>
                    <input
                      ref={bundleFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        setImportingBundle(true);
                        setEvolutionNotice(null);
                        try {
                          const raw = await file.text();
                          const parsed = JSON.parse(raw);
                          const res = await fetch(
                            `/api/personas/${encodeURIComponent(persona.slug)}/bundle`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(parsed),
                            }
                          );
                          const data = await res.json();
                          if (data?.success) {
                            if (Array.isArray(data.snapshots)) {
                              setSnapshots(
                                data.snapshots as PersonaSnapshotMeta[]
                              );
                            }
                            setEvolutionNotice(
                              "已成功导入灵魂包并自动备份旧版快照"
                            );
                            await onRefreshPersona?.();
                          } else {
                            setEvolutionNotice(data?.error || "导入失败");
                          }
                        } catch {
                          setEvolutionNotice("灵魂包 JSON 解析失败");
                        } finally {
                          setImportingBundle(false);
                        }
                      }}
                    />
                  </div>

                  {evolutionNotice && (
                    <div className="px-2.5 py-1.5 rounded-xl bg-[#18a999]/10 border border-[#18a999]/25 text-[11px] text-[#18a999] leading-relaxed">
                      {evolutionNotice}
                    </div>
                  )}

                  {/* Snapshot History Rollback */}
                  <div className="pt-1 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setSnapshotsExpanded((v) => !v)}
                      className="w-full flex items-center justify-between py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <span>历史版本快照 ({snapshots.length})</span>
                      <span>{snapshotsExpanded ? "▲" : "▼"}</span>
                    </button>

                    {snapshotsExpanded && (
                      <div className="mt-1.5 space-y-1.5 max-h-52 overflow-y-auto">
                        {snapshots.length === 0 ? (
                          <div className="p-2.5 rounded-xl border border-dashed border-[var(--border-subtle)] text-center text-[11px] text-[var(--text-muted)]">
                            暂无历史快照，整理记忆或导入备份后会自动存档
                          </div>
                        ) : (
                          snapshots.map((snap) => (
                            <div
                              key={snap.id}
                              className="p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                                  {snap.reason}
                                </div>
                                {snap.summary && (
                                  <div className="text-[10px] text-[var(--text-secondary)] truncate">
                                    {snap.summary}
                                  </div>
                                )}
                                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                  {new Date(snap.createdAt).toLocaleString(
                                    "zh-CN",
                                    {
                                      month: "2-digit",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={rollingBackId === snap.id}
                                onClick={async () => {
                                  setRollingBackId(snap.id);
                                  setEvolutionNotice(null);
                                  try {
                                    const res = await fetch(
                                      `/api/personas/${encodeURIComponent(persona.slug)}/snapshots/rollback`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          snapshotId: snap.id,
                                        }),
                                      }
                                    );
                                    const data = await res.json();
                                    if (data?.success) {
                                      if (Array.isArray(data.snapshots)) {
                                        setSnapshots(
                                          data.snapshots as PersonaSnapshotMeta[]
                                        );
                                      }
                                      setEvolutionNotice(
                                        `已回退至「${snap.reason}」版本`
                                      );
                                      await onRefreshPersona?.();
                                    } else {
                                      setEvolutionNotice(
                                        data?.error || "回退失败"
                                      );
                                    }
                                  } catch {
                                    setEvolutionNotice("回退请求失败");
                                  } finally {
                                    setRollingBackId(null);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-[var(--bg-composer)] border border-[var(--border-subtle)] hover:border-[#18a999] text-[10.5px] font-medium text-[var(--text-primary)] shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                {rollingBackId === snap.id
                                  ? "回退中..."
                                  : "一键回退"}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {libraryTab === "growth" && persona && (
              <GrowthLogPanel
                slug={persona.slug}
                refreshKey={persona.updatedAt}
                onChanged={onRefreshPersona}
              />
            )}

            {libraryTab === "corrections" && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2.5">
                  <div className="font-semibold">新增行为纠偏 (OOC Guard)</div>
                  <textarea
                    value={newCorrection}
                    onChange={(e) => setNewCorrection(e.target.value)}
                    rows={3}
                    placeholder="例如：她生气时绝不会主动讲道理，只会发个冷笑话或说“随便你”..."
                    className="w-full p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!newCorrection.trim() || saving}
                    onClick={async () => {
                      setSaving(true);
                      await onAddCorrection(newCorrection.trim(), "style");
                      setNewCorrection("");
                      setSaving(false);
                    }}
                    className="w-full py-2 rounded-full bg-[#18a999] hover:bg-[#149688] disabled:opacity-40 text-white font-semibold text-xs transition-all cursor-pointer"
                  >
                    写入永久纠偏层
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    已生效纠偏记录 ({persona.corrections?.length || 0})
                  </div>
                  {!persona.corrections || persona.corrections.length === 0 ? (
                    <div className="p-4 rounded-2xl border border-dashed border-[var(--border-subtle)] text-center text-[var(--text-muted)]">
                      暂无纠偏记录，也可以在聊天气泡上右键选「不像 TA」
                    </div>
                  ) : (
                    persona.corrections.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-1"
                      >
                        <div className="text-[#18a999] font-medium">
                          ✓ {item.correction}
                        </div>
                        {item.botResponse && (
                          <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                            针对原回复：{item.botResponse}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Collapsible Chat Preferences & AI Advanced Controls */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setAdvancedExpanded((v) => !v)}
                className="w-full px-3 py-2.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] flex items-center justify-between text-[11.5px] font-medium text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <span>⚙️ 对话偏好与高级设定</span>
                <span className="text-[10.5px] text-[var(--text-muted)]">
                  {advancedExpanded ? "收起 ▲" : "展开 ▼"}
                </span>
              </button>

              {advancedExpanded && (
                <div className="mt-2 p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-3 animate-fade-in">
                  <div className="grid grid-cols-2 gap-2">
                    {onToggleThink && (
                      <button
                        type="button"
                        onClick={onToggleThink}
                        className={`px-2.5 py-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          thinkMode
                            ? "border-[#18a999] bg-[#18a999]/10 text-[#18a999]"
                            : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                        }`}
                      >
                        <span>✦</span>
                        <span>内心心声</span>
                      </button>
                    )}
                    {onToggleDeepSearch && (
                      <button
                        type="button"
                        onClick={onToggleDeepSearch}
                        className={`px-2.5 py-2 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          deepSearch
                            ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                            : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                        }`}
                      >
                        <span>🌐</span>
                        <span>联网搜素</span>
                      </button>
                    )}
                  </div>

                  {onChangeMode && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-[var(--text-muted)]">
                        说话尺度模式
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(Object.keys(PERSONA_MODES) as PersonaMode[]).map((mKey) => {
                          const spec = PERSONA_MODES[mKey];
                          const active = activeMode === mKey;
                          return (
                            <button
                              key={mKey}
                              type="button"
                              onClick={() => onChangeMode(mKey)}
                              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium text-left flex items-center gap-1.5 transition-all cursor-pointer ${
                                active
                                  ? "bg-[var(--bg-secondary)] border-[#18a999] text-[var(--text-primary)]"
                                  : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              <LineIcon name={spec.icon} size={13} />
                              <span>{spec.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {onToggleAutoNudge && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                      <div className="min-w-0">
                        <div className="text-[11.5px] font-medium text-[var(--text-primary)]">
                          未回复主动追问
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          沉默 45 秒后结合语境轻敲你
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoNudgeEnabled}
                        onClick={onToggleAutoNudge}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                          autoNudgeEnabled
                            ? "bg-[#18a999]"
                            : "bg-black/15 dark:bg-white/20"
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            autoNudgeEnabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="text-[11px] text-[var(--text-muted)]">
                      主动破冰模拟
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      <button
                        type="button"
                        onClick={() => void onTriggerProactive(1)}
                        className="py-1.5 px-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left text-[11px] text-[var(--text-primary)] transition-all cursor-pointer"
                      >
                        ⚡ 结合当前时段主动找你开口
                      </button>
                      <button
                        type="button"
                        onClick={() => void onTriggerProactive(12)}
                        className="py-1.5 px-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left text-[11px] text-[var(--text-primary)] transition-all cursor-pointer"
                      >
                        🌙 模拟冷落 TA 12 小时后的吐槽
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {previewRefOpen &&
        persona.profile.referenceImageUrl &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/75 backdrop-blur-md p-6 animate-fade-in"
            onClick={() => setPreviewRefOpen(false)}
          >
            <div
              className="relative max-w-xl w-full flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={persona.profile.referenceImageUrl}
                alt={`${persona.name} 人物参考图`}
                className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain bg-white/5"
              />
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/60 text-white text-xs">
                <span>{persona.name} · 人物一致性参考图</span>
                <button
                  type="button"
                  onClick={() => setPreviewRefOpen(false)}
                  className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {previewAsset &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/75 backdrop-blur-md p-6 animate-fade-in"
            onClick={() => setPreviewAsset(null)}
          >
            <div
              className="relative max-w-xl w-full flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewAsset.imageUrl}
                alt={previewAsset.name}
                className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain bg-white/5"
              />
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/60 text-white text-xs">
                <span className="max-w-xs truncate">
                  {previewAsset.name} · {previewAsset.description}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
}
