/**
 * 照片 / 表情包卡片此刻处于什么状态（纯函数，页面与测试共用）：
 * - ready：已经有图
 * - generating：正在生成
 * - waiting：生图服务连不上，恢复后自动补发
 * - retrying：这次没成功，稍后会自动再试
 * - failed：自动重试次数用完，需要你点「重试」
 */
import type { MediaCard } from '@/lib/storage/types';

export const MEDIA_MAX_AUTO_ATTEMPTS_CLIENT = 3;

export type MediaVisualState = 'ready' | 'generating' | 'waiting' | 'retrying' | 'failed';

export function getMediaVisualState(card: MediaCard): MediaVisualState {
  if (card.imageUrl && card.status !== 'error') return 'ready';
  if (card.waitingForNetwork) return 'waiting';
  if (card.status === 'generating' || !card.status) return 'generating';
  if (card.status === 'error' && (card.attempts || 0) < MEDIA_MAX_AUTO_ATTEMPTS_CLIENT) return 'retrying';
  return 'failed';
}

/** 页面上是否还有图片在等结果（决定要不要继续刷新） */
export function hasPendingMedia(cards: MediaCard[] | undefined): boolean {
  return (cards || []).some((c) => {
    if (c.type !== 'photo' && c.type !== 'sticker') return false;
    const s = getMediaVisualState(c);
    return s === 'generating' || s === 'waiting' || s === 'retrying';
  });
}

export function describeMediaState(card: MediaCard, name: string): string {
  const what = card.type === 'sticker' ? '表情包' : '照片';
  switch (getMediaVisualState(card)) {
    case 'generating':
      return card.type === 'sticker' ? `${name} 正在找表情包…` : `${name} 正在拍照…`;
    case 'waiting':
      return `${what}还没发出来，网络恢复后自动补发`;
    case 'retrying':
      return `${what}没发出来，稍后自动再试一次`;
    case 'failed':
      return card.errorHint ? `${what}没发出来：${card.errorHint}` : `${what}没发出来`;
    default:
      return '';
  }
}
