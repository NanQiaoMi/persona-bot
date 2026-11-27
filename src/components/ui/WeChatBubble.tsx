import React from 'react';

interface WeChatBubbleProps {
  content: string;
  isUser: boolean;
  timestamp?: string;
  showAvatar?: boolean;
  avatarUrl?: string;
  className?: string;
}

export const WeChatBubble: React.FC<WeChatBubbleProps> = ({
  content,
  isUser,
  timestamp,
  showAvatar = true,
  avatarUrl,
  className = '',
}) => {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${className}`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[80%]`}>
        {showAvatar && (
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center text-white text-sm font-medium ${
                  isUser ? 'bg-[#07C160]' : 'bg-[#576B95]'
                }`}
              >
                {isUser ? '我' : '她'}
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <div
            className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed transition-surface ${
              isUser
                ? 'bg-[var(--user-capsule)] text-[var(--user-capsule-text)] rounded-tr-sm'
                : 'bg-[var(--bg-bubble-ai)] text-[var(--text-primary)] hairline-border rounded-tl-sm'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>

          {timestamp && (
            <p className={`text-[10px] text-[var(--text-muted)] type-mono-num mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
              {timestamp}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeChatBubble;
