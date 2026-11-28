"use client";

import { useEffect, useState } from "react";
import {
  TEMPERAMENT_ARCHETYPE_META,
  TEMPERAMENT_TIER_CONFIG,
} from "@/lib/emotion/temperament";
import { inferPersonaMind, inferPersonaTemperament } from "@/lib/persona/mind";
import type {
  CognitiveStyle,
  DefenseStyle,
  DisagreementStyle,
  PersonaMindSpec,
  PersonaTemperamentSpec,
  PersonaTraitsSpec,
  TemperamentArchetype,
  TemperamentIntensityTier,
  UserImpression,
} from "@/lib/persona/spec";
import { heuristicTraits } from "@/lib/persona/traits";
import type { DailyLifeState, PersonaRecord } from "@/lib/storage/types";

interface PersonaTuningPanelProps {
  persona: PersonaRecord;
  onRefreshPersona?: () => Promise<void>;
  onReportGrowth?: (notice: string) => void;
}

const TRAIT_DIM_META: Array<{ key: keyof Omit<PersonaTraitsSpec, "source">; label: string }> = [
  { key: "openness", label: "脑洞好奇" },
  { key: "conscientiousness", label: "自律靠谱" },
  { key: "extraversion", label: "外向热场" },
  { key: "agreeableness", label: "温和包容" },
  { key: "neuroticism", label: "情绪敏感" },
  { key: "emotionalStability", label: "情绪稳度" },
  { key: "recoveryRate", label: "好哄程度" },
];

const ARCHETYPE_OPTIONS: TemperamentArchetype[] = [
  "tsundere",
  "snappy",
  "hurt",
  "cold",
  "avoidant",
  "jealous",
];

const TIER_OPTIONS: TemperamentIntensityTier[] = ["gentle", "realistic", "spicy"];

const COGNITIVE_OPTIONS: Array<{ value: CognitiveStyle; label: string }> = [
  { value: "intuitive-feeling", label: "先感氛围与情绪温度" },
  { value: "analytical-logic", label: "先拆逻辑与真实意图" },
  { value: "pragmatic-action", label: "直奔核心与行动方案" },
  { value: "observant-guarded", label: "细察潜台词且慢热" },
];

const DEFENSE_OPTIONS: Array<{ value: DefenseStyle; label: string }> = [
  { value: "tsundere-mask", label: "嘴硬反问遮软肋" },
  { value: "direct-pushback", label: "有话直说直接顶回" },
  { value: "withdraw-quiet", label: "受委屈缩进壳里少言" },
  { value: "humor-deflect", label: "用玩笑或自嘲化解" },
  { value: "overthink-spiral", label: "反复脑补越想越多" },
];

const DISAGREEMENT_OPTIONS: Array<{ value: DisagreementStyle; label: string }> = [
  { value: "teasing-pushback", label: "熟人调侃式点破" },
  { value: "blunt", label: "直球坦率反对" },
  { value: "gentle-firm", label: "温和但站稳立场" },
  { value: "sarcastic-side", label: "反讽斜睨式吐槽" },
];

