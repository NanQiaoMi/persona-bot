"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode, PersonaSummary } from "@/lib/storage/types";
import BlobMascot, { getMascotConfigForPersona } from "./BlobMascot";
import LineIcon from "./LineIcon";

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
  /** 群聊里传群成员人数：@ 列表最上面多一项「@所有人」，选了之后群里每个 Bot 都回 */
  mentionAllCount?: number;
}

/** 「@所有人」在候选列表里的占位项 */
const MENTION_ALL_SLUG = "__mention_all__";
const MENTION_ALL_LABEL = "所有人";

export default function GrokComposer({
  value,
  onChange,
  onSend,
  onStop,
  externalImage,
  onClearExternalImage,
  disabled,
  thinkMode = true,
  onToggleThink,
  deepSearch = false,
  onToggleDeepSearch,
  activeMode = "authentic",
  onChangeMode,
  onTriggerProactive,
  onOpenImport,
  personaName,
  accentColor = "#18a999",
  personas = [],
  mentionAllCount,
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
  const showMentionAll =
    Boolean(mentionMatch) &&
    (mentionAllCount ?? 0) > 1 &&
    (!mentionQuery ||
      MENTION_ALL_LABEL.includes(mentionQuery) ||
      "all".startsWith(mentionQuery) ||
      "全体".includes(mentionQuery));
  const filteredMentions: PersonaSummary[] = mentionMatch
    ? [
        ...(showMentionAll
          ? [{ slug: MENTION_ALL_SLUG, name: MENTION_ALL_LABEL } as PersonaSummary]
          : []),
        ...personas.filter(
          (p) =>
            !mentionQuery ||
            p.name.toLowerCase().includes(mentionQuery) ||
            p.slug.toLowerCase().includes(mentionQuery)
        ),
      ]
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
    setSelectedMentionSlug(bot.slug === MENTION_ALL_SLUG ? undefined : bot.slug);
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
  const showModesSection = Boolean(
    onToggleThink || onToggleDeepSearch || onChangeMode
  );

  return (
    <div className="relative px-4 md:px-8 pb-5 pt-2 bg-gradient-to-t from-[var(--surface-canvas,var(--bg-primary))] via-[var(--surface-canvas,var(--bg-primary))]/95 to-transparent">
      <div className="relative max-w-[740px] mx-auto">
        {/* WeChat-style "+" Attachment & Mode Tray */}
        {menuOpen && (
          <div
            ref={popoverRef}
            className="absolute bottom-full left-0 mb-3 w-[300px] rounded-[20px] surface-popover bg-[var(--surface-popover,var(--bg-elevated))] backdrop-blur-2xl border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--popover-shadow,0_16px_40px_rgba(0,0,0,0.16))] p-2.5 z-30 animate-popover-in"
          >
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="p-2 rounded-[14px] bg-[var(--surface-panel,var(--bg-secondary))] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-hairline,var(--border-subtle))] text-left flex items-center gap-2.5 active:scale-[0.98] transition-interactive focus-ring cursor-pointer"
              >
                <span className="w-8 h-8 rounded-[10px] bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  >
                    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
                    <circle cx="8.75" cy="9.5" r="1.5" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 17l4.5-4.5 3.25 3.25 3.25-3.25L20 17"
                    />
                  </svg>
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
                className="p-2 rounded-[14px] bg-[var(--surface-panel,var(--bg-secondary))] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-hairline,var(--border-subtle))] text-left flex items-center gap-2.5 active:scale-[0.98] transition-interactive focus-ring cursor-pointer"
              >
                <span className="w-8 h-8 rounded-[10px] bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <LineIcon name="camera" size={16} strokeWidth={1.75} />
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
                className="p-2 rounded-[14px] bg-[var(--surface-panel,var(--bg-secondary))] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-hairline,var(--border-subtle))] text-left flex items-center gap-2.5 active:scale-[0.98] transition-interactive focus-ring cursor-pointer"
              >
                <span className="w-8 h-8 rounded-[10px] bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="8.5" />
                    <path
                      strokeLinecap="round"
                      d="M9 10h.01M15 10h.01M8.75 14.25c1 1.35 2.15 2 3.25 2s2.25-.65 3.25-2"
                    />
                  </svg>
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
                className="p-2 rounded-[14px] bg-[var(--surface-panel,var(--bg-secondary))] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-hairline,var(--border-subtle))] text-left flex items-center gap-2.5 active:scale-[0.98] transition-interactive focus-ring cursor-pointer"
              >
                <span className="w-8 h-8 rounded-[10px] bg-violet-500/12 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 7.5A2.25 2.25 0 016 5.25h3.879a2.25 2.25 0 011.59.659l1.122 1.121a2.25 2.25 0 001.59.659H18A2.25 2.25 0 0120.25 9.94v7.31A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V7.5z"
                    />
                  </svg>
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

            {showModesSection && (
              <div className="mt-2 pt-2 border-t border-[var(--border-hairline,var(--border-subtle))] space-y-2">
                {(onToggleThink || onToggleDeepSearch) && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {onToggleThink && (
                      <button
                        type="button"
                        aria-pressed={thinkMode}
                        onClick={onToggleThink}
                        className={`h-8 px-2.5 rounded-full border text-[11.5px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.97] transition-interactive focus-ring cursor-pointer ${
                          thinkMode
                            ? "bg-[#18a999]/10 border-[#18a999]/35 text-[#128a7d] dark:text-teal-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                            : "bg-[var(--surface-panel,var(--bg-secondary))] border-[var(--border-hairline,var(--border-subtle))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                        <LineIcon name="spark" size={12} strokeWidth={1.85} />
                        <span>Think 心声</span>
                        <span
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full transition-opacity ${
                            thinkMode ? "bg-[#18a999] opacity-100" : "bg-[var(--text-muted)] opacity-30"
                          }`}
                        />
                      </button>
                    )}
                    {onToggleDeepSearch && (
                      <button
                        type="button"
                        aria-pressed={deepSearch}
                        onClick={onToggleDeepSearch}
                        className={`h-8 px-2.5 rounded-full border text-[11.5px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.97] transition-interactive focus-ring cursor-pointer ${
                          deepSearch
                            ? "bg-sky-500/10 border-sky-500/35 text-sky-700 dark:text-sky-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                            : "bg-[var(--surface-panel,var(--bg-secondary))] border-[var(--border-hairline,var(--border-subtle))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                        <LineIcon name="search" size={12} strokeWidth={1.85} />
                        <span>DeepSearch</span>
                        <span
                          aria-hidden="true"
                          className={`w-1.5 h-1.5 rounded-full transition-opacity ${
                            deepSearch ? "bg-sky-500 opacity-100" : "bg-[var(--text-muted)] opacity-30"
                          }`}
                        />
                      </button>
                    )}
                  </div>
                )}

                {onChangeMode && (
                  <div className="p-1 rounded-[13px] bg-[var(--surface-panel,var(--bg-secondary))] border border-[var(--border-hairline,var(--border-subtle))] grid grid-cols-2 gap-1">
                    {(Object.keys(PERSONA_MODES) as PersonaMode[]).map((mKey) => {
                      const spec = PERSONA_MODES[mKey];
                      const isModeActive = activeMode === mKey;
                      return (
                        <button
                          key={mKey}
                          type="button"
                          aria-pressed={isModeActive}
                          onClick={() => onChangeMode(mKey)}
                          className={`h-7 px-2 rounded-[9px] text-[11px] flex items-center gap-1.5 active:scale-[0.98] transition-interactive focus-ring cursor-pointer ${
                            isModeActive
                              ? "bg-[var(--surface-active,var(--bg-composer))] text-[var(--text-primary)] font-medium shadow-[var(--active-row-shadow)]"
                              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                          }`}
                        >
                          <span
                            className="shrink-0 flex items-center"
                            style={{ color: isModeActive ? spec.accentColor : undefined }}
                          >
                            <LineIcon name={spec.icon} size={12} strokeWidth={1.8} />
                          </span>
                          <span className="truncate">{spec.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Active Image Attachment Preview */}
        {activeImagePreview && (
          <div className="mb-2.5 inline-flex max-w-full items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-[14px] bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--active-row-shadow)] animate-fade-in">
            <div className="relative w-10 h-10 rounded-[10px] overflow-hidden border border-[var(--border-hairline,var(--border-subtle))] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeImagePreview}
                alt="上传预览"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 pr-1">
              <div className="text-[11.5px] font-medium text-[var(--text-primary)] leading-tight">
                已附带图片
              </div>
              <div className="text-[10.5px] text-[var(--text-muted)] truncate mt-0.5">
                发送后将结合画面与人设点评
              </div>
            </div>
            <button
              type="button"
              aria-label="移除图片"
              title="移除图片"
              onClick={() => {
                setImagePreview(null);
                onClearExternalImage?.();
              }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--bg-hover)] active:scale-[0.94] transition-interactive focus-ring shrink-0 cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Floating "@" Bot Mention Picker (Grok Bot Style) */}
        {showMentionMenu && (
          <div className="absolute bottom-full left-10 mb-2.5 w-72 rounded-[16px] border border-[var(--border-hairline,var(--border-subtle))] surface-popover bg-[var(--surface-popover,var(--bg-elevated))] backdrop-blur-2xl shadow-[var(--popover-shadow,0_16px_40px_rgba(0,0,0,0.16))] p-1.5 z-40 animate-popover-in">
            <div className="px-2.5 pt-1 pb-1.5 flex items-center justify-between text-[10.5px] text-[var(--text-muted)]">
              <span>提及角色</span>
              <span className="type-mono-num tabular-nums">↑↓ 选择 · Enter</span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {filteredMentions.map((bot, idx) => {
                const isAll = bot.slug === MENTION_ALL_SLUG;
                const mascot = isAll ? null : getMascotConfigForPersona(bot.slug, bot.profile);
                const isSelected = idx === clampedMentionIdx;
                return (
                  <button
                    key={bot.slug}
                    type="button"
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMentionBot(bot)}
                    className={`w-full px-2.5 py-2 rounded-[10px] flex items-center justify-between gap-2.5 text-left transition-surface focus-ring cursor-pointer ${
                      isSelected
                        ? "bg-[var(--surface-active,var(--bg-composer))] shadow-[var(--active-row-shadow)]"
                        : "hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isAll || !mascot ? (
                        <span
                          aria-hidden
                          className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[12px] font-semibold text-white shrink-0"
                          style={{ backgroundColor: accentColor }}
                        >
                          @
                        </span>
                      ) : (
                        <BlobMascot
                          shape={mascot.shape}
                          color={mascot.color}
                          image={mascot.image}
                          size={22}
                          trackPointer={false}
                          animated={false}
                        />
                      )}
                      <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {bot.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums shrink-0">
                      {isAll ? `全员 ${mentionAllCount}` : bot.slug === "master-bot" ? "主控 · 可建 Bot" : "Bot"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Floating Grok Bot Pill Capsule */}
        <div className="flex items-end gap-1.5 px-2.5 py-2 rounded-[24px] bg-[var(--surface-card,var(--bg-composer))] border border-[var(--border-hairline,var(--border-subtle))] shadow-[var(--pill-shadow)] focus-within:border-[var(--border-strong)] focus-within:shadow-[var(--card-shadow),0_0_0_2px_var(--focus-ring-color)] transition-surface">
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
            aria-expanded={menuOpen}
            aria-label="打开功能菜单"
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-interactive focus-ring shrink-0 cursor-pointer ${
              menuOpen
                ? "bg-[var(--text-primary)] border-transparent text-[var(--bg-primary)] rotate-45 shadow-sm"
                : "bg-[var(--surface-panel,var(--bg-secondary))] border-transparent hover:border-[var(--border-hairline,var(--border-subtle))] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-[0.94]"
            }`}
            title="切换 Think / DeepSearch / 人格模式 / 传图"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
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
            className="flex-1 min-h-[36px] max-h-32 overflow-y-auto resize-none bg-transparent px-2 py-[7px] text-[14px] leading-[22px] tracking-[-0.006em] text-[var(--text-primary)] placeholder-[var(--text-muted)] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none"
          />

          <button
            type="button"
            disabled={disabled}
            onClick={handleVoiceInput}
            aria-label="语音输入"
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-interactive focus-ring shrink-0 cursor-pointer ${
              isRecording
                ? "bg-rose-500/15 border-rose-500/35 text-rose-500 animate-pulse"
                : "bg-[var(--surface-panel,var(--bg-secondary))] border-transparent hover:border-[var(--border-hairline,var(--border-subtle))] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-[0.94] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--surface-panel,var(--bg-secondary))] disabled:hover:border-transparent disabled:active:scale-100"
            }`}
            title="语音输入"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
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
            className="group/send w-9 h-9 rounded-full ring-1 ring-inset ring-white/15 shadow-[0_1px_3px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-105 active:scale-[0.93] disabled:opacity-40 disabled:saturate-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:active:scale-100 disabled:shadow-none text-white flex items-center justify-center transition-interactive focus-ring shrink-0 cursor-pointer"
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
              <span className="w-2.5 h-2.5 rounded-[2.5px] bg-white" />
            ) : hasContent ? (
              <svg
                className="w-4 h-4 transition-transform duration-150 group-hover/send:-translate-y-[0.5px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
