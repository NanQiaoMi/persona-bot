import { hasOwnFingerprint, hasReliableLength, StyleFingerprint } from '@/lib/persona/fingerprint';
import { FeedbackSignal, TurnQuality } from '@/lib/persona/feedback-signals';
import {
  findSimilarItem,
  LearnedCandidate,
  mergeLearnedCandidates,
} from '@/lib/persona/learned';
import { inferStyleDimension, LearnedItem, PersonaSpec } from '@/lib/persona/spec';

/**
 * 自进化闭环：提议 → 护栏 → 冲突消解 → 试用 → 生效 / 淘汰
 */
export const TRIAL_TURNS = 6;
/** 试用期平均质量比基线低超过该值则淘汰 */
export const TRIAL_TOLERANCE = 3;
const RECENT_QUALITY_WINDOW = 12;

export interface RejectedCandidate {
  text: string;
  reason: string;
}

/**
 * 防漂移护栏：拒绝会改写核心协议、或明显违背本人风格锚点的候选规则
 */
export function checkAnchorGuard(
  candidate: LearnedCandidate,
  fingerprint?: StyleFingerprint
): string | null {
  const text = candidate.text;
  if (/Layer\s*0|忽略(?:以上|之前|人设)|我是\s*(?:AI|人工智能)|承认.*(?:AI|机器人)|跳出角色/i.test(text)) {
    return '试图改写核心人设或让角色出戏';
  }
  if (candidate.kind !== 'style' || !hasOwnFingerprint(fingerprint)) return null;

  const dim = inferStyleDimension(text);
  if (dim === 'emoji' && /0\s*个|不(?:要|用|发)(?:任何)?\s*(?:emoji|表情)|纯文字/i.test(text) && fingerprint.emojiRate >= 0.6) {
    return `TA 本人很爱用表情（平均每条 ${fingerprint.emojiRate} 个），不学「完全不发表情」`;
  }
  if (dim === 'emoji' && /多(?:用|发)|每句都/.test(text) && fingerprint.emojiRate < 0.1) {
    return 'TA 本人几乎不用表情，不学「多发表情」';
  }
  if (
    dim === 'length' &&
    hasReliableLength(fingerprint) &&
    /精简|短句|别写长|少说/.test(text) &&
    fingerprint.avgBubbleLen >= 35
  ) {
    return `TA 本人习惯说长句（平均 ${fingerprint.avgBubbleLen} 字），不学「只说短句」`;
  }
  if (
    dim === 'length' &&
    hasReliableLength(fingerprint) &&
    /展开|多说|长一点|详细/.test(text) &&
    fingerprint.avgBubbleLen <= 8
  ) {
    return `TA 本人说话很短（平均 ${fingerprint.avgBubbleLen} 字），不学「长篇展开」`;
  }
  return null;
}

