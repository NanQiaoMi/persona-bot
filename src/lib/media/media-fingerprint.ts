import type { ConversationMessage } from '@/lib/storage/types';
import { hasPendingMedia } from './media-state';

/**
 * 会话的「图片进度指纹」：消息条数、最后一条消息，以及每张照片 / 表情包卡片的状态。
 * 页面轮询时只比对这个短字符串，变了才去拉完整消息（几十字节 vs 上百 KB）。
 */
export function mediaFingerprint(messages: ConversationMessage[]): string {
  let h = 5381;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  };
  feed(`${messages.length}|${messages[messages.length - 1]?.id || ''}`);
  for (const m of messages) {
    if (!m.mediaCards || m.mediaCards.length === 0) continue;
    feed(`|${m.id}`);
    m.mediaCards.forEach((c, idx) => {
      feed(
        `:${idx}.${c.status || ''}.${c.imageUrl ? 1 : 0}.${c.attempts || 0}.${c.waitingForNetwork ? 1 : 0}`
      );
    });
  }
  return `${messages.length}-${(h >>> 0).toString(36)}`;
}

/** 有多少条消息还挂着没出结果的图片 */
export function countPendingMedia(messages: ConversationMessage[]): number {
  return messages.filter((m) => hasPendingMedia(m.mediaCards)).length;
}

export const MEDIA_POLL_MIN_MS = 4000;
export const MEDIA_POLL_MAX_MS = 15000;

/** 下一次轮询间隔：有变化就回到 4 秒，没变化逐步放慢到 15 秒 */
export function nextMediaPollDelay(currentMs: number, changed: boolean): number {
  if (changed) return MEDIA_POLL_MIN_MS;
  return Math.min(MEDIA_POLL_MAX_MS, Math.round(currentMs * 1.5));
}
