"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  FieldInput,
  FieldTextarea,
} from "@/components/primitives";
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

  // 聊天记录导入状态
  const [chatLogText, setChatLogText] = useState("");
  const [fileName, setFileName] = useState("");
  const [targetSpeaker, setTargetSpeaker] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // 蒸馏进度与结果预览
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

  const applyUploadedFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    setChatLogText(text);
    if (!name.trim()) {
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      setName(base.slice(0, 18));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await applyUploadedFile(file);
  };

  const handleDropLog = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await applyUploadedFile(file);
  };

  const handleDistill = async () => {
    if (!name.trim()) {
      setError("请先输入角色昵称，再开始创建");
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
        throw new Error(data.error || "角色生成失败，请检查内容后重试");
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
      setError(err instanceof Error ? err.message : "生成过程中出现异常，请稍后再试");
    } finally {
      setDistilling(false);
    }
  };

  const STAGE_LABELS = [
    "步骤 1 · 构建人物全息心理画像",
    "步骤 2 · 提取说话习惯与口头禅",
    "步骤 3 · 编译五层性格结构",
    "步骤 4 · 整理共同记忆锚点",
    "步骤 5 · 装载实时对话与情绪状态",
  ];

  const totalSteps = modeTab === "chatlog" ? 3 : 2;
  const completedRatio = preview ? 100 : distilling ? stageIndex * 20 : 0;

  return (
    <div className="min-h-screen bg-surface-base text-primary flex flex-col">
      {/* Top Bar */}
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
              <h1 className="text-[16px] font-bold text-primary truncate">创建角色</h1>
              <p className="text-[12px] text-muted truncate">
                快速设定或导入真实聊天记录，生成带独立性格与共同记忆的对话角色
              </p>
            </div>
          </div>

          <Link
            href="/gallery"
            className="px-4 py-1.5 rounded-full bg-surface-raised hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[12px] text-secondary hover:text-primary transition-colors shrink-0"
          >
            角色广场
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Creation Form */}
        <div className="lg:col-span-7 space-y-5">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-[var(--r-lg)] bg-surface-raised border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setModeTab("quick")}
              className={`py-2.5 px-4 rounded-[var(--r-md)] text-[13px] font-medium transition-colors cursor-pointer ${
                modeTab === "quick"
                  ? "bg-brand text-white shadow-flat"
                  : "text-secondary hover:text-primary"
              }`}
            >
              快速设定创建（2 步）
            </button>
            <button
              type="button"
              onClick={() => setModeTab("chatlog")}
              className={`py-2.5 px-4 rounded-[var(--r-md)] text-[13px] font-medium transition-colors cursor-pointer ${
                modeTab === "chatlog"
                  ? "bg-brand text-white shadow-flat"
                  : "text-secondary hover:text-primary"
              }`}
            >
              导入聊天记录（3 步）
            </button>
          </div>

          {/* Step 1: Identity & Mode */}
          <Card variant="flat" padding="lg" className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-brand">
                第 1 / {totalSteps} 步 · 基础身份与说话尺度
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="角色昵称 *">
                <FieldInput
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：小美、阿杰、赛博搭子..."
                  className="!bg-surface-base"
                />
              </Field>

              <Field label="角色标识符号">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {AVATAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatarEmoji(emoji)}
                      className={`w-8 h-8 rounded-[var(--r-sm)] flex items-center justify-center text-[16px] border transition-colors cursor-pointer ${
                        avatarEmoji === emoji
                          ? "border-brand bg-brand-soft"
                          : "border-[var(--border-subtle)] bg-surface-base hover:bg-[var(--bg-hover)]"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="默认对话风格（对话中可随时切换）">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(PERSONA_MODES) as PersonaMode[]).map((mKey) => {
                  const spec = PERSONA_MODES[mKey];
                  const active = defaultMode === mKey;
                  return (
                    <button
                      key={mKey}
                      type="button"
                      onClick={() => setDefaultMode(mKey)}
                      className={`p-2.5 rounded-[var(--r-md)] border text-left transition-colors cursor-pointer ${
                        active
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-[var(--border-subtle)] bg-surface-base text-secondary hover:text-primary"
                      }`}
                    >
                      <div className="text-[12px] font-semibold">
                        {spec.badge} {spec.shortLabel}
                      </div>
                      <div className="text-[11px] opacity-80 line-clamp-1 mt-0.5">
                        {spec.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>
          </Card>

          {/* Chat Log Upload Card (Only in chatlog mode) */}
          {modeTab === "chatlog" && (
            <Card variant="flat" padding="lg" className="space-y-4 border-brand/30 animate-fade-in">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-brand">
                  第 2 / 3 步 · 上传或粘贴聊天记录
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
                  className="text-[12px] text-brand hover:underline cursor-pointer"
                >
                  填入示例聊天记录
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="聊天记录中对方的发言昵称">
                  <FieldInput
                    type="text"
                    value={targetSpeaker}
                    onChange={(e) => setTargetSpeaker(e.target.value)}
                    placeholder={name || "例如：小美"}
                    className="!bg-surface-base !text-[12px]"
                  />
                </Field>

                <Field label="拖拽或选择导出文件 (.txt / .csv / .html)">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.csv,.html,.json,.md"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => void handleDropLog(e)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full py-2 px-3 rounded-[var(--r-md)] border border-dashed text-[12px] truncate cursor-pointer transition-colors text-center ${
                      dragActive
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-[var(--border-strong)] bg-surface-base hover:border-brand text-secondary"
                    }`}
                  >
                    {fileName ? `已加载：${fileName}` : "拖拽文件到此处，或点击选择"}
                  </div>
                </Field>
              </div>

              <Field label="或直接粘贴聊天记录片段（系统会自动识别口头禅、句长与原话样本）">
                <FieldTextarea
                  value={chatLogText}
                  onChange={(e) => setChatLogText(e.target.value)}
                  rows={5}
                  placeholder={`2026-05-01 21:00:00 小美: 笑死，你今天怎么这么晚才回消息\n2026-05-01 21:01:00 我: 刚开完会\n2026-05-01 21:01:20 小美: 行吧，看在你这么可怜的份上原谅你了`}
                  className="!bg-surface-base !text-[12px] !font-mono"
                />
              </Field>
            </Card>
          )}

          {/* Step 2/3: Story & Personality Fingerprint */}
          <Card variant="flat" padding="lg" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[12px] font-semibold text-brand">
                第 {modeTab === "chatlog" ? 3 : 2} / {totalSteps} 步 · 关系背景与性格特征
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
                className="text-[12px] text-brand hover:underline cursor-pointer"
              >
                填入灵感模板
              </button>
            </div>

            <Field label="你们的关系背景与共同故事">
              <FieldTextarea
                value={basicInfo}
                onChange={(e) => setBasicInfo(e.target.value)}
                rows={2}
                placeholder="例如：认识两年的深夜搭子 / 共同去过哪些地方、有什么专属暗号..."
                className="!bg-surface-base !text-[12px]"
              />
            </Field>

            <Field label="性格类型 (MBTI)">
              <div className="flex flex-wrap gap-1.5">
                {MBTI_LIST.map((mbti) => (
                  <Chip
                    key={mbti}
                    size="sm"
                    selected={selectedMbti === mbti}
                    onClick={() => setSelectedMbti(mbti)}
                  >
                    {mbti}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="核心性格标签（点击多选）">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Chip
                      key={tag}
                      size="sm"
                      tone="info"
                      selected={active}
                      onClick={() => toggleTag(tag)}
                    >
                      {active ? `✓ ${tag}` : tag}
                    </Chip>
                  );
                })}
              </div>
            </Field>

            <Field label="补充口头禅或小习惯（可选）">
              <FieldInput
                type="text"
                value={extraPersonality}
                onChange={(e) => setExtraPersonality(e.target.value)}
                placeholder="例如：生气时不爱说话、喜欢喝冰美式、口头禅是“服了你了”..."
                className="!bg-surface-base !text-[12px]"
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-[var(--r-md)] bg-danger-soft border border-[var(--sem-danger)]/25 text-danger text-[12px]"
              >
                {error}
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              disabled={distilling}
              loading={distilling}
              onClick={handleDistill}
              className="w-full"
            >
              {distilling ? "正在生成角色档案..." : "生成角色并进入对话"}
            </Button>
          </Card>
        </div>

        {/* Right 5 Cols: Live 5-Stage Progress & Persona Preview */}
        <div className="lg:col-span-5 space-y-5">
          <Card variant="flat" padding="lg" className="space-y-4 sticky top-24">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-primary">
                生成进度与档案预览
              </h2>
              {preview && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-success-soft text-success font-medium">
                  ✓ 已就绪
                </span>
              )}
            </div>

            {/* Stage Progress Bar */}
            <div className="space-y-1.5">
              <div className="h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-[var(--motion-slow)]"
                  style={{ width: `${completedRatio}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted">
                <span>{distilling ? "处理中..." : preview ? "全部完成" : "等待开始"}</span>
                <span className="tabular-nums">{completedRatio}%</span>
              </div>
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
                    className={`px-3 py-2 rounded-[var(--r-md)] border text-[12px] flex items-center justify-between transition-colors ${
                      isDone
                        ? "border-[var(--sem-success)]/30 bg-success-soft text-success"
                        : isCurrent
                          ? "border-brand bg-brand-soft text-brand animate-pulse"
                          : "border-[var(--border-subtle)] bg-surface-base text-muted"
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
              <div className="p-3 rounded-[var(--r-md)] bg-surface-base border border-brand/30 text-[12px] space-y-1">
                <div className="font-semibold text-brand">语料提取结果</div>
                <div className="text-secondary">
                  共解析 {preview.chatStats.totalCount} 条对话，锁定目标发言{" "}
                  {preview.chatStats.targetCount} 条
                </div>
                <div className="text-[11px] text-muted">
                  高频口头禅：{preview.chatStats.topCatchphrases.join(" / ")}
                </div>
              </div>
            )}

            {/* Preview Tabs */}
            {preview ? (
              <div className="space-y-3 pt-2 animate-fade-in">
                <div className="grid grid-cols-3 gap-1 p-1 rounded-[var(--r-md)] bg-surface-base border border-[var(--border-subtle)] text-[11px]">
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
                      className={`py-1.5 rounded-[var(--r-sm)] font-medium cursor-pointer transition-colors ${
                        previewTab === t.id
                          ? "bg-surface-raised text-brand"
                          : "text-muted hover:text-primary"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <pre className="p-3 rounded-[var(--r-md)] bg-surface-base border border-[var(--border-subtle)] max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[12px] text-secondary leading-relaxed font-sans">
                  {previewTab === "persona"
                    ? preview.stages.persona
                    : previewTab === "memories"
                      ? preview.stages.memories
                      : preview.stages.aiProfile}
                </pre>

                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => router.push(`/chat/${preview.slug}`)}
                  className="w-full"
                >
                  立即与「{preview.name}」开始对话 →
                </Button>
              </div>
            ) : (
              <div className="p-5 rounded-[var(--r-md)] border border-dashed border-[var(--border-subtle)] text-center text-[12px] text-muted leading-relaxed">
                填写左侧信息或上传聊天记录后点击生成，这里会逐步展示角色的人格结构与共同记忆。
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
