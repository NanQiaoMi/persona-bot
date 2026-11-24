import {
  buildFingerprintFromLines,
  DEFAULT_YOUNG_ADULT_FINGERPRINT,
  hasOwnFingerprint,
  hasReliableLength,
  StyleFingerprint,
} from '@/lib/persona/fingerprint';
import { PersonaMode } from '@/lib/storage/types';

/**
 * 双指纹混合权重：以本人为主，轻度镜像用户。
 * Authentic / Analytical：本人 80% / 用户 20%；Companion / Fun：本人 60% / 用户 40%
 */
export const MIRROR_WEIGHTS: Record<PersonaMode, { self: number; user: number }> = {
  authentic: { self: 0.8, user: 0.2 },
  analytical: { self: 0.8, user: 0.2 },
  companion: { self: 0.6, user: 0.4 },
  fun: { self: 0.6, user: 0.4 },
};

export interface BlendedStyle {
  /** 是否有本人风格锚点（没有时回退到默认年轻人微信口吻） */
  anchored: boolean;
  target: StyleFingerprint;
  self: StyleFingerprint;
  user: StyleFingerprint;
  /** 单轮 emoji 预算 (0~3) */
  emojiBudget: number;
  /** 本人常用、不应被当作「油腻 emoji」过滤掉的表情 */
  allowedEmojis: string[];
  usesTrailingPeriod: boolean;
  directive: string;
}

export function emojiBudgetFromRate(rate: number): number {
  if (rate < 0.15) return 0;
  if (rate < 0.6) return 1;
  if (rate < 1.2) return 2;
  return 3;
}

const mix = (a: number, b: number, wa: number) => a * wa + b * (1 - wa);

export function blendStyle(
  self: StyleFingerprint | null | undefined,
  userLines: string[],
  mode: PersonaMode
): BlendedStyle {
  const anchored = hasOwnFingerprint(self);
  const selfFp = anchored ? self! : DEFAULT_YOUNG_ADULT_FINGERPRINT;
  const userFp = userLines.length
    ? buildFingerprintFromLines(userLines, 'user')
    : { ...DEFAULT_YOUNG_ADULT_FINGERPRINT, source: 'user' as const };
  const userWeight = userLines.length ? (MIRROR_WEIGHTS[mode] ?? MIRROR_WEIGHTS.authentic).user : 0;
  const w = 1 - userWeight;

  const selfLen = hasReliableLength(selfFp) ? selfFp.avgBubbleLen : DEFAULT_YOUNG_ADULT_FINGERPRINT.avgBubbleLen;
  const target: StyleFingerprint = {
    ...selfFp,
    avgBubbleLen: Math.round(mix(selfLen, userFp.avgBubbleLen, w)),
    emojiRate: Number(mix(selfFp.emojiRate, userFp.emojiRate, w).toFixed(2)),
    trailingPeriodRate: Number(mix(selfFp.trailingPeriodRate, userFp.trailingPeriodRate, w).toFixed(2)),
    exclamationRate: Number(mix(selfFp.exclamationRate, userFp.exclamationRate, w).toFixed(2)),
    questionRate: Number(mix(selfFp.questionRate, userFp.questionRate, w).toFixed(2)),
  };

  const emojiBudget = emojiBudgetFromRate(target.emojiRate);
  const usesTrailingPeriod = target.trailingPeriodRate >= 0.4;
  const allowedEmojis = anchored ? selfFp.topEmojis : [];

  const lo = Math.max(3, Math.round(target.avgBubbleLen * 0.5));
  const hi = Math.max(lo + 6, Math.round(target.avgBubbleLen * 1.7));
  const hints: string[] = [];
  hints.push(`单条气泡大约 ${lo}~${hi} 字，像真人连发一样短句分条，不写成作文`);
  if (emojiBudget === 0) {
    hints.push('这一轮 0 个 emoji，靠用词、停顿和语气词传达情绪');
  } else {
    const prefer = allowedEmojis.length ? `，优先用 TA 自己常用的 ${allowedEmojis.slice(0, 3).join('')}` : '';
    hints.push(`这一轮最多 ${emojiBudget} 个 emoji${prefer}，不连发、不堆油腻表情`);
  }
  hints.push(usesTrailingPeriod ? '句尾可以正常打「。」' : '短气泡结尾不打「。」');
  if (target.exclamationRate < 0.35) hints.push('语气平实，少用感叹号');
  if (anchored && selfFp.catchphrases.length) {
    hints.push(`TA 的口头禅：${selfFp.catchphrases.slice(0, 6).join('、')}（自然地带出来，别每句硬塞）`);
  }
  if (anchored && selfFp.sampleQuotes.length) {
    hints.push(`TA 本人说话的样子：${selfFp.sampleQuotes.slice(0, 4).map((q) => `「${q}」`).join(' / ')}`);
  }
  if (userLines.length) {
    hints.push(
      `对方最近每条约 ${userFp.avgBubbleLen} 字，可以稍微贴近对方的节奏，但说话方式以 TA 本人为准`
    );
  }

  return {
    anchored,
    target,
    self: selfFp,
    user: userFp,
    emojiBudget,
    allowedEmojis,
    usesTrailingPeriod,
    directive: hints.map((h) => `- ${h}`).join('\n'),
  };
}
