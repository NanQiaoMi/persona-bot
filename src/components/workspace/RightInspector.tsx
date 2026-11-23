"use client";

import { useState } from "react";
import { PersonaRecord } from "@/lib/storage/types";
import BlobMascot, { getBlobVariantForSlug } from "./BlobMascot";

interface RightInspectorProps {
  persona: PersonaRecord | null;
  onSavePersonaPatch: (patch: Partial<PersonaRecord>) => Promise<void>;
  onAddCorrection: (reason: string, category: string) => Promise<void>;
  onTriggerProactive: (hoursIdle?: number) => Promise<void>;
  onClose: () => void;
}

export default function RightInspector({
  persona,
  onSavePersonaPatch,
  onAddCorrection,
  onTriggerProactive,
  onClose,
}: RightInspectorProps) {
  const [activeTab, setActiveTab] = useState<
    "emotion" | "persona" | "memories" | "corrections"
  >("emotion");
  const [editingPersonaMd, setEditingPersonaMd] = useState<string | null>(null);
  const [editingMemoriesMd, setEditingMemoriesMd] = useState<string | null>(null);
  const [newCorrection, setNewCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  if (!persona) {
    return (
      <aside className="w-80 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 flex items-center justify-center text-xs text-[var(--text-muted)]">
        正在加载角色状态舱...
      </aside>
    );
  }

  const pleasurePct = Math.round(((persona.emotionState.pleasure + 1) / 2) * 100);
  const arousalPct = Math.round(persona.emotionState.arousal * 100);
  const dominancePct = Math.round(persona.emotionState.dominance * 100);

  return (
    <aside className="w-80 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col h-screen animate-fade-in">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BlobMascot variant={getBlobVariantForSlug(persona.slug)} size={28} />
          <div>
            <h3 className="text-xs font-bold text-[var(--text-primary)]">
              {persona.name} · 灵魂状态舱
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              {persona.profile.mbti || "Persona"} · {persona.version}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="收起状态舱"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="p-2 border-b border-[var(--border-subtle)] grid grid-cols-4 gap-1 text-[11px]">
        {[
          { id: "emotion", label: "情绪雷达" },
          { id: "persona", label: "五层人格" },
          { id: "memories", label: "共同记忆" },
          { id: "corrections", label: "纠偏OOC" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() =>
              setActiveTab(
                tab.id as "emotion" | "persona" | "memories" | "corrections"
              )
            }
            className={`py-1.5 rounded-xl font-medium transition-all ${
              activeTab === tab.id
                ? "bg-[var(--bg-composer)] text-[var(--text-primary)] grok-active-row"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
        {activeTab === "emotion" && (
          <div className="space-y-3.5 animate-fade-in">
            {/* Mood & Intimacy Card */}
            <div className="p-4 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">当前心情</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#18a999]/12 text-[#18a999] font-semibold">
                  {persona.emotionState.moodLabel || persona.emotionState.primary}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[var(--text-secondary)]">亲密度 / 好感度</span>
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
            </div>

            {/* PAD 3D Emotion Radar Bars */}
            <div className="p-4 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card space-y-3">
              <div className="font-semibold text-[var(--text-primary)]">
                PAD 三维情绪状态机
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--text-secondary)]">愉悦度 (Pleasure)</span>
                  <span className="tabular-nums font-medium">{pleasurePct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#18a999] transition-all duration-500"
                    style={{ width: `${pleasurePct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--text-secondary)]">激活度 (Arousal)</span>
                  <span className="tabular-nums font-medium">{arousalPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${arousalPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--text-secondary)]">掌控感 (Dominance)</span>
                  <span className="tabular-nums font-medium">{dominancePct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-500"
                    style={{ width: `${dominancePct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Profile Tags */}
            <div className="p-4 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card space-y-2.5">
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

            {/* Time Awareness Triggers */}
            <div className="p-4 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card space-y-2">
              <div className="font-semibold text-[var(--text-primary)]">
                ⏰ 时间感知与主动破冰
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                模拟不同时间跨度下角色的情绪自然衰减与主动敲门：
              </p>
              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onTriggerProactive(1)}
                  className="py-2 px-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-left text-[var(--text-primary)] transition-all"
                >
                  ⚡ 结合当前时段主动找你开口
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerProactive(12)}
                  className="py-2 px-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-left text-[var(--text-primary)] transition-all"
                >
                  🌙 模拟冷落 TA 12 小时后的吃醋/吐槽
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "persona" && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-semibold">五层性格结构 (persona.md)</span>
              {editingPersonaMd === null ? (
                <button
                  type="button"
                  onClick={() => setEditingPersonaMd(persona.personaMd)}
                  className="text-[#18a999] font-medium hover:underline"
                >
                  编辑设定
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPersonaMd(null)}
                    className="text-[var(--text-muted)]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      await onSavePersonaPatch({ personaMd: editingPersonaMd });
                      setEditingPersonaMd(null);
                      setSaving(false);
                    }}
                    className="text-[#18a999] font-semibold"
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
                rows={20}
                className="w-full p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-strong)] text-xs font-mono leading-relaxed focus:outline-none"
              />
            ) : (
              <pre className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] whitespace-pre-wrap break-words text-[11.5px] text-[var(--text-secondary)] leading-relaxed font-sans">
                {persona.personaMd}
              </pre>
            )}
          </div>
        )}

        {activeTab === "memories" && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-semibold">共同记忆库 (memories.md)</span>
              {editingMemoriesMd === null ? (
                <button
                  type="button"
                  onClick={() => setEditingMemoriesMd(persona.memoriesMd)}
                  className="text-[#18a999] font-medium hover:underline"
                >
                  编辑记忆
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingMemoriesMd(null)}
                    className="text-[var(--text-muted)]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      await onSavePersonaPatch({ memoriesMd: editingMemoriesMd });
                      setEditingMemoriesMd(null);
                      setSaving(false);
                    }}
                    className="text-[#18a999] font-semibold"
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
                rows={18}
                className="w-full p-3 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-strong)] text-xs font-mono leading-relaxed focus:outline-none"
              />
            ) : (
              <pre className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] whitespace-pre-wrap break-words text-[11.5px] text-[var(--text-secondary)] leading-relaxed font-sans">
                {persona.memoriesMd}
              </pre>
            )}
          </div>
        )}

        {activeTab === "corrections" && (
          <div className="space-y-3 animate-fade-in">
            <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card space-y-2.5">
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
                className="w-full py-2 rounded-full bg-[#18a999] hover:bg-[#149688] disabled:opacity-40 text-white font-semibold text-xs transition-all"
              >
                写入永久纠偏层
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] text-[var(--text-muted)]">
                已生效纠偏记录 ({persona.corrections?.length || 0})
              </div>
              {(!persona.corrections || persona.corrections.length === 0) ? (
                <div className="p-4 rounded-2xl border border-dashed border-[var(--border-subtle)] text-center text-[var(--text-muted)]">
                  暂无纠偏记录，也可直接在聊天气泡旁点击「纠偏」按钮
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
      </div>
    </aside>
  );
}
