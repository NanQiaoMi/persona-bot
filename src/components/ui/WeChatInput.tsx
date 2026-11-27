'use client';

import React, { useState, useRef, useEffect } from 'react';

interface WeChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const WeChatInput: React.FC<WeChatInputProps> = ({
  value,
  onChange,
  onSend,
  placeholder = '输入消息...',
  disabled = false,
  className = '',
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend?.();
    }
  };

  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <div
        className={`flex-1 relative rounded-xl hairline-border transition-surface ${
          isFocused
            ? 'bg-[var(--bg-composer)] border-[var(--border-strong)] focus-within-ring'
            : 'bg-[var(--bg-secondary)]'
        }`}
      >
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full px-3.5 py-2.5 bg-transparent resize-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm leading-relaxed"
          style={{ maxHeight: '120px' }}
        />
      </div>

      {onSend && (
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-interactive focus-ring ${
            value.trim()
              ? 'bg-[var(--user-capsule)] hover:opacity-90 text-[var(--user-capsule-text)] active:scale-[0.98]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
          }`}
        >
          发送
        </button>
      )}
    </div>
  );
};

export default WeChatInput;