export function averageOf(xs: number[] | undefined): number | undefined {
  if (!xs || xs.length === 0) return undefined;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export interface AdmitResult {
  spec: PersonaSpec;
  trialed: LearnedItem[];
  reinforced: LearnedItem[];
  rejected: RejectedCandidate[];
}

/**
 * 把自进化候选放进试用：
 * - 护栏拒绝违背本人锚点的规则
 * - 风格规则同一维度只允许一条生效：locked 的用户规则不可被自动取代；已有 active 规则时新规则需置信度不低于它才进入试用，并标记 supersedes
 * - 新条目以 trial 状态进入 Prompt，记录当时的质量基线
 */
export function admitCandidates(
  spec: PersonaSpec,
  candidates: LearnedCandidate[],
  options: { now?: string } = {}
): AdmitResult {
  const now = options.now ?? new Date().toISOString();
  const rejected: RejectedCandidate[] = [];
  const accepted: Array<LearnedCandidate & { supersedes?: string }> = [];

  for (const c of candidates) {
    const guard = checkAnchorGuard(c, spec.fingerprint);
    if (guard) {
      rejected.push({ text: c.text, reason: guard });
      continue;
    }
    if (c.kind === 'style' && !findSimilarItem(spec.learned, 'style', c.text)) {
      const dim = inferStyleDimension(c.text);
      if (dim !== 'other') {
        const sameDim = spec.learned.filter(
          (it) => it.kind === 'style' && it.dimension === dim && it.status !== 'retired'
        );
        if (sameDim.some((it) => it.status === 'locked')) {
          rejected.push({ text: c.text, reason: '同一方面已有你锁定的规则' });
          continue;
        }
        if (sameDim.some((it) => it.status === 'trial')) {
          rejected.push({ text: c.text, reason: '同一方面已有规则在试用中' });
          continue;
        }
        const active = sameDim.find((it) => it.status === 'active');
        const conf = c.confidence ?? (c.source === 'llm' ? 0.6 : 0.5);
        if (active && conf < active.confidence) {
          rejected.push({ text: c.text, reason: '置信度低于当前生效的同类规则' });
          continue;
        }
        accepted.push({ ...c, supersedes: active?.id });
        continue;
      }
    }
    accepted.push(c);
  }

  const merged = mergeLearnedCandidates(spec, accepted, { initialStatus: 'trial', now });
  const baseline = averageOf(spec.recentQuality);
  const supersedesByText = new Map(accepted.map((c) => [c.text.replace(/\s+/g, ' ').trim(), c.supersedes]));
  const trialIds = new Set(merged.added.map((it) => it.id));
  const learned = merged.spec.learned.map((it) =>
    trialIds.has(it.id)
      ? {
          ...it,
          trialTurns: 0,
          trialScores: [],
          trialBaseline: baseline,
          supersedes: supersedesByText.get(it.text),
        }
      : it
  );
  return {
    spec: { ...merged.spec, learned },
    trialed: learned.filter((it) => trialIds.has(it.id)),
    reinforced: merged.reinforced,
    rejected,
  };
}

export interface TrialTransition {
  id: string;
  text: string;
  from: LearnedItem['status'];
  to: LearnedItem['status'];
  reason: string;
}

/**
 * 每轮结束后用上一轮回复的质量推进试用状态机
 */
export function applyTurnQuality(
  spec: PersonaSpec,
  turn: Pick<TurnQuality, 'quality'> & { signal: Pick<FeedbackSignal, 'explicit' | 'dimension' | 'reasons'> },
  options: { now?: string; trialTurns?: number } = {}
): { spec: PersonaSpec; transitions: TrialTransition[] } {
  const now = options.now ?? new Date().toISOString();
  const needed = options.trialTurns ?? TRIAL_TURNS;
  const transitions: TrialTransition[] = [];
  const retireIds = new Map<string, string>();

  let learned = spec.learned.map((it) => {
    if (it.status !== 'trial') return it;

    // 试用期间用户明确吐槽了这条规则管的那个方面：立即淘汰
    if (
      turn.signal.explicit &&
      it.kind === 'style' &&
      turn.signal.dimension &&
      it.dimension === turn.signal.dimension
    ) {
      transitions.push({ id: it.id, text: it.text, from: 'trial', to: 'retired', reason: `试用中被吐槽（${turn.signal.reasons.join('、')}）` });
      return { ...it, status: 'retired' as const, retiredReason: '试用中被用户吐槽', updatedAt: now };
    }

    const scores = [...(it.trialScores || []), turn.quality];
    const trialTurns = (it.trialTurns || 0) + 1;
    if (trialTurns < needed) {
      return { ...it, trialScores: scores, trialTurns, updatedAt: now };
    }

    const avg = averageOf(scores) ?? turn.quality;
    const baseline = it.trialBaseline;
    const passed = baseline === undefined || avg >= baseline - TRIAL_TOLERANCE;
    if (passed) {
      if (it.supersedes) retireIds.set(it.supersedes, `被新规则「${it.text.slice(0, 20)}」取代`);
      transitions.push({
        id: it.id,
        text: it.text,
        from: 'trial',
        to: 'active',
        reason: baseline === undefined ? `试用 ${trialTurns} 轮通过` : `试用 ${trialTurns} 轮平均 ${Math.round(avg)} 分（基线 ${Math.round(baseline)}）`,
      });
      return {
        ...it,
        status: 'active' as const,
        trialScores: scores,
        trialTurns,
        confidence: Math.min(1, Number((it.confidence + 0.1).toFixed(2))),
        updatedAt: now,
      };
    }
    const reason = `试用 ${trialTurns} 轮平均 ${Math.round(avg)} 分，低于基线 ${Math.round(baseline!)}`;
    transitions.push({ id: it.id, text: it.text, from: 'trial', to: 'retired', reason });
    return { ...it, status: 'retired' as const, trialScores: scores, trialTurns, retiredReason: reason, updatedAt: now };
  });

  if (retireIds.size > 0) {
    learned = learned.map((it) => {
      const reason = retireIds.get(it.id);
      if (!reason || it.status !== 'active') return it;
      transitions.push({ id: it.id, text: it.text, from: 'active', to: 'retired', reason });
      return { ...it, status: 'retired' as const, retiredReason: reason, updatedAt: now };
    });
  }

  const recentQuality = [...(spec.recentQuality || []), turn.quality].slice(-RECENT_QUALITY_WINDOW);
  return { spec: { ...spec, learned, recentQuality }, transitions };
}
