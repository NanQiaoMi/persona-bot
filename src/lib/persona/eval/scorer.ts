import {
  DEFAULT_YOUNG_ADULT_FINGERPRINT,
  StyleFingerprint,
} from '@/lib/persona/fingerprint';
import { MessageStyleMetrics } from '@/lib/storage/types';
import { measureReply, ReplyMetrics } from './metrics';

export interface ReplyScore {
  /** 像本人分：度量与本人风格指纹的接近程度 (0~100) */
  likeness: number;
  /** 去 AI 味分：AI 套话、出戏、主持人反问、舞台动作、Markdown 的惩罚后得分 (0~100) */
  deAI: number;
  /** 综合分 = 0.5 * likeness + 0.5 * deAI */
  total: number;
  breakdown: Record<string, number>;
  metrics: ReplyMetrics;
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/**
 * 计算长度接近度：比例落在 [0.6, 1.6] 内不扣分，超出按对数距离扣分
 */
function lengthCloseness(actual: number, target: number): number {
  if (actual <= 0 || target <= 0) return 0.5;
  const ratio = actual / target;
  if (ratio >= 0.6 && ratio <= 1.6) return 1;
  const dist = Math.abs(Math.log(ratio)) - Math.log(1.6);
  return clamp(1 - dist, 0, 1);
}

function rateCloseness(actual: number, target: number, tolerance: number): number {
  const diff = Math.abs(actual - target);
  if (diff <= tolerance) return 1;
  return clamp(1 - (diff - tolerance) / (tolerance * 3 + 0.3), 0, 1);
}

export function scoreMetrics(
  metrics: ReplyMetrics,
  fingerprint: StyleFingerprint = DEFAULT_YOUNG_ADULT_FINGERPRINT
): ReplyScore {
  const len = lengthCloseness(metrics.avgBubbleLen, fingerprint.avgBubbleLen);
  const emoji = rateCloseness(metrics.emojiPerBubble, fingerprint.emojiRate, 0.2);
  const period = rateCloseness(metrics.trailingPeriodRate, fingerprint.trailingPeriodRate, 0.3);
  const excl = rateCloseness(metrics.exclamationPerBubble, fingerprint.exclamationRate, 0.35);
  // 口头禅：命中加分，不命中不扣分（不是每句都要说口头禅）
  const catchBonus = fingerprint.catchphrases.length > 0 && metrics.catchphraseHits.length > 0 ? 1 : 0;

  const likeness = clamp(
    Math.round(len * 35 + emoji * 25 + period * 15 + excl * 15 + 10 + catchBonus * 5)
  );

  const penalties = {
    aiCliche: metrics.aiClicheHits.length * 15,
    ooc: metrics.oocHits.length * 40,
    hostQuestion: metrics.hostQuestion ? 10 : 0,
    stageDirection: Math.min(20, metrics.stageDirectionCount * 8),
    markdown: Math.min(20, metrics.markdownCount * 6),
  };
  const deAI = clamp(
    100 - Object.values(penalties).reduce((s, p) => s + p, 0)
  );

  return {
    likeness,
    deAI,
    total: Math.round(likeness * 0.5 + deAI * 0.5),
    breakdown: {
      length: Number(len.toFixed(2)),
      emoji: Number(emoji.toFixed(2)),
      period: Number(period.toFixed(2)),
      exclamation: Number(excl.toFixed(2)),
      catchphrase: catchBonus,
      ...Object.fromEntries(Object.entries(penalties).map(([k, v]) => [`penalty_${k}`, v])),
    },
    metrics,
  };
}

export function scoreReply(
  reply: string | string[],
  fingerprint: StyleFingerprint = DEFAULT_YOUNG_ADULT_FINGERPRINT
): ReplyScore {
  return scoreMetrics(
    measureReply(reply, { catchphrases: fingerprint.catchphrases }),
    fingerprint
  );
}

export function toMessageStyleMetrics(score: ReplyScore): MessageStyleMetrics {
  return {
    likeness: score.likeness,
    deAI: score.deAI,
    emojiCount: score.metrics.emojiCount,
    avgBubbleLen: score.metrics.avgBubbleLen,
    aiClicheHits: score.metrics.aiClicheHits.length,
    oocHits: score.metrics.oocHits.length,
    hostQuestion: score.metrics.hostQuestion,
  };
}
