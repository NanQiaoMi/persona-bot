"use client";

import { useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode, PersonaSummary } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";

interface GrokComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (options?: {
    imageUrl?: string;
    requestPhoto?: boolean;
    requestSticker?: boolean;
    mentionedSlug?: string;
  }) => void;
  disabled?: boolean;
  thinkMode: boolean;
  onToggleThink: () => void;
  deepSearch: boolean;
  onToggleDeepSearch: () => void;
  activeMode: PersonaMode;
  onChangeMode: (mode: PersonaMode) => void;
  onTriggerProactive: () => void;
  onOpenImport: () => void;
  personaName?: string;
  accentColor?: string;
  personas?: PersonaSummary[];
}

export default function GrokComposer({
  value,
  onChange,
  onSend,
  disabled,
  thinkMode,
  onToggleThink,
  deepSearch,
  onToggleDeepSearch,
  activeMode,
  onChangeMode,
  onTriggerProactive,
  onOpenImport,
  personaName,
  accentColor = "#18a999",
  personas = [],
}: GrokComposerProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dismissedAtValue, setDismissedAtValue] = useState<string | null>(null);
  const [selectedMentionSlug, setSelectedMentionSlug] = useState<
    string | undefined
  >(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
    setMenuOpen(false);
  };

  const mentionMatch =
    dismissedAtValue === value
      ? null
      : value.match(/(?:^|\s)@([^\s@]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : "";
  const filteredMentions = mentionMatch
    ? personas.filter(
        (p) =>
          !mentionQuery ||
          p.name.toLowerCase().includes(mentionQuery) ||
          p.slug.toLowerCase().includes(mentionQuery)
      )
    : [];
  const showMentionMenu = Boolean(mentionMatch) && filteredMentions.length > 0;
  const clampedMentionIdx =
    filteredMentions.length > 0
      ? Math.min(mentionIndex, filteredMentions.length - 1)
      : 0;

  const insertMentionBot = (bot: PersonaSummary) => {
    const replaced = value.replace(
      /(?:^|\s)@([^\s@]*)$/,
      (fullMatch) => (fullMatch.startsWith(" ") ? ` @${bot.name} ` : `@${bot.name} `)
    );
    onChange(replaced);
    setSelectedMentionSlug(bot.slug);
    setDismissedAtValue(null);
    setMentionIndex(0);
    setTimeout(() => textInputRef.current?.focus(), 0);
  };

  const handleSubmit = (
    requestPhoto = false,
    requestSticker = false
  ) => {
    if (disabled) return;
    if (!value.trim() && !imagePreview && !requestPhoto && !requestSticker) return;
    const matchedInText = personas.find((p) =>
      value.includes(`@${p.name}`)
    )?.slug;
    const resolvedMentionSlug =
      matchedInText ||
      (selectedMentionSlug &&
      personas.some(
        (p) => p.slug === selectedMentionSlug && value.includes(`@${p.name}`)
      )
        ? selectedMentionSlug
        : undefined);
    onSend({
      imageUrl: imagePreview || undefined,
      requestPhoto,
      requestSticker,
      mentionedSlug: resolvedMentionSlug,
    });
    setImagePreview(null);
    setSelectedMentionSlug(undefined);
    setMenuOpen(false);
  };

  const handleVoiceInput = () => {
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        start: () => void;
        onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        start: () => void;
        onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
      };
    };

    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      onChange(
        value ? `${value} [语音输入：最近在忙啥呢？]` : "刚给你发了一条语音，快听听我在说啥～"
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "zh-CN";
      setIsRecording(true);
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || "";
        if (transcript) {
          onChange(value ? `${value} ${transcript}` : transcript);
        }
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const hasContent = Boolean(value.trim()) || Boolean(imagePreview);
  const modeSpec = PERSONA_MODES[activeMode] || PERSONA_MODES.authentic;

  return (
    <div className="relative px-4 md:px-8 pb-5 pt-2 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/95 to-transparent">
      <div className="relative max-w-3xl mx-auto">
        {/* Floating "+" Toolbox Popover */}
        {menuOpen && (
          <div className="absolute bottom-full left-0 mb-3 w-80 rounded-3xl bg-[var(--bg-elevated)] backdrop-blur-2xl border border-[var(--border-subtle)] grok-floating-card p-4 space-y-3.5 z-30 animate-popover-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Grok 能力与人格工具箱
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="w-6 h-6 rounded-full hover:bg-[var(--bg-secondary)] flex items-center justify-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onToggleThink}
                className={`px-3 py-2 rounded-2xl border text-xs font-medium flex items-center gap-2 transition-all ${
                  thinkMode
                    ? "border-[#18a999] bg-[#18a999]/10 text-[#18a999]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                <span>✦</span>
                <span>Think 潜台词</span>
              </button>
              <button
                type="button"
                onClick={onToggleDeepSearch}
                className={`px-3 py-2 rounded-2xl border text-xs font-medium flex items-center gap-2 transition-all ${
                  deepSearch
                    ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                <span>🌐</span>
                <span>DeepSearch</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-[var(--text-muted)]">
                人格尺度调节
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
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium text-left flex items-center gap-1.5 transition-all ${
                        active
                          ? "bg-[var(--bg-tertiary)] border-[var(--border-strong)] text-[var(--text-primary)]"
                          : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <span>{spec.badge}</span>
                      <span>{spec.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
              >
                <span>🖼️</span>
                <span>传图点评</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!value.trim()) {
                    onChange("发个适合现在氛围的表情包给我看看～");
                  }
                  handleSubmit(false, true);
                }}
                className="py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
              >
                <span>🎭</span>
                <span>要表情包</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!value.trim()) {
                    onChange("发张你那边的随手拍给我看看呗 📸");
                  }
                  handleSubmit(true, false);
                }}
                className="py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
              >
                <span>📸</span>
                <span>索要自拍</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenImport();
                }}
                className="py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
              >
                <span>📥</span>
                <span>导入记录</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onTriggerProactive();
              }}
              className="w-full py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-xs font-medium text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>⚡</span>
              <span>让 {personaName || "TA"} 主动破冰</span>
            </button>
          </div>
        )}

        {/* Active Image Attachment Preview */}
        {imagePreview && (
          <div className="mb-2.5 px-4 py-2 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center gap-3 animate-fade-in">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-[var(--border-strong)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="上传预览"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 text-white text-[10px] flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              已附带图片 · 发送后将结合画面与人设点评
            </span>
          </div>
        )}

        {/* Subtle Active Mode & Search Chips */}
        {(deepSearch || activeMode !== "authentic") && (
          <div className="mb-2 px-2 flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="px-2.5 py-0.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {modeSpec.badge} {modeSpec.shortLabel}
            </button>
            {deepSearch && (
              <button
                type="button"
                onClick={onToggleDeepSearch}
                className="px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/25 text-sky-600 dark:text-sky-300 transition-colors"
              >
                🌐 DeepSearch 已开启 ×
              </button>
            )}
            {thinkMode && (
              <button
                type="button"
                onClick={onToggleThink}
                className="px-2.5 py-0.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                ✦ Think
              </button>
            )}
          </div>
        )}

        {/* Floating "@" Bot Mention Picker (Grok Bot Style) */}
        {showMentionMenu && (
          <div className="absolute bottom-full left-10 mb-2.5 w-72 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] backdrop-blur-2xl shadow-2xl p-1.5 z-40 animate-popover-in">
            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {filteredMentions.map((bot, idx) => {
                const mascot = getMascotConfigForPersona(bot.slug, bot.profile);
                const isSelected = idx === clampedMentionIdx;
                return (
                  <button
                    key={bot.slug}
                    type="button"
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMentionBot(bot)}
                    className={`w-full px-3 py-2 rounded-[13px] flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[var(--bg-hover)]"
                        : "hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BlobMascot
                        shape={mascot.shape}
                        color={mascot.color}
                        image={mascot.image}
                        size={22}
                        trackPointer={false}
                        animated={false}
                      />
                      <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {bot.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                      Bot
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Floating Grok Bot Pill Capsule */}
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill focus-within:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-black/5 dark:focus-within:ring-white/10 focus-within:shadow-xl transition-all duration-200">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="打开功能菜单"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 ${
              menuOpen
                ? "bg-[var(--text-primary)] text-[var(--bg-primary)] rotate-45"
                : "bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:scale-105 active:scale-95"
            }`}
            title="切换 Think / DeepSearch / 人格模式 / 传图"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </button>

          <input
            ref={textInputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setDismissedAtValue(null);
              setMentionIndex(0);
              onChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (showMentionMenu) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((prev) =>
                    (prev + 1) % filteredMentions.length
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((prev) =>
                    (prev - 1 + filteredMentions.length) %
                    filteredMentions.length
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissedAtValue(value);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const chosen = filteredMentions[clampedMentionIdx];
                  if (chosen) insertMentionBot(chosen);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(false);
              }
            }}
            disabled={disabled}
            placeholder={`给 ${personaName || "PersonaBot"} 发消息（输入 @ 可唤起其他 Bot）`}
            className="flex-1 bg-transparent px-2 text-[14px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />

          <button
            type="button"
            onClick={handleVoiceInput}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
              isRecording
                ? "bg-rose-500/20 text-rose-500 animate-pulse"
                : "bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:scale-105 active:scale-95"
            }`}
            title="语音输入"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </button>

          {/* Animated Active-Bot Color Waveform / Send Button */}
          <button
            type="button"
            onClick={() => {
              if (hasContent) {
                handleSubmit(false);
              } else {
                onTriggerProactive();
              }
            }}
            disabled={disabled}
            aria-label={hasContent ? "发送消息" : "语音/主动破冰"}
            className="w-9 h-9 rounded-full hover:opacity-90 hover:scale-105 active:scale-95 disabled:opacity-50 text-white flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer"
            style={{ backgroundColor: accentColor }}
            title={hasContent ? "发送消息 (Enter)" : "让 TA 主动开口破冰"}
          >
            {disabled ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : hasContent ? (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect className="animate-wave-1" x="4" y="9" width="2.2" height="6" rx="1.1" />
                <rect className="animate-wave-2" x="8.3" y="5.5" width="2.2" height="13" rx="1.1" />
                <rect className="animate-wave-3" x="12.6" y="7" width="2.2" height="10" rx="1.1" />
                <rect className="animate-wave-4" x="16.9" y="9.5" width="2.2" height="5" rx="1.1" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
