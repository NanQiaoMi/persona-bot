import React from 'react';
import Link from 'next/link';
import WeChatAvatar from '../ui/WeChatAvatar';

interface ModelOption {
  id: string;
  name: string;
}

interface ChatHeaderProps {
  personaName: string;
  personaAvatar?: string;
  isOnline?: boolean;
  currentMood?: string;
  onBack?: () => void;
  models?: ModelOption[];
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  personaName,
  personaAvatar,
  isOnline = true,
  currentMood,
  onBack,
  models,
  selectedModelId,
  onModelChange,
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-[#E5E5E5]">
      <Link
        href="/"
        className="flex items-center gap-1 text-[#576B95] hover:text-[#07C160] transition-colors"
        onClick={onBack}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </Link>

      <div className="flex items-center gap-2">
        <WeChatAvatar
          name={personaName}
          imageUrl={personaAvatar}
          size="small"
          online={isOnline}
        />
        <div>
          <h3 className="text-[15px] font-medium text-[#353535]">{personaName}</h3>
          {currentMood && (
            <p className="text-[10px] text-[#999999]">{currentMood}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {models && models.length > 1 && (
          <select
            value={selectedModelId}
            onChange={(e) => onModelChange?.(e.target.value)}
            className="text-[10px] bg-[#F7F7F7] border border-[#E5E5E5] rounded px-1.5 py-0.5 text-[#353535] focus:outline-none focus:border-[#07C160] max-w-[100px] truncate"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <button className="p-1.5 text-[#576B95] hover:text-[#07C160] transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
