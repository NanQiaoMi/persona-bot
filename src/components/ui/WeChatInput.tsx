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
        className={`flex-1 relative rounded-lg border transition-all duration-200 ${
          isFocused ? 'border-[#07C160] bg-white' : 'border-[#E5E5E5] bg-[#F7F7F7]'
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
          className="w-full px-4 py-2.5 bg-transparent resize-none outline-none text-[#353535] placeholder-[#999999] text-sm leading-relaxed"
          style={{ maxHeight: '120px' }}
        />
      </div>

      {onSend && (
        <button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            value.trim()
              ? 'bg-[#07C160] hover:bg-[#06AD56] text-white active:scale-95'
              : 'bg-[#EDEDED] text-[#999999] cursor-not-allowed'
          }`}
        >
          发送
        </button>
      )}
    </div>
  );
};

export default WeChatInput;
