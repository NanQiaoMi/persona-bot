"use client";

import { useRef, useState } from "react";
import { PERSONA_MODES } from "@/lib/grok/persona-modes";
import { PersonaMode } from "@/lib/storage/types";

interface GrokComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (options?: { imageUrl?: string; requestPhoto?: boolean }) => void;
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
}: GrokComposerProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = (requestPhoto = false) => {
    if (disabled) return;
    if (!value.trim() && !imagePreview && !requestPhoto) return;
    onSend({
      imageUrl: imagePreview || undefined,
      requestPhoto,
    });
    setImagePreview(null);
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
          <div className="absolute bottom-full left-0 mb-3 w-80 rounded-3xl bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-card p-4 space-y-3.5 z-30 animate-msg-spring">
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

            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex flex-col items-center gap-0.5 transition-colors"
              >
                <span>🖼️</span>
                <span>传图点评</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!value.trim()) {
                    onChange("发张你那边的随手拍给我看看呗 📸");
                  }
                  handleSubmit(true);
                }}
                className="py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex flex-col items-center gap-0.5 transition-colors"
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
                className="py-2 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex flex-col items-center gap-0.5 transition-colors"
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

        {/* Main Floating Grok Bot Pill Capsule */}
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-full bg-[var(--bg-composer)] border border-[var(--border-subtle)] grok-floating-pill focus-within:border-[var(--border-strong)] focus-within:shadow-xl transition-all">
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
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(false);
              }
            }}
            disabled={disabled}
            placeholder={`给 ${personaName || "PersonaBot"} 发消息`}
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

          {/* Animated Teal Grok Bot Waveform / Send Button */}
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
            className="w-9 h-9 rounded-full bg-[#18a999] hover:bg-[#149688] hover:scale-105 active:scale-95 disabled:opacity-50 text-white flex items-center justify-center shadow-md shadow-[#18a999]/30 transition-all shrink-0"
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
