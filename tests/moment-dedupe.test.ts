import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isNearDuplicateMoment,
  isPlaceholderMomentImage,
  prepareMomentsForDisplay,
  textSimilarity,
} from '@/lib/persona/moment-dedupe';
import { generateNewMomentPost, MomentSkippedError, pickFreshOfflineTemplate } from '@/lib/persona/moments';
import { storageRepo } from '@/lib/storage/repository';
import type { MomentPost } from '@/lib/storage/types';

afterEach(() => vi.restoreAllMocks());

const post = (id: string, content: string, images: string[] = []): MomentPost => ({
  id,
  authorSlug: 'lu-xi',
  authorName: '鹿汐',
  content,
  images,
  likedByUser: false,
  likes: [],
  comments: [],
  createdAt: '2026-11-26T03:00:00.000Z',
});

describe('动态查重', () => {
  it('同一句话或只差标点算重复，不同的话不算', () => {
    const a = '刚下完小雨的天空干净得像洗过一样，云缝里透出一点橘子汽水色的光。';
    expect(textSimilarity(a, a)).toBe(1);
    expect(isNearDuplicateMoment('刚下完小雨的天空干净得像洗过一样 云缝里透出一点橘子汽水色的光', [a])).toBe(true);
    expect(isNearDuplicateMoment('晚上去吃了家新开的拉面，汤头很浓', [a])).toBe(false);
  });

  it('显示时折叠内容重复的旧动态，占位配图不显示', () => {
    const svg = 'data:image/svg+xml;utf8,<svg/>';
    const shown = prepareMomentsForDisplay([
      post('new', '刚下完小雨的天空干净得像洗过一样', [svg]),
      post('old', '刚下完小雨的天空干净得像洗过一样。'),
      post('other', '今天的晚霞是粉色的', ['/api/media/x.png']),
    ]);
    expect(shown.map((p) => p.id)).toEqual(['new', 'other']);
    expect(shown[0].images).toEqual([]);
    expect(shown[1].images).toEqual(['/api/media/x.png']);
    expect(isPlaceholderMomentImage(svg)).toBe(true);
    expect(isPlaceholderMomentImage('/api/media/x.png')).toBe(false);
  });

  it('离线文案只挑最近没发过的；都发过就不挑', () => {
    const templates = [
      { content: '第一条离线动态内容啊', topic: 'daily' },
      { content: '第二条完全不同的内容', topic: 'food' },
    ];
    expect(pickFreshOfflineTemplate(templates, ['第一条离线动态内容啊'])?.content).toBe('第二条完全不同的内容');
    expect(pickFreshOfflineTemplate(templates, templates.map((t) => t.content))).toBeNull();
  });
});

describe('发动态时不再重复', () => {
  it('自动发布时模型不可用：这次不发，也不塞离线文案', async () => {
    await storageRepo.listPersonas();
    const before = await storageRepo.getMoments('chen-ye');
    await expect(generateNewMomentPost('chen-ye', { allowOfflineTemplate: false })).rejects.toBeInstanceOf(
      MomentSkippedError
    );
    expect((await storageRepo.getMoments('chen-ye')).length).toBe(before.length);
  });

  it('手动发布：用最近没发过的离线文案，且没有真实照片时不放占位图', async () => {
    await storageRepo.listPersonas();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { post: p1, posts } = await generateNewMomentPost('shen-zhi');
    expect(p1.images).toEqual([]);
    const others = posts.slice(1, 13).map((x) => x.content);
    expect(isNearDuplicateMoment(p1.content, others)).toBe(false);
  });
});
