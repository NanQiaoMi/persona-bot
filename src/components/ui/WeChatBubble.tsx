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
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
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
            className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${
              isUser
                ? 'bg-[#95EC69] text-[#353535] rounded-tr-none'
                : 'bg-white text-[#353535] rounded-tl-none shadow-sm'
            }`}
          >
            <div
              className={`absolute bottom-2 w-2 h-2 transform rotate-45 ${
                isUser ? '-right-1 bg-[#95EC69]' : '-left-1 bg-white'
              }`}
            />
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>

          {timestamp && (
            <p className={`text-[10px] text-[#999999] mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
              {timestamp}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeChatBubble;
