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
  variant?: "hero" | "dock";
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
  variant = "dock",
  personaName,
}: GrokComposerProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
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
  };

  const handleSubmit = (requestPhoto = false) => {
    if (disabled) return;
    if (!value.trim() && !imagePreview && !requestPhoto) return;
    onSend({
      imageUrl: imagePreview || undefined,
      requestPhoto,
    });
    setImagePreview(null);
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

  const wrapperClass =
    variant === "hero"
      ? "w-full max-w-2xl mx-auto"
      : "px-4 pb-5 pt-2 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/95 to-transparent";

  const canSend = !disabled && (Boolean(value.trim()) || Boolean(imagePreview));

  return (
    <div className={wrapperClass}>
      <div
        className={`${
          variant === "dock" ? "max-w-3xl mx-auto" : "w-full"
        } rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-composer)] grok-composer-focus transition-all overflow-hidden shadow-2xl`}
      >
        {/* Image Attachment Preview */}
        {imagePreview && (
          <div className="px-4 pt-3 flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-[var(--border-strong)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="上传预览"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/75 text-white text-xs flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              已附带图片 · {personaName || "TA"} 将结合画面细节与人设点评
            </span>
          </div>
        )}

        {/* Textarea */}
        <div className="px-5 pt-3.5 pb-2">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(false);
              }
            }}
            rows={variant === "hero" ? 3 : 2}
            disabled={disabled}
            placeholder={
              personaName
                ? `向 ${personaName} 随便问点什么，或开启 DeepSearch 聊聊今天的热搜...`
                : "有什么想聊的？"
            }
            className="w-full bg-transparent text-[14.5px] text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:outline-none leading-relaxed"
          />
        </div>

        {/* Bottom Controls Bar */}
        <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)]/70">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Think Toggle */}
            <button
              type="button"
              onClick={onToggleThink}
              className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all ${
                thinkMode
                  ? "bg-white/10 border-[var(--border-strong)] text-[var(--text-primary)]"
                  : "bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              title="开启后展示角色回复前的真实内心潜台词 (Inner OS)"
            >
              <span className={thinkMode ? "text-purple-400" : ""}>✦</span>
              <span>Think</span>
            </button>

            {/* DeepSearch Toggle */}
            <button
              type="button"
              onClick={onToggleDeepSearch}
              className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all ${
                deepSearch
                  ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                  : "bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              title="开启后实时联网检索资讯并用角色口吻吐槽/分享"
            >
              <span>🌐</span>
              <span>DeepSearch</span>
            </button>

            {/* 4 Persona Modes Selector */}
            <div className="flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/70 p-0.5">
              {(Object.keys(PERSONA_MODES) as PersonaMode[]).map((modeKey) => {
                const spec = PERSONA_MODES[modeKey];
                const isActive = activeMode === modeKey;
                return (
                  <button
                    key={modeKey}
                    type="button"
                    onClick={() => onChangeMode(modeKey)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all flex items-center gap-1 ${
                      isActive
                        ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-sm"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                    title={spec.description}
                  >
                    <span>{spec.badge}</span>
                    <span className="hidden sm:inline">{spec.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Multimodal & Send Button */}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-full text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors flex items-center justify-center"
              title="上传图片看图点评"
            >
              🖼️
            </button>
            <button
              type="button"
              onClick={() => {
                if (!value.trim()) {
                  onChange("发张你那边的随手拍给我看看呗 📸");
                }
                handleSubmit(true);
              }}
              disabled={disabled}
              className="w-8 h-8 rounded-full text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors flex items-center justify-center"
              title="索要角色情境照片"
            >
              📸
            </button>
            <button
              type="button"
              onClick={handleVoiceInput}
              className={`w-8 h-8 rounded-full text-xs transition-colors flex items-center justify-center ${
                isRecording
                  ? "bg-rose-500/20 text-rose-400 animate-pulse"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5"
              }`}
              title="语音输入"
            >
              🎙️
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={!canSend}
              aria-label="发送消息"
              className={`ml-1.5 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                canSend
                  ? "bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 shadow-md"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-muted)] opacity-50 cursor-not-allowed"
              }`}
            >
              {disabled ? "⋯" : "↑"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
