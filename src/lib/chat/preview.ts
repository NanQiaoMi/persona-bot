import type { ConversationMessage } from '@/lib/storage/types';

/** 会话列表 / 群列表里显示的最后一条：没有文字的照片、表情包显示成 [照片] / [表情包] */
export function messagePreviewText(msg: Pick<ConversationMessage, 'content' | 'mediaCards'>): string {
  const text = (msg.content || '').trim();
  if (text) return text;
  const cards = msg.mediaCards || [];
  if (cards.some((c) => c.type === 'photo')) return '[照片]';
  if (cards.some((c) => c.type === 'sticker')) return '[表情包]';
  if (cards.some((c) => c.type === 'voice')) return '[语音]';
  return '';
}
