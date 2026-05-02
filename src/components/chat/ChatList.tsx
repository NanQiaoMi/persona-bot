"use client";

import Link from 'next/link';
import WeChatAvatar from '../ui/WeChatAvatar';

interface Conversation {
  id: string;
  personaName: string;
  personaSlug: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

interface ChatListProps {
  conversations: Conversation[];
}

export default function ChatList({ conversations }: ChatListProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}分钟前`;
    } else if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}小时前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  if (conversations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400">还没有对话</p>
        <Link
          href="/create"
          className="inline-block mt-4 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
        >
          创建第一个 Persona
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <Link
          key={conv.id}
          href={`/chat/${conv.personaSlug}`}
          className="flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors"
        >
          <WeChatAvatar name={conv.personaName} size="medium" />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white">{conv.personaName}</h3>
              <span className="text-xs text-zinc-400">
                {formatTime(conv.lastMessageTime)}
              </span>
            </div>
            <p className="text-sm text-zinc-400 truncate mt-1">
              {conv.lastMessage}
            </p>
          </div>
          
          {conv.unreadCount > 0 && (
            <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center">
              <span className="text-[10px] text-white font-medium">
                {conv.unreadCount}
              </span>
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