export default function PersonaTuningPanel({
  persona,
  onRefreshPersona,
  onReportGrowth,
}: PersonaTuningPanelProps) {
  const effectiveTraits: PersonaTraitsSpec =
    persona.spec?.traits || heuristicTraits(persona.personaMd, persona.profile);
  const effectiveTemperament: PersonaTemperamentSpec =
    persona.spec?.temperament ||
    inferPersonaTemperament(persona.personaMd, persona.profile, effectiveTraits);
  const effectiveMind: PersonaMindSpec =
    persona.spec?.mind ||
    inferPersonaMind(persona.personaMd, persona.profile, effectiveTraits);
  const currentImpression: UserImpression = persona.spec?.userImpression || {
    observedHabits: [],
  };

  // --- 1. 性格与脾气调音台状态 ---
  const [editingTuning, setEditingTuning] = useState(false);
  const [draftTraits, setDraftTraits] = useState<PersonaTraitsSpec>(effectiveTraits);
  const [draftTemperament, setDraftTemperament] =
    useState<PersonaTemperamentSpec>(effectiveTemperament);
  const [draftMind, setDraftMind] = useState<PersonaMindSpec>(effectiveMind);
  const [showMindConfig, setShowMindConfig] = useState(false);
  const [newTriggerInput, setNewTriggerInput] = useState("");
  const [newCoaxInput, setNewCoaxInput] = useState("");
  const [savingTuning, setSavingTuning] = useState(false);
  const [tuningError, setTuningError] = useState<string | null>(null);
  const [tuningSuccess, setTuningSuccess] = useState<string | null>(null);

  // --- 2. 今日生活与心境板状态 ---
  const [dailyLife, setDailyLife] = useState<DailyLifeState | null>(null);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [dailyReloadTick, setDailyReloadTick] = useState(0);
  const [editingDaily, setEditingDaily] = useState(false);
  const [draftMainEvent, setDraftMainEvent] = useState("");
  const [draftMoodTone, setDraftMoodTone] = useState("");
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailySaveError, setDailySaveError] = useState<string | null>(null);

  // --- 3. TA 眼中的你状态 ---
  const [editingImpression, setEditingImpression] = useState(false);
  const [draftNickname, setDraftNickname] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftRecentVibe, setDraftRecentVibe] = useState("");
  const [draftHabits, setDraftHabits] = useState<string[]>([]);
  const [newHabitInput, setNewHabitInput] = useState("");
  const [savingImpression, setSavingImpression] = useState(false);
  const [impressionError, setImpressionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/personas/${encodeURIComponent(persona.slug)}/daily-life`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && data.dailyLife) {
          setDailyLife(data.dailyLife as DailyLifeState);
          setDailyError(null);
        } else {
          setDailyError(data?.error?.message || "读取今日心境失败");
        }
      })
      .catch(() => {
        if (!cancelled) setDailyError("网络异常，未能读取今日心境");
      })
      .finally(() => {
        if (!cancelled) setDailyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [persona.slug, dailyReloadTick]);

  const openTuningEditor = () => {
    setDraftTraits({ ...effectiveTraits });
    setDraftTemperament({
      ...effectiveTemperament,
      triggers: [...effectiveTemperament.triggers],
      coaxMethods: [...effectiveTemperament.coaxMethods],
    });
    setDraftMind({
      ...effectiveMind,
      coreValues: [...effectiveMind.coreValues],
    });
    setNewTriggerInput("");
    setNewCoaxInput("");
    setTuningError(null);
    setTuningSuccess(null);
    setEditingTuning(true);
  };

  const resetTuningDefaults = () => {
    const t = heuristicTraits(persona.personaMd, persona.profile);
    const temp = inferPersonaTemperament(persona.personaMd, persona.profile, t);
    const mind = inferPersonaMind(persona.personaMd, persona.profile, t);
    setDraftTraits(t);
    setDraftTemperament(temp);
    setDraftMind(mind);
    setTuningError(null);
  };

  const addTriggerTag = () => {
    const val = newTriggerInput.trim().slice(0, 32);
    if (!val) return;
    if (draftTemperament.triggers.includes(val) || draftTemperament.triggers.length >= 8) {
      setNewTriggerInput("");
      return;
    }
    setDraftTemperament((prev) => ({
      ...prev,
      triggers: [...prev.triggers, val],
    }));
    setNewTriggerInput("");
  };

  const addCoaxTag = () => {
    const val = newCoaxInput.trim().slice(0, 40);
    if (!val) return;
    if (draftTemperament.coaxMethods.includes(val) || draftTemperament.coaxMethods.length >= 6) {
      setNewCoaxInput("");
      return;
    }
    setDraftTemperament((prev) => ({
      ...prev,
      coaxMethods: [...prev.coaxMethods, val],
    }));
    setNewCoaxInput("");
  };

  const handleSaveTuning = async () => {
    if (savingTuning) return;
    setSavingTuning(true);
    setTuningError(null);
    setTuningSuccess(null);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(persona.slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: {
            traits: draftTraits,
            temperament: {
              ...draftTemperament,
              source: "user-edit",
            },
            mind: {
              ...draftMind,
              source: "user-edit",
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setTuningError(data?.error?.message || "保存调音参数失败，请重试");
        return;
      }
      await onRefreshPersona?.();
      setEditingTuning(false);
      setTuningSuccess("已保存调音设定");
      onReportGrowth?.("已更新性格与脾气调音台参数");
    } catch {
      setTuningError("网络异常，保存调音参数失败");
    } finally {
      setSavingTuning(false);
    }
  };

  const handleSaveDailyLife = async () => {
    if (savingDaily) return;
    const mainEvent = draftMainEvent.trim();
    const moodTone = draftMoodTone.trim();
    if (!mainEvent && !moodTone) {
      setDailySaveError("请至少填写一项今日主线或心境");
      return;
    }
    setSavingDaily(true);
    setDailySaveError(null);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(persona.slug)}/daily-life`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainEvent, moodTone }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data.dailyLife) {
        setDailySaveError(data?.error?.message || "更新今日心境失败");
        return;
      }
      setDailyLife(data.dailyLife as DailyLifeState);
      setEditingDaily(false);
      onReportGrowth?.("已同步今日生活与心境板");
    } catch {
      setDailySaveError("网络异常，保存今日心境失败");
    } finally {
      setSavingDaily(false);
    }
  };

  const openImpressionEditor = () => {
    setDraftNickname(currentImpression.nickname || "");
    setDraftSummary(currentImpression.summary || "");
    setDraftRecentVibe(currentImpression.recentVibe || "");
    setDraftHabits([...(currentImpression.observedHabits || [])]);
    setNewHabitInput("");
    setImpressionError(null);
    setEditingImpression(true);
  };

  const addHabitTag = () => {
    const val = newHabitInput.trim().slice(0, 60);
    if (val.length < 2) return;
    if (draftHabits.includes(val) || draftHabits.length >= 6) {
      setNewHabitInput("");
      return;
    }
    setDraftHabits((prev) => [...prev, val]);
    setNewHabitInput("");
  };

  const handleSaveImpression = async () => {
    if (savingImpression) return;
    setSavingImpression(true);
    setImpressionError(null);
    try {
      const res = await fetch(`/api/personas/${encodeURIComponent(persona.slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: {
            userImpression: {
              nickname: draftNickname.trim(),
              summary: draftSummary.trim(),
              recentVibe: draftRecentVibe.trim(),
              observedHabits: draftHabits,
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setImpressionError(data?.error?.message || "保存印象档案失败");
        return;
      }
      await onRefreshPersona?.();
      setEditingImpression(false);
      onReportGrowth?.("已更新「TA 眼中的你」印象档案");
    } catch {
      setImpressionError("网络异常，保存印象档案失败");
    } finally {
      setSavingImpression(false);
    }
  };

  const archetypeMeta =
    TEMPERAMENT_ARCHETYPE_META[effectiveTemperament.archetype] ||
    TEMPERAMENT_ARCHETYPE_META.tsundere;
  const tierMeta =
    TEMPERAMENT_TIER_CONFIG[effectiveTemperament.intensityTier] ||
    TEMPERAMENT_TIER_CONFIG.realistic;
  const hasImpressionContent =
    Boolean(currentImpression.nickname) ||
    Boolean(currentImpression.summary) ||
    Boolean(currentImpression.recentVibe) ||
    currentImpression.observedHabits.length > 0;

  return (
    <div className="space-y-3 min-w-0">
      {/* 卡片 1：性格与脾气调音台 */}
      <div className="p-3.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <span className="text-[12px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] truncate">
              性格与脾气调音台
            </span>
          </div>
          {!editingTuning ? (
            <button
              type="button"
              onClick={openTuningEditor}
              className="shrink-0 px-2 py-0.5 rounded-full bg-[#18a999]/10 hover:bg-[#18a999]/15 text-[#18a999] text-[10.5px] font-medium transition-interactive focus-ring cursor-pointer"
            >
              调音编辑
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingTuning(false);
                setTuningError(null);
              }}
              className="shrink-0 text-[var(--text-muted)] text-[11px] hover:text-[var(--text-primary)] transition-colors duration-150 focus-ring rounded cursor-pointer"
            >
              收起
            </button>
          )}
        </div>

        {/* 脾气原型 + 烈度档位徽章 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-300 text-[10.5px] font-medium">
            {archetypeMeta.label}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[var(--text-secondary)] text-[10.5px]">
            {tierMeta.label}
          </span>
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            {effectiveTraits.source === "llm" ? "模型蒸馏" : "人设推断"}
          </span>
        </div>

        {tuningSuccess && !editingTuning && (
          <div className="px-2.5 py-1.5 rounded-xl bg-[#18a999]/10 border border-[#18a999]/20 text-[#18a999] text-[10.5px]">
            ✓ {tuningSuccess}
          </div>
        )}

        {!editingTuning ? (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pt-0.5">
              {TRAIT_DIM_META.map((d) => {
                const rawVal = effectiveTraits[d.key] ?? 0.5;
                const pct = Math.round(Math.max(0, Math.min(1, rawVal)) * 100);
                return (
                  <div key={d.key} className="space-y-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1 text-[10.5px]">
                      <span className="text-[var(--text-secondary)] truncate">{d.label}</span>
                      <span className="tabular-nums text-[var(--text-primary)] font-medium shrink-0">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#18a999]/85 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {(effectiveTemperament.triggers.length > 0 ||
              effectiveTemperament.coaxMethods.length > 0) && (
              <div className="pt-2.5 border-t border-[var(--border-hairline,var(--border-subtle))] space-y-1.5 text-[10.5px]">
                {effectiveTemperament.triggers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[var(--text-muted)] shrink-0">雷区</span>
                    {effectiveTemperament.triggers.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-full bg-rose-500/[0.08] border border-rose-500/15 text-rose-600 dark:text-rose-400 break-all"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {effectiveTemperament.coaxMethods.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[var(--text-muted)] shrink-0">哄法</span>
                    {effectiveTemperament.coaxMethods.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 rounded-full bg-[#18a999]/[0.08] border border-[#18a999]/20 text-[#18a999] break-all"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3.5 pt-1 animate-fade-in">
            {/* 7 维性格滑块 */}
            <div className="space-y-2.5">
              {TRAIT_DIM_META.map((d) => {
                const rawVal = draftTraits[d.key] ?? 0.5;
                const pct = Math.round(Math.max(0, Math.min(1, rawVal)) * 100);
                return (
                  <TuningRangeSlider
                    key={d.key}
                    label={d.label}
                    valuePct={pct}
                    onChangePct={(nextPct) => {
                      const val = Number((nextPct / 100).toFixed(2));
                      setDraftTraits((prev) => ({ ...prev, [d.key]: val }));
                    }}
                  />
                );
              })}
            </div>

            {/* 脾气原型选择 */}
            <div className="space-y-2 pt-2.5 border-t border-[var(--border-hairline,var(--border-subtle))]">
              <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                脾气原型
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {ARCHETYPE_OPTIONS.map((arch) => {
                  const active = draftTemperament.archetype === arch;
                  return (
                    <button
                      key={arch}
                      type="button"
                      onClick={() =>
                        setDraftTemperament((prev) => ({ ...prev, archetype: arch }))
                      }
                      className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-medium border flex items-center gap-1.5 text-left transition-interactive focus-ring cursor-pointer min-w-0 ${
                        active
                          ? "bg-[var(--surface-active,var(--bg-composer))] border-[#18a999]/55 text-[#18a999] grok-active-row"
                          : "bg-[var(--surface-panel,var(--bg-secondary))] border-[var(--border-hairline,var(--border-subtle))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                          active ? "bg-[#18a999]" : "bg-[var(--border-strong)]"
                        }`}
                      />
                      <span className="truncate">{TEMPERAMENT_ARCHETYPE_META[arch].label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 烈度档位 */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                脾气烈度档位
              </div>
              <div className="grid grid-cols-3 gap-1 p-[3px] rounded-xl bg-black/[0.04] dark:bg-white/[0.05] border border-[var(--border-hairline,var(--border-subtle))]">
                {TIER_OPTIONS.map((tier) => {
                  const active = draftTemperament.intensityTier === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() =>
                        setDraftTemperament((prev) => ({ ...prev, intensityTier: tier }))
                      }
                      className={`py-1.5 px-1 rounded-[9px] text-[10.5px] font-medium transition-interactive focus-ring cursor-pointer truncate ${
                        active
                          ? "bg-[var(--surface-active,var(--bg-composer))] text-[var(--text-primary)] grok-active-row"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {TEMPERAMENT_TIER_CONFIG[tier].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 专属雷区标签编辑器 */}
            <div className="space-y-2 pt-2.5 border-t border-[var(--border-hairline,var(--border-subtle))]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-secondary)]">专属雷区</span>
                <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                  {draftTemperament.triggers.length}/8
                </span>
              </div>
              {draftTemperament.triggers.length === 0 ? (
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  暂无自定义雷区（例如：敷衍嗯哦、已读不回）
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draftTemperament.triggers.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-rose-500/[0.08] border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10.5px] font-medium"
                    >
                      <span className="break-all">{t}</span>
                      <button
                        type="button"
                        aria-label={`删除雷区 ${t}`}
                        onClick={() =>
                          setDraftTemperament((prev) => ({
                            ...prev,
                            triggers: prev.triggers.filter((item) => item !== t),
                          }))
                        }
                        className="w-4 h-4 rounded-full inline-flex items-center justify-center hover:bg-rose-500/15 transition-colors cursor-pointer shrink-0"
                      >
                        <TinyCloseIcon />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus-within:border-[var(--border-strong)] focus-within-ring transition-surface">
                <input
                  type="text"
                  value={newTriggerInput}
                  onChange={(e) => setNewTriggerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTriggerTag();
                    }
                  }}
                  placeholder="添加踩雷词（如：随便你）"
                  className="flex-1 min-w-0 bg-transparent px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addTriggerTag}
                  className="shrink-0 px-2.5 py-1 rounded-[9px] bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[10.5px] font-medium text-[var(--text-primary)] transition-interactive cursor-pointer"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 顺毛哄法标签编辑器 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-secondary)]">顺毛哄法</span>
                <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                  {draftTemperament.coaxMethods.length}/6
                </span>
              </div>
              {draftTemperament.coaxMethods.length === 0 ? (
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  暂无专属哄法（例如：买杯热美式、认真服软）
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draftTemperament.coaxMethods.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-[#18a999]/[0.08] border border-[#18a999]/20 text-[#18a999] text-[10.5px] font-medium"
                    >
                      <span className="break-all">{c}</span>
                      <button
                        type="button"
                        aria-label={`删除哄法 ${c}`}
                        onClick={() =>
                          setDraftTemperament((prev) => ({
                            ...prev,
                            coaxMethods: prev.coaxMethods.filter((item) => item !== c),
                          }))
                        }
                        className="w-4 h-4 rounded-full inline-flex items-center justify-center hover:bg-[#18a999]/15 transition-colors cursor-pointer shrink-0"
                      >
                        <TinyCloseIcon />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus-within:border-[var(--border-strong)] focus-within-ring transition-surface">
                <input
                  type="text"
                  value={newCoaxInput}
                  onChange={(e) => setNewCoaxInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCoaxTag();
                    }
                  }}
                  placeholder="添加哄法（如：明确偏爱）"
                  className="flex-1 min-w-0 bg-transparent px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addCoaxTag}
                  className="shrink-0 px-2.5 py-1 rounded-[9px] bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[10.5px] font-medium text-[var(--text-primary)] transition-interactive cursor-pointer"
                >
                  添加
                </button>
              </div>
            </div>

            {/* 可折叠：思维与防御习惯 */}
            <div className="pt-2.5 border-t border-[var(--border-hairline,var(--border-subtle))]">
              <button
                type="button"
                onClick={() => setShowMindConfig((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-ring rounded cursor-pointer"
              >
                <span>思维方式与口是心非度</span>
                <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
                  <span>{showMindConfig ? "收起" : "展开"}</span>
                  <TinyChevronIcon rotated={showMindConfig} />
                </span>
              </button>
              {showMindConfig && (
                <div className="mt-2.5 space-y-2.5 animate-fade-in">
                  <label className="block space-y-1">
                    <span className="text-[10.5px] text-[var(--text-muted)]">思考路径</span>
                    <div className="relative">
                      <select
                        value={draftMind.cognitiveStyle}
                        onChange={(e) =>
                          setDraftMind((prev) => ({
                            ...prev,
                            cognitiveStyle: e.target.value as CognitiveStyle,
                          }))
                        }
                        className="w-full appearance-none pl-2.5 pr-7 py-1.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] focus:border-[var(--border-strong)] text-[11px] text-[var(--text-primary)] transition-surface focus:outline-none cursor-pointer"
                      >
                        {COGNITIVE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                        <TinyChevronIcon />
                      </span>
                    </div>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10.5px] text-[var(--text-muted)]">防御机制</span>
                    <div className="relative">
                      <select
                        value={draftMind.defenseStyle}
                        onChange={(e) =>
                          setDraftMind((prev) => ({
                            ...prev,
                            defenseStyle: e.target.value as DefenseStyle,
                          }))
                        }
                        className="w-full appearance-none pl-2.5 pr-7 py-1.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] focus:border-[var(--border-strong)] text-[11px] text-[var(--text-primary)] transition-surface focus:outline-none cursor-pointer"
                      >
                        {DEFENSE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                        <TinyChevronIcon />
                      </span>
                    </div>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10.5px] text-[var(--text-muted)]">意见分歧时</span>
                    <div className="relative">
                      <select
                        value={draftMind.disagreementStyle}
                        onChange={(e) =>
                          setDraftMind((prev) => ({
                            ...prev,
                            disagreementStyle: e.target.value as DisagreementStyle,
                          }))
                        }
                        className="w-full appearance-none pl-2.5 pr-7 py-1.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] focus:border-[var(--border-strong)] text-[11px] text-[var(--text-primary)] transition-surface focus:outline-none cursor-pointer"
                      >
                        {DISAGREEMENT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                        <TinyChevronIcon />
                      </span>
                    </div>
                  </label>
                  <TuningRangeSlider
                    label="口是心非 / 保留度"
                    mutedLabel
                    valuePct={Math.round(draftMind.subtextLevel * 100)}
                    onChangePct={(nextPct) =>
                      setDraftMind((prev) => ({
                        ...prev,
                        subtextLevel: Number((nextPct / 100).toFixed(2)),
                      }))
                    }
                  />
                </div>
              )}
            </div>

            {tuningError && (
              <div className="p-2.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-500 text-[10.5px]">
                {tuningError}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--border-hairline,var(--border-subtle))]">
              <button
                type="button"
                disabled={savingTuning}
                onClick={resetTuningDefaults}
                className="text-[10.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus-ring rounded cursor-pointer disabled:opacity-50"
              >
                恢复默认
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={savingTuning}
                  onClick={() => {
                    setEditingTuning(false);
                    setTuningError(null);
                  }}
                  className="px-2.5 py-1 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] transition-interactive focus-ring cursor-pointer disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={savingTuning}
                  onClick={handleSaveTuning}
                  className="px-3 py-1 rounded-full bg-[#18a999] hover:bg-[#149688] text-white text-[11px] font-medium transition-interactive focus-ring cursor-pointer disabled:opacity-50"
                >
                  {savingTuning ? "保存中..." : "保存调音"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 卡片 2：今日心境（跨场景生活板） */}
      <div className="p-3.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[12px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] truncate">
              今日心境
            </span>
            {dailyLife?.dateKey && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[9.5px] text-[var(--text-muted)] tabular-nums">
                {dailyLife.dateKey}
              </span>
            )}
          </div>
          {!dailyLoading && !dailyError && dailyLife && !editingDaily && (
            <button
              type="button"
              onClick={() => {
                setDraftMainEvent(dailyLife.mainEvent);
                setDraftMoodTone(dailyLife.moodTone);
                setDailySaveError(null);
                setEditingDaily(true);
              }}
              className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-medium transition-colors focus-ring rounded cursor-pointer"
            >
              修改
            </button>
          )}
        </div>

        {dailyLoading ? (
          <div className="space-y-2 py-1" aria-label="正在读取今日生活与心境">
            <div className="h-3 w-4/5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] animate-pulse" />
            <div className="h-3 w-3/5 rounded-full bg-black/[0.04] dark:bg-white/[0.05] animate-pulse" />
            <div className="text-[10.5px] text-[var(--text-muted)] pt-0.5">
              正在读取今日生活与心境…
            </div>
          </div>
        ) : dailyError ? (
          <div className="p-2.5 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-rose-500 leading-relaxed">{dailyError}</span>
            <button
              type="button"
              onClick={() => {
                setDailyLoading(true);
                setDailyError(null);
                setDailyReloadTick((t) => t + 1);
              }}
              className="shrink-0 px-2.5 py-1 rounded-full bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[10.5px] font-medium text-[var(--text-primary)] transition-interactive focus-ring cursor-pointer"
            >
              重试
            </button>
          </div>
        ) : editingDaily ? (
          <div className="space-y-2.5 animate-fade-in">
            <label className="block space-y-1">
              <span className="text-[10.5px] text-[var(--text-muted)]">今日生活主线</span>
              <textarea
                value={draftMainEvent}
                onChange={(e) => setDraftMainEvent(e.target.value)}
                rows={2}
                maxLength={160}
                className="w-full p-2.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus:border-[var(--border-strong)] focus-within-ring text-[11px] text-[var(--text-primary)] transition-surface focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10.5px] text-[var(--text-muted)]">今日心境底色</span>
              <input
                type="text"
                value={draftMoodTone}
                onChange={(e) => setDraftMoodTone(e.target.value)}
                maxLength={80}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus:border-[var(--border-strong)] focus-within-ring text-[11px] text-[var(--text-primary)] transition-surface focus:outline-none"
              />
            </label>
            {dailySaveError && (
              <div className="text-[10.5px] text-rose-500">{dailySaveError}</div>
            )}
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                disabled={savingDaily}
                onClick={() => {
                  setEditingDaily(false);
                  setDailySaveError(null);
                }}
                className="px-2.5 py-1 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] transition-interactive focus-ring cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingDaily}
                onClick={handleSaveDailyLife}
                className="px-3 py-1 rounded-full bg-[#18a999] hover:bg-[#149688] text-white text-[11px] font-medium transition-interactive focus-ring cursor-pointer disabled:opacity-50"
              >
                {savingDaily ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        ) : dailyLife ? (
          <div className="space-y-2 text-[11px]">
            <div className="text-[12px] text-[var(--text-primary)] leading-[1.6] break-words">
              {dailyLife.mainEvent}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-[#18a999]/10 border border-[#18a999]/20 text-[#18a999] text-[10.5px] font-medium">
                {dailyLife.moodTone}
              </span>
              {dailyLife.recentMoments.length > 0 && (
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                  · 已联动 {dailyLife.recentMoments.length} 条近期动态
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl border border-dashed border-[var(--border-hairline,var(--border-subtle))] text-[11px] text-[var(--text-muted)] leading-relaxed">
            今日生活板尚未生成，发起一条对话或刷新即可自动创建。
          </div>
        )}
      </div>

      {/* 卡片 3：TA 眼中的你（分角色隔离印象） */}
      <div className="p-3.5 rounded-2xl bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] truncate">
            TA 眼中的你
          </span>
          {!editingImpression && (
            <button
              type="button"
              onClick={openImpressionEditor}
              className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-medium transition-colors focus-ring rounded cursor-pointer"
            >
              {hasImpressionContent ? "修改" : "设定"}
            </button>
          )}
        </div>

        {editingImpression ? (
          <div className="space-y-2.5 animate-fade-in">
            <label className="block space-y-1">
              <span className="text-[10.5px] text-[var(--text-muted)]">对你的专属称呼</span>
              <input
                type="text"
                value={draftNickname}
                onChange={(e) => setDraftNickname(e.target.value)}
                maxLength={12}
                placeholder="例如：小橘、搭档"
                className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus:border-[var(--border-strong)] focus-within-ring text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-surface focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10.5px] text-[var(--text-muted)]">一句话印象</span>
              <textarea
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                rows={2}
                maxLength={100}
                placeholder="TA 眼里你是什么样的人"
                className="w-full p-2.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus:border-[var(--border-strong)] focus-within-ring text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-surface focus:outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10.5px] text-[var(--text-muted)]">最近相处感受</span>
              <input
                type="text"
                value={draftRecentVibe}
                onChange={(e) => setDraftRecentVibe(e.target.value)}
                maxLength={60}
                placeholder="例如：最近总互相吐槽但其实很信任"
                className="w-full px-2.5 py-1.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus:border-[var(--border-strong)] focus-within-ring text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-surface focus:outline-none"
              />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10.5px] text-[var(--text-muted)]">
                <span>观察到的习惯/偏好</span>
                <span className="tabular-nums">{draftHabits.length}/6</span>
              </div>
              {draftHabits.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {draftHabits.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[10.5px] text-[var(--text-primary)]"
                    >
                      <span className="break-all">{h}</span>
                      <button
                        type="button"
                        aria-label={`删除习惯 ${h}`}
                        onClick={() =>
                          setDraftHabits((prev) => prev.filter((item) => item !== h))
                        }
                        className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                      >
                        <TinyCloseIcon />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] focus-within:border-[var(--border-strong)] focus-within-ring transition-surface">
                <input
                  type="text"
                  value={newHabitInput}
                  onChange={(e) => setNewHabitInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addHabitTag();
                    }
                  }}
                  placeholder="新增习惯（如：爱喝冰美式）"
                  className="flex-1 min-w-0 bg-transparent px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addHabitTag}
                  className="shrink-0 px-2.5 py-1 rounded-[9px] bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[10.5px] font-medium text-[var(--text-primary)] transition-interactive cursor-pointer"
                >
                  添加
                </button>
              </div>
            </div>
            {impressionError && (
              <div className="text-[10.5px] text-rose-500">{impressionError}</div>
            )}
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                disabled={savingImpression}
                onClick={() => {
                  setEditingImpression(false);
                  setImpressionError(null);
                }}
                className="px-2.5 py-1 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] hover:border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] transition-interactive focus-ring cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingImpression}
                onClick={handleSaveImpression}
                className="px-3 py-1 rounded-full bg-[#18a999] hover:bg-[#149688] text-white text-[11px] font-medium transition-interactive focus-ring cursor-pointer disabled:opacity-50"
              >
                {savingImpression ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        ) : hasImpressionContent ? (
          <div className="space-y-2 text-[11px]">
            {currentImpression.nickname && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--text-muted)]">称呼</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#18a999]/10 border border-[#18a999]/20 text-[#18a999] text-[10.5px] font-medium">
                  {currentImpression.nickname}
                </span>
              </div>
            )}
            {currentImpression.summary && (
              <p className="text-[12px] text-[var(--text-primary)] leading-[1.6] break-words">
                {currentImpression.summary}
              </p>
            )}
            {currentImpression.recentVibe && (
              <div className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[10.5px] text-[var(--text-secondary)] leading-relaxed break-words">
                最近感觉：{currentImpression.recentVibe}
              </div>
            )}
            {currentImpression.observedHabits.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {currentImpression.observedHabits.map((h) => (
                  <span
                    key={h}
                    className="px-2.5 py-0.5 rounded-full bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] text-[10.5px] text-[var(--text-secondary)] break-all"
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-xl border border-dashed border-[var(--border-hairline,var(--border-subtle))] text-[11px] text-[var(--text-muted)] leading-relaxed">
            多聊几轮后，{persona.name} 会只在这边悄悄记下对你的专属称呼和习惯；也可以点「设定」先写几条。
          </div>
        )}
      </div>
    </div>
  );
}

function TuningRangeSlider({
  label,
  valuePct,
  onChangePct,
  mutedLabel = false,
}: {
  label: string;
  valuePct: number;
  onChangePct: (pct: number) => void;
  mutedLabel?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[10.5px]">
        <span className={mutedLabel ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>
          {label}
        </span>
        <span className="tabular-nums text-[var(--text-primary)] font-medium">
          {valuePct}%
        </span>
      </div>
      <div className="relative h-5 flex items-center select-none group">
        <div className="w-full h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#18a999] transition-[width] duration-75"
            style={{ width: `${valuePct}%` }}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white dark:bg-[#f4f4f6] shadow-[0_1px_3px_rgba(0,0,0,0.28),0_0_0_1px_rgba(0,0,0,0.08)] transition-transform duration-150 group-hover:scale-110 group-focus-within:scale-110 group-focus-within:ring-2 group-focus-within:ring-[var(--focus-ring-color)]"
          style={{ left: `calc(${valuePct}% - ${(valuePct / 100) * 14}px)` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={valuePct}
          aria-label={label}
          onChange={(e) => onChangePct(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
        />
      </div>
    </label>
  );
}

function TinyCloseIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function TinyChevronIcon({ rotated = false }: { rotated?: boolean }) {
  return (
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
      className={`transition-transform duration-150 ${rotated ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
