"use client";

import { useState } from "react";
import { PersonaRecord } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";

interface RightInspectorProps {
  persona: PersonaRecord | null;
  isStreaming?: boolean;
  autoNudgeEnabled?: boolean;
  onToggleAutoNudge?: () => void;
  onSavePersonaPatch: (patch: Partial<PersonaRecord>) => Promise<void>;
  onAddCorrection: (reason: string, category: string) => Promise<void>;
  onTriggerProactive: (hoursIdle?: number) => Promise<void>;
  onOpenAvatarPicker: () => void;
  onClose: () => void;
}

export default function RightInspector({
  persona,
  isStreaming = false,
  autoNudgeEnabled = true,
  onToggleAutoNudge,
  onSavePersonaPatch,
  onAddCorrection,
  onTriggerProactive,
  onOpenAvatarPicker,
  onClose,
}: RightInspectorProps) {
  const [section, setSection] = useState<"activity" | "library">("activity");
  const [libraryTab, setLibraryTab] = useState<
    "emotion" | "persona" | "memories" | "corrections"
  >("emotion");
  const [routineEnabled, setRoutineEnabled] = useState(true);
  const [voicePreset, setVoicePreset] = useState("Helix 1.0x");
  const [voiceLang, setVoiceLang] = useState("Auto-detect");
  const [editingPersonaMd, setEditingPersonaMd] = useState<string | null>(null);
  const [editingMemoriesMd, setEditingMemoriesMd] = useState<string | null>(
    null
  );
  const [editingAppearance, setEditingAppearance] = useState<string | null>(
    null
  );
  const [newCorrection, setNewCorrection] = useState("");
  const [saving, setSaving] = useState(false);

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
            onClick={() => setSection("activity")}
            className={`px-3.5 py-1 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
              section === "activity"
                ? "bg-[var(--bg-composer)] text-[var(--text-primary)] grok-active-row"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            动态
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
          <div className="space-y-4 animate-fade-in">
            {/* 即将进行 */}
            <div>
              <div className="px-1 pb-1.5 text-[11.5px] font-medium text-[var(--text-muted)]">
                即将进行
              </div>
              <div className="p-3.5 rounded-[18px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-[13px] text-[var(--text-secondary)] shrink-0">
                    🕒
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate">
                      {persona.name} 每日三次汇报
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      每天 9:00、14:00 和 19:00 左右
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={routineEnabled}
                  onClick={() => setRoutineEnabled((v) => !v)}
                  className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                    routineEnabled
                      ? "bg-[#1683FF]"
                      : "bg-black/15 dark:bg-white/20"
                  }`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      routineEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {onToggleAutoNudge && (
                <div className="mt-2 p-3.5 rounded-[18px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-[13px] text-[var(--text-secondary)] shrink-0">
                      💬
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate">
                        未回复主动追问
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                        沉默 45 秒后结合语境轻敲追问
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoNudgeEnabled}
                    onClick={onToggleAutoNudge}
                    className={`w-10 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                      autoNudgeEnabled
                        ? "bg-[#1683FF]"
                        : "bg-black/15 dark:bg-white/20"
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        autoNudgeEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* 电脑 ("Bot 的电脑") */}
            <div>
              <div className="px-1 pb-1.5 text-[11.5px] font-medium text-[var(--text-muted)]">
                电脑
              </div>
              <button
                type="button"
                onClick={() => void onTriggerProactive(1)}
                className="w-full p-3.5 rounded-[18px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-left hover:border-[var(--border-strong)] transition-all cursor-pointer"
                title="点击唤醒 Bot 主动发一条最新动态"
              >
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Bot 的电脑
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {isStreaming ? "工作运转中..." : "休眠中"}
                  </div>
                </div>

                {/* Mini Screen Card */}
                <div className="relative w-[76px] h-[46px] rounded-[10px] bg-gradient-to-br from-neutral-400/70 to-neutral-500/80 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                  <BlobMascot
                    shape={mascotCfg.shape}
                    color={isStreaming ? mascotCfg.color : "#3A3A3E"}
                    size={22}
                    trackPointer={false}
                    state={isStreaming ? "working" : "idle"}
                  />
                  {!isStreaming && (
                    <span className="absolute top-1 right-1.5 text-[9px] font-semibold text-white/75 select-none">
                      z<sup className="text-[7px]">z</sup>
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* 语音聊天 */}
            <div>
              <div className="px-1 pb-1.5 text-[11.5px] font-medium text-[var(--text-muted)]">
                语音聊天
              </div>
              <div className="rounded-[18px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-[12.5px] text-[var(--text-primary)]">
                    语音
                  </span>
                  <select
                    value={voicePreset}
                    onChange={(e) => setVoicePreset(e.target.value)}
                    className="bg-transparent text-[12px] text-[var(--text-secondary)] focus:outline-none cursor-pointer"
                  >
                    <option value="Helix 1.0x">Helix 1.0x</option>
                    <option value="Sol 1.1x">Sol 1.1x</option>
                    <option value="Ara 0.95x">Ara 0.95x</option>
                  </select>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-[12.5px] text-[var(--text-primary)]">
                    语言
                  </span>
                  <select
                    value={voiceLang}
                    onChange={(e) => setVoiceLang(e.target.value)}
                    className="bg-transparent text-[12px] text-[var(--text-secondary)] focus:outline-none cursor-pointer"
                  >
                    <option value="Auto-detect">Auto-detect</option>
                    <option value="简体中文">简体中文</option>
                    <option value="English">English</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 时间感知快速触发 */}
            <div className="p-3.5 rounded-[18px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2">
              <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                ⏰ 时间感知与主动破冰
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => void onTriggerProactive(1)}
                  className="py-2 px-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  ⚡ 结合当前时段主动找你开口
                </button>
                <button
                  type="button"
                  onClick={() => void onTriggerProactive(12)}
                  className="py-2 px-3 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  🌙 模拟冷落 TA 12 小时后的吐槽
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 animate-fade-in">
            {/* Sub-tabs inside 资料库 */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] text-[11px]">
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
                    setLibraryTab(
                      tab.id as "emotion" | "persona" | "memories" | "corrections"
                    )
                  }
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

                {/* Consistent Photo Appearance Anchor Editor */}
                <div className="p-3.5 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)]">
                      固定外貌与画风锚点
                    </span>
                    {editingAppearance === null ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingAppearance(
                            persona.profile.appearanceAnchor || ""
                          )
                        }
                        className="text-[#18a999] text-[11px] font-medium hover:underline cursor-pointer"
                      >
                        {persona.profile.appearanceAnchor ? "修改" : "设定"}
                      </button>
                    ) : (
                      <div className="flex gap-2 text-[11px]">
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
                            await onSavePersonaPatch({
                              profile: {
                                ...persona.profile,
                                appearanceAnchor:
                                  editingAppearance.trim() || undefined,
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
              </div>
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
        )}
      </div>
    </aside>
  );
}
