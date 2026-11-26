import { describe, expect, it } from 'vitest';
import {
  countPendingMedia,
  mediaFingerprint,
  MEDIA_POLL_MAX_MS,
  MEDIA_POLL_MIN_MS,
  nextMediaPollDelay,
} from '@/lib/media/media-fingerprint';
import type { ConversationMessage, MediaCard } from '@/lib/storage/types';

function msg(id: string, content: string, mediaCards?: MediaCard[]): ConversationMessage {
  return {
    id,
    role: 'assistant',
    content,
    timestamp: '2026-11-26T12:00:00.000Z',
    ...(mediaCards ? { mediaCards } : {}),
  };
}

const photo = (over: Partial<MediaCard> = {}): MediaCard => ({
  type: 'photo',
  caption: '窗边的猫',
  status: 'generating',
  ...over,
});

describe('mediaFingerprint', () => {
  it('同样的消息得到同样的指纹，且是短字符串', () => {
    const list = [msg('a', 'hi'), msg('b', '看图', [photo()])];
    const fp = mediaFingerprint(list);
    expect(mediaFingerprint(list)).toBe(fp);
    expect(mediaFingerprint(list.map((m) => ({ ...m, mediaCards: m.mediaCards?.map((c) => ({ ...c })) })))).toBe(fp);
    expect(fp.length).toBeLessThan(40);
  });

  it('空列表也能算出指纹', () => {
    expect(typeof mediaFingerprint([])).toBe('string');
    expect(mediaFingerprint([])).toMatch(/^0-/);
  });

  it('追加一条消息后指纹变化', () => {
    const base = [msg('a', 'hi'), msg('b', '看图', [photo()])];
    const before = mediaFingerprint(base);
    expect(mediaFingerprint([...base, msg('c', '好的')])).not.toBe(before);
  });

  it('卡片状态从 generating 变为 ready 时指纹变化', () => {
    // 注意：MediaCard.status 的类型只有 'generating' | 'ready' | 'error'，没有 'done'
    const before = mediaFingerprint([msg('b', '看图', [photo({ status: 'generating' })])]);
    const after = mediaFingerprint([msg('b', '看图', [photo({ status: 'ready' })])]);
    expect(after).not.toBe(before);
  });

  it('卡片多出 imageUrl 时指纹变化', () => {
    const before = mediaFingerprint([msg('b', '看图', [photo({ status: 'ready' })])]);
    const after = mediaFingerprint([
      msg('b', '看图', [photo({ status: 'ready', imageUrl: '/generated/cat.png' })]),
    ]);
    expect(after).not.toBe(before);
  });

  it('attempts 变化时指纹变化', () => {
    const before = mediaFingerprint([msg('b', '看图', [photo({ status: 'error', attempts: 1 })])]);
    const after = mediaFingerprint([msg('b', '看图', [photo({ status: 'error', attempts: 2 })])]);
    expect(after).not.toBe(before);
  });

  it('waitingForNetwork 开关时指纹变化', () => {
    const before = mediaFingerprint([msg('b', '看图', [photo({ status: 'error' })])]);
    const after = mediaFingerprint([
      msg('b', '看图', [photo({ status: 'error', waitingForNetwork: true })]),
    ]);
    expect(after).not.toBe(before);
    expect(mediaFingerprint([msg('b', '看图', [photo({ status: 'error', waitingForNetwork: false })])])).toBe(before);
  });

  it('中间一条没有图片的消息只改了正文时指纹不变（设计如此：指纹只跟踪条数、最后一条 id 与图片状态）', () => {
    const before = mediaFingerprint([msg('a', '原文一'), msg('b', '看图', [photo()]), msg('c', '结尾')]);
    const after = mediaFingerprint([msg('a', '改过的正文'), msg('b', '看图', [photo()]), msg('c', '结尾')]);
    expect(after).toBe(before);
  });
});

describe('countPendingMedia', () => {
  it('统计仍在生成 / 重试 / 等网络的照片与表情包，忽略已完成、已失败与语音卡片', () => {
    const messages: ConversationMessage[] = [
      msg('generating', '1', [photo({ status: 'generating' })]),
      msg('retrying', '2', [photo({ status: 'error', attempts: 1 })]),
      msg('waiting', '3', [{ type: 'sticker', caption: '晚安', status: 'error', waitingForNetwork: true }]),
      msg('ready', '4', [photo({ status: 'ready', imageUrl: '/a.png' })]),
      msg('failed', '5', [photo({ status: 'error', attempts: 3 })]),
      msg('voice', '6', [{ type: 'voice', caption: '语音', status: 'generating', durationSec: 3 }]),
      msg('plain', '7'),
    ];
    expect(countPendingMedia(messages)).toBe(3);
  });

  it('没有任何待处理卡片时返回 0', () => {
    expect(countPendingMedia([msg('a', 'hi'), msg('b', 'ok', [photo({ status: 'ready', imageUrl: '/x.png' })])])).toBe(0);
    expect(countPendingMedia([])).toBe(0);
  });
});

describe('nextMediaPollDelay', () => {
  it('有变化时回到最短间隔', () => {
    expect(nextMediaPollDelay(13500, true)).toBe(MEDIA_POLL_MIN_MS);
    expect(MEDIA_POLL_MIN_MS).toBe(4000);
  });

  it('无变化时按 ×1.5 逐步放慢，并在 MEDIA_POLL_MAX_MS 处封顶', () => {
    expect(MEDIA_POLL_MAX_MS).toBe(15000);
    let delay = MEDIA_POLL_MIN_MS;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      delay = nextMediaPollDelay(delay, false);
      seen.push(delay);
    }
    expect(seen).toEqual([6000, 9000, 13500, 15000]);
    expect(nextMediaPollDelay(15000, false)).toBe(MEDIA_POLL_MAX_MS);
  });
});
