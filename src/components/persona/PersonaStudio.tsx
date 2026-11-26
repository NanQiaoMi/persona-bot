"use client";

import Link from "next/link";
import LineIcon from "@/components/workspace/LineIcon";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode } from "@/lib/storage/types";

const MBTI_LIST = [
  "ENTP",
  "INFP",
  "ENFJ",
  "INTJ",
  "ENFP",
  "INFJ",
  "INTP",
  "ENTJ",
  "ISFP",
  "ISTP",
  "ESFP",
  "ISFJ",
];

const QUICK_TAGS = [
  "嘴硬心软",
  "毒舌幽默",
  "高共情",
  "夜猫子",
  "爱翻旧账",
  "细节控",
  "第一性原理",
  "反套路",
  "傲娇",
  "秒回体质",
  "吃瓜达人",
  "温柔护短",
];

const AVATAR_EMOJIS = ["⚡", "🌙", "🌸", "🛸", "🦊", "🐱", "🔥", "🌊", "🎧", "🍸"];

interface DistillPreview {
  slug: string;
  name: string;
  isLiveLLM?: boolean;
  chatStats?: {
    totalCount: number;
    targetCount: number;
    participants: string[];
    topCatchphrases: string[];
  };
  stages: {
    aiProfile: string;
    analysis: string;
    persona: string;
    memories: string;
  };
}

