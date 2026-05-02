import React from 'react';
import WeChatBubble from '../ui/WeChatBubble';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface MessageItemProps {
  message: Message;
  personaName: string;
  personaAvatar?: string;
  showAvatar?: boolean;
  onCorrect?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  personaAvatar,
  showAvatar = true,
  onCorrect,
}) => {
  const isUser = message.role === 'user';

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const isPhoto = message.content.startsWith('[PHOTO:');
  const isVoice = message.content.startsWith('[VOICE:');
  const isSpecial = isPhoto || isVoice;

  if (isSpecial) {
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in group relative`}>
        <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[80%]`}>
          {showAvatar && (
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
              {personaAvatar && !isUser ? (
                <img src={personaAvatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex items-center justify-center text-white text-sm font-medium ${isUser ? 'bg-[#07C160]' : 'bg-[#576B95]'}`}>
                  {isUser ? '我' : '她'}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <div className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${isUser ? 'bg-[#95EC69] text-[#353535] rounded-tr-none' : 'bg-white text-[#353535] rounded-tl-none shadow-sm'}`}>
              {isPhoto && (
                <div className="space-y-2">
                  <div className="w-full aspect-square rounded-lg bg-[#F0F0F0] flex items-center justify-center border border-[#E5E5E5]">
                    <svg className="w-8 h-8 text-[#CCCCCC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-xs italic text-[#999999]">&ldquo;{message.content.replace('[PHOTO:', '').replace(']', '').trim()}&rdquo;</p>
                </div>
              )}
              {isVoice && (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-8 h-8 rounded-full bg-[#576B95]/20 flex items-center justify-center text-[#576B95]">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="w-24 h-4 bg-[#F0F0F0] rounded-full relative overflow-hidden">
                    <div className="absolute left-0 top-0 h-full w-1/3 bg-[#576B95]/30 animate-pulse" />
                  </div>
                </div>
              )}
            </div>
            {message.timestamp && (
              <p className={`text-[10px] text-[#999999] mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
                {formatTime(message.timestamp)}
              </p>
            )}
          </div>
        </div>
        {!isUser && onCorrect && (
          <button
            onClick={onCorrect}
            className="absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 text-[#999999] hover:text-[#576B95] opacity-0 group-hover:opacity-100 transition-opacity"
            title="纠正这条回复"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in group relative`}>
      <WeChatBubble
        content={message.content}
        isUser={isUser}
        timestamp={formatTime(message.timestamp)}
        showAvatar={showAvatar}
        avatarUrl={isUser ? undefined : personaAvatar}
      />
      {!isUser && onCorrect && (
        <button
          onClick={onCorrect}
          className="absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 text-[#999999] hover:text-[#576B95] opacity-0 group-hover:opacity-100 transition-opacity"
          title="纠正这条回复"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default MessageItem;
