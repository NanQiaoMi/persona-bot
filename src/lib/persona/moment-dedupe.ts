/**
 * 朋友圈动态查重（纯函数）：
 * - 发新动态前判断是否和最近几条太像
 * - 显示时把内容重复的旧动态折叠掉（只影响显示，不删数据）
 * - 识别早期版本留下的「渐变 + 文字」占位配图
 */
import type { MomentPost } from '@/lib/storage/types';

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
  return out;
}

/** 两段文字的相似度（字符二元组的 Jaccard 系数，0~1） */
export function textSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = bigrams(na);
  const B = bigrams(nb);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export const MOMENT_DUPLICATE_THRESHOLD = 0.6;

/** 和最近的任意一条动态太像，就算重复 */
export function isNearDuplicateMoment(content: string, recentContents: string[]): boolean {
  return recentContents.some((r) => textSimilarity(content, r) >= MOMENT_DUPLICATE_THRESHOLD);
}

/** 早期版本在没有真实照片时塞进去的 SVG 占位图（渐变底 + 文字） */
export function isPlaceholderMomentImage(url: string): boolean {
  return /^data:image\/svg\+xml/i.test(url || '');
}

/**
 * 显示用：posts 按新到旧排列，内容和更新的某条重复的旧动态折叠掉；
 * 占位配图不显示（当作纯文字动态）。
 */
export function prepareMomentsForDisplay(posts: MomentPost[]): MomentPost[] {
  const kept: MomentPost[] = [];
  for (const post of posts) {
    if (kept.some((k) => textSimilarity(k.content, post.content) >= MOMENT_DUPLICATE_THRESHOLD)) continue;
    const images = post.images.filter((u) => !isPlaceholderMomentImage(u));
    kept.push(images.length === post.images.length ? post : { ...post, images });
  }
  return kept;
}