export default function PersonaStudio() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modeTab, setModeTab] = useState<"quick" | "chatlog">("quick");
  const [name, setName] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("⚡");
  const [defaultMode, setDefaultMode] = useState<PersonaMode>("authentic");
  const [basicInfo, setBasicInfo] = useState("");
  const [selectedMbti, setSelectedMbti] = useState("ENFP");
  const [selectedTags, setSelectedTags] = useState<string[]>([
    "嘴硬心软",
    "夜猫子",
  ]);
  const [extraPersonality, setExtraPersonality] = useState("");

  // Chat log import tab states
  const [chatLogText, setChatLogText] = useState("");
  const [fileName, setFileName] = useState("");
  const [targetSpeaker, setTargetSpeaker] = useState("");

  // Distillation progress & preview
  const [distilling, setDistilling] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DistillPreview | null>(null);
  const [previewTab, setPreviewTab] = useState<"persona" | "memories" | "profile">("persona");

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setChatLogText(text);
    if (!name.trim()) {
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      setName(base.slice(0, 18));
    }
  };

  const handleDistill = async () => {
    if (!name.trim()) {
      setError("请先输入角色昵称或代号");
      return;
    }
    setError("");
    setDistilling(true);
    setStageIndex(1);

    const timer = setInterval(() => {
      setStageIndex((prev) => (prev < 5 ? prev + 1 : prev));
    }, 350);

    try {
      const combinedPersonality = [
        selectedMbti,
        ...selectedTags,
        extraPersonality.trim(),
      ]
        .filter(Boolean)
        .join(" · ");

      const res = await fetch("/api/persona/pipeline-v3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          basicInfo:
            basicInfo.trim() ||
            "认识很久、彼此非常熟悉、在私密聊天软件中无话不谈的关系",
          personalityInfo: combinedPersonality,
          chatLogText: modeTab === "chatlog" ? chatLogText : undefined,
          targetSpeaker: targetSpeaker.trim() || name.trim(),
          defaultMode,
          avatarEmoji,
        }),
      });

      const data = await res.json();
      clearInterval(timer);

      if (!res.ok || !data.success) {
        throw new Error(data.error || "角色蒸馏失败");
      }

      setStageIndex(5);
      setPreview({
        slug: data.slug,
        name: name.trim(),
        isLiveLLM: data.isLiveLLM,
        chatStats: data.chatStats,
        stages: data.stages,
      });
    } catch (err) {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : "蒸馏过程中出现异常");
    } finally {
      setDistilling(false);
    }
  };

  const STAGE_LABELS = [
    "Stage 1 · 构建人物全息心理画像",
    "Stage 2 · 解构语言指纹与口头禅",
    "Stage 3 · 编译五层性格结构 (persona.md)",
    "Stage 4 · 蒸馏共同记忆锚点 (memories.md)",
    "Stage 5 · 注入 Grok 实时大脑与情绪状态机",
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
      {/* Top Bar */}
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
              ✨ 角色灵魂蒸馏工作室 (Persona Studio)
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              纯 TypeScript 五阶段蒸馏管线 · 生成五层人格结构与共同记忆并装配 Grok 大脑
            </p>
          </div>
        </div>

        <Link
          href="/gallery"
          className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-emerald-300 transition-all"
        >
          🪐 角色引力场广场
        </Link>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Creation Form */}
        <div className="lg:col-span-7 space-y-5">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setModeTab("quick")}
              className={`py-2.5 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                modeTab === "quick"
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>⚡</span>
              <span>3 步极速设定蒸馏</span>
            </button>
            <button
              type="button"
              onClick={() => setModeTab("chatlog")}
              className={`py-2.5 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                modeTab === "chatlog"
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>📥</span>
              <span>导入微信 / 聊天记录深度蒸馏</span>
            </button>
          </div>

          {/* Step 1: Identity & Grok Mode */}
          <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              STEP 1 · 角色代号、形象与默认 Grok 人格尺度
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                  角色昵称 / 代号 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：小美、阿杰、赛博搭子..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                  头像标识 Emoji
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {AVATAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatarEmoji(emoji)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border transition-all ${
                        avatarEmoji === emoji
                          ? "border-emerald-500 bg-emerald-500/20 scale-105"
                          : "border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Default Grok Mode */}
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                默认 Grok 人格尺度（对话中可随时切换）
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(PERSONA_MODES) as PersonaMode[]).map((mKey) => {
                  const spec = PERSONA_MODES[mKey];
                  const active = defaultMode === mKey;
                  return (
                    <button
                      key={mKey}
                      type="button"
                      onClick={() => setDefaultMode(mKey)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        active
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                          : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                      }`}
                    >
                      <div className="text-xs font-bold inline-flex items-center gap-1.5">
                        <LineIcon name={spec.icon} size={13} /> {spec.shortLabel}
                      </div>
                      <div className="text-[10px] opacity-75 line-clamp-1 mt-0.5">
                        {spec.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chat Log Upload Card (Only in chatlog mode) */}
          {modeTab === "chatlog" && (
            <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-emerald-500/30 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  STEP 2 · 上传或粘贴真实聊天记录（微信 / iMessage / 文本）
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const demoTarget = name.trim() || "小美";
                    setTargetSpeaker(demoTarget);
                    setChatLogText(
                      `2026-05-10 22:15:00 ${demoTarget}: 笑死，你今天居然这么早下班？\n2026-05-10 22:15:30 我: 刚忙完，累麻了\n2026-05-10 22:16:00 ${demoTarget}: 不是吧，那你还不好好歇着，快去点杯热奶茶犒劳一下自己\n2026-05-10 22:17:10 ${demoTarget}: 对了，上次你说周末一起去看展的事我可还记着呢，不许放鸽子啊`
                    );
                  }}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  填入示例聊天记录
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    聊天记录中对方的发言昵称
                  </label>
                  <input
                    type="text"
                    value={targetSpeaker}
                    onChange={(e) => setTargetSpeaker(e.target.value)}
                    placeholder={name || "例如：小美"}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    上传导出文件 (.txt / .csv / .html)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,.html,.json,.md"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-3 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-xs text-emerald-300 truncate"
                  >
                    {fileName ? `已加载: ${fileName}` : "📂 点击选择聊天记录文件"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  或直接粘贴聊天记录片段（系统会自动识别口头禅、句长与原话样本）
                </label>
                <textarea
                  value={chatLogText}
                  onChange={(e) => setChatLogText(e.target.value)}
                  rows={5}
                  placeholder={`2026-05-01 21:00:00 小美: 笑死，你今天怎么这么晚才回消息\n2026-05-01 21:01:00 我: 刚开完会\n2026-05-01 21:01:20 小美: 行吧，看在你这么可怜的份上原谅你了`}
                  className="w-full p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs font-mono leading-relaxed focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 2/3: Story & Personality Fingerprint */}
          <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {modeTab === "chatlog" ? "STEP 3" : "STEP 2"} · 关系故事与性格基因
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!name.trim()) setName("夏栀");
                  setBasicInfo(
                    "大学认识三年的欢喜冤家，平时最爱深夜一起吐槽热搜、分享歌单，去过海边看日出"
                  );
                  setExtraPersonality(
                    "嘴上不饶人但极其护短，习惯连发短句，喜欢用“笑死”、“不是吧”、“随你便”"
                  );
                }}
                className="text-xs text-emerald-400 hover:underline"
              >
                ✨ 一键填入灵感模板
              </button>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                你们的关系背景与共同故事
              </label>
              <textarea
                value={basicInfo}
                onChange={(e) => setBasicInfo(e.target.value)}
                rows={2}
                placeholder="例如：在一起三年 / 认识两年的深夜冲浪搭子 / 共同去过哪些地方、有什么专属暗号..."
                className="w-full p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs leading-relaxed focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                MBTI 人格基底
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MBTI_LIST.map((mbti) => (
                  <button
                    key={mbti}
                    type="button"
                    onClick={() => setSelectedMbti(mbti)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      selectedMbti === mbti
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {mbti}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                核心性格标签（点击多选）
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                        active
                          ? "border-purple-500 bg-purple-500/20 text-purple-300"
                          : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {active ? `✓ ${tag}` : tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                补充口头禅或小习惯（可选）
              </label>
              <input
                type="text"
                value={extraPersonality}
                onChange={(e) => setExtraPersonality(e.target.value)}
                placeholder="例如：生气时不爱说话、喜欢喝冰美式、口头禅是“服了你了”..."
                className="w-full px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs focus:outline-none"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={distilling}
              onClick={handleDistill}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all"
            >
              {distilling
                ? "🧠 正在执行五阶段灵魂蒸馏..."
                : "✨ 启动五阶段灵魂蒸馏并装配 Grok 大脑"}
            </button>
          </div>
        </div>

        {/* Right 5 Cols: Live 5-Stage Progress & Persona Preview */}
        <div className="lg:col-span-5 space-y-5">
          <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-4 sticky top-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                五阶段蒸馏实时监视器
              </h3>
              {preview && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                  ✓ 蒸馏完成
                </span>
              )}
            </div>

            {/* 5 Stage Checklist */}
            <div className="space-y-2">
              {STAGE_LABELS.map((label, idx) => {
                const stepNum = idx + 1;
                const isDone = stageIndex > stepNum || Boolean(preview);
                const isCurrent = distilling && stageIndex === stepNum;
                return (
                  <div
                    key={label}
                    className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between transition-all ${
                      isDone
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : isCurrent
                          ? "border-purple-500/40 bg-purple-500/15 text-purple-200 animate-pulse"
                          : "border-[var(--border-subtle)] bg-[var(--bg-primary)]/50 text-[var(--text-muted)]"
                    }`}
                  >
                    <span>{label}</span>
                    <span>{isDone ? "✓" : isCurrent ? "•••" : "○"}</span>
                  </div>
                );
              })}
            </div>

            {/* Chat Corpus Stats if parsed */}
            {preview?.chatStats && (
              <div className="p-3 rounded-xl bg-[var(--bg-primary)] border border-emerald-500/30 text-xs space-y-1">
                <div className="font-semibold text-emerald-300">
                  📊 真实聊天语料特征提取报告
                </div>
                <div className="text-[var(--text-secondary)]">
                  共解析 {preview.chatStats.totalCount} 条对话，锁定目标角色发言{" "}
                  {preview.chatStats.targetCount} 条
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  高频口头禅：{preview.chatStats.topCatchphrases.join(" / ")}
                </div>
              </div>
            )}

            {/* Preview Tabs */}
            {preview ? (
              <div className="space-y-3 pt-2 animate-fade-in">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px]">
                  {[
                    { id: "persona", label: "五层人格" },
                    { id: "memories", label: "共同记忆" },
                    { id: "profile", label: "全息画像" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setPreviewTab(
                          t.id as "persona" | "memories" | "profile"
                        )
                      }
                      className={`py-1 rounded-lg font-medium ${
                        previewTab === t.id
                          ? "bg-[var(--bg-tertiary)] text-emerald-300"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <pre className="p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[11px] text-[var(--text-secondary)] leading-relaxed font-sans">
                  {previewTab === "persona"
                    ? preview.stages.persona
                    : previewTab === "memories"
                      ? preview.stages.memories
                      : preview.stages.aiProfile}
                </pre>

                <button
                  type="button"
                  onClick={() => router.push(`/chat/${preview.slug}`)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-400 hover:opacity-95 text-slate-950 font-bold text-sm shadow-lg"
                >
                  🚀 立即与「{preview.name}」开启 Grok 对话 →
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
                填写左侧设定或导入聊天记录后点击蒸馏，这里将实时呈现生成的五层人格结构与共同记忆文档。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
