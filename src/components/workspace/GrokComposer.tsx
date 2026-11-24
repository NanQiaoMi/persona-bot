"use client";

import { useEffect, useRef, useState } from "react";
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
  onStop?: () => void;
  externalImage?: string | null;
  onClearExternalImage?: () => void;
  disabled?: boolean;
  thinkMode?: boolean;
  onToggleThink?: () => void;
  deepSearch?: boolean;
  onToggleDeepSearch?: () => void;
  activeMode?: PersonaMode;
  onChangeMode?: (mode: PersonaMode) => void;
  onTriggerProactive?: () => void;
  onOpenImport: () => void;
  personaName?: string;
  accentColor?: string;
  personas?: PersonaSummary[];
}

export default function GrokComposer({
  value,
  onChange,
  onSend,
  onStop,
  externalImage,
  onClearExternalImage,
  disabled,
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
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = textInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value]);

  useEffect(() => {
    textInputRef.current?.focus();
  }, [personaName]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        plusBtnRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const handlePasteImage = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            setImagePreview(reader.result);
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

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

  const activeImagePreview = imagePreview || externalImage || null;

  const handleSubmit = (
    requestPhoto = false,
    requestSticker = false
  ) => {
    if (disabled) return;
    if (!value.trim() && !activeImagePreview && !requestPhoto && !requestSticker) return;
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
      imageUrl: activeImagePreview || undefined,
      requestPhoto,
      requestSticker,
      mentionedSlug: resolvedMentionSlug,
    });
    setImagePreview(null);
    onClearExternalImage?.();
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

  const hasContent = Boolean(value.trim()) || Boolean(activeImagePreview);

  return (
    <div className="relative px-4 md:px-8 pb-5 pt-2 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/95 to-transparent">
      <div className="relative max-w-3xl mx-auto">
        {/* WeChat-style "+" Attachment Tray */}
        {menuOpen && (
          <div
            ref={popoverRef}
            className="absolute bottom-full left-0 mb-3 w-72 rounded-3xl bg-[var(--bg-elevated)] backdrop-blur-2xl border border-[var(--border-subtle)] grok-floating-card p-3.5 z-30 animate-popover-in"
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="p-3 rounded-2xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-emerald-500/12 text-lg flex items-center justify-center shrink-0">
                  🖼️
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-[var(--text-primary)]">
                    相册发图
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">
                    发照片给 {personaName || "TA"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!value.trim()) {
                    onChange("发张你那边的随手拍给我看看呗 📸");
                  }
                  handleSubmit(true, false);
                }}
                className="p-3 rounded-2xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-amber-500/12 text-lg flex items-center justify-center shrink-0">
                  📸
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-[var(--text-primary)]">
                    让 TA 拍照
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">
                    看看此刻在哪里
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!value.trim()) {
                    onChange("发个适合现在氛围的表情包给我看看～");
                  }
                  handleSubmit(false, true);
                }}
                className="p-3 rounded-2xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-sky-500/12 text-lg flex items-center justify-center shrink-0">
                  😄
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-[var(--text-primary)]">
                    要表情包
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">
                    来张斗图贴纸
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenImport();
                }}
                className="p-3 rounded-2xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-left flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-purple-500/12 text-lg flex items-center justify-center shrink-0">
                  📂
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-[var(--text-primary)]">
                    导入记录
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">
                    喂给 TA 新回忆
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Active Image Attachment Preview */}
        {activeImagePreview && (
          <div className="mb-2.5 px-4 py-2 rounded-2xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill flex items-center gap-3 animate-fade-in">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-[var(--border-strong)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeImagePreview}
                alt="上传预览"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null);
                  onClearExternalImage?.();
                }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 text-white text-[10px] flex items-center justify-center cursor-pointer"
              >
                ×
              </button>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              已附带图片 · 发送后将结合画面与人设点评
            </span>
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
        <div className="flex items-end gap-2 px-2.5 py-2 rounded-[26px] bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill focus-within:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-black/5 dark:focus-within:ring-white/10 focus-within:shadow-xl transition-all duration-200">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            ref={plusBtnRef}
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

          <textarea
            ref={textInputRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setDismissedAtValue(null);
              setMentionIndex(0);
              onChange(e.target.value);
            }}
            onPaste={handlePasteImage}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
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
            placeholder={`给 ${personaName || "TA"} 发消息...`}
            className="flex-1 max-h-32 overflow-y-auto resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
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

          {/* Animated Active-Bot Color Waveform / Send / Stop Button */}
          <button
            type="button"
            onClick={() => {
              if (disabled) {
                onStop?.();
              } else if (hasContent) {
                handleSubmit(false);
              } else {
                onTriggerProactive?.();
              }
            }}
            disabled={disabled && !onStop}
            aria-label={
              disabled ? "停止回复" : hasContent ? "发送消息" : "语音/主动破冰"
            }
            className="w-9 h-9 rounded-full hover:opacity-90 hover:scale-105 active:scale-95 disabled:opacity-50 text-white flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer"
            style={{ backgroundColor: accentColor }}
            title={
              disabled
                ? "停止当前回复"
                : hasContent
                  ? "发送消息 (Enter)"
                  : "让 TA 主动开口破冰"
            }
          >
            {disabled ? (
              <span className="w-3 h-3 rounded-[3px] bg-white" />
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
