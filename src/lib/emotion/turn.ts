import { EmotionEngine } from './engine';
import {
  advanceSulkingState,
  detectBoundaryHit,
  detectCoaxingSignal,
} from './sulking';
import { getTemperamentMoodLabel, matchTemperamentCoaxMethod } from './temperament';
import { resolvePersonalityTraits } from '@/lib/persona/traits';
import { EmotionVector, PersonalityTraits } from './types';
import { createDefaultEmotionVector, mapPADToEmotion } from './vector';
import {
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRecord,
  PersonaRelationshipState,
} from '@/lib/storage/types';

/** 好感度每日净增上限 */
export const DAILY_INTIMACY_GAIN_CAP = 6;
/** 冷落衰减：每满 N 天未聊扣 1 点 */
export const NEGLECT_DAYS_PER_POINT = 3;
export const NEGLECT_MAX_PENALTY = 5;
/** 冷落衰减不会把好感度拉到这个值以下 */
export const NEGLECT_FLOOR = 40;
/** 情绪时间衰减最多回溯的小时数 */
const MAX_DECAY_HOURS = 72;

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 把持久化的情绪快照还原为情绪引擎可用的完整向量 */
export function snapshotToVector(snapshot?: PersonaEmotionSnapshot | null): EmotionVector {
  const base = createDefaultEmotionVector();
  if (!snapshot) return base;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const intensity = num(snapshot.intensity, base.intensity);
  return {
    ...base,
    pleasure: num(snapshot.pleasure, base.pleasure),
    arousal: num(snapshot.arousal, base.arousal),
    dominance: num(snapshot.dominance, base.dominance),
    intensity,
    peakIntensity: intensity,
    decayRate: num(snapshot.decayRate, base.decayRate),
    primary: snapshot.primary || base.primary,
    lastUpdated: snapshot.lastUpdated ? new Date(snapshot.lastUpdated) : undefined,
  };
}

/**
 * 根据本轮消息的愉悦度评估计算好感度变化（中性消息不涨分）
 */
export function baseIntimacyDelta(pleasantness: number, mode: PersonaMode): number {
  if (pleasantness >= 0.4) return mode === 'companion' ? 2 : 1;
  if (pleasantness > 0.15) return 1;
  if (pleasantness <= -0.4) return -3;
  if (pleasantness < -0.15) return -2;
  return 0;
}

export interface IntimacyUpdate {
  intimacy: number;
  delta: number;
  neglectPenalty: number;
  relationship: PersonaRelationshipState;
}

/**
 * 有界的好感度演进：每日净增上限 + 长时间不聊的冷落衰减
 */
export function computeIntimacyUpdate(params: {
  current: number;
  pleasantness: number;
  mode: PersonaMode;
  relationship?: PersonaRelationshipState;
  lastChatAt?: string;
  now?: Date;
}): IntimacyUpdate {
  const now = params.now ?? new Date();
  const today = localDateKey(now);
  const ledger =
    params.relationship && params.relationship.ledgerDate === today
      ? params.relationship.gainedToday
      : 0;

  const lastChatIso = params.relationship?.lastChatAt || params.lastChatAt;
  let neglectPenalty = 0;
  if (lastChatIso) {
    const days = (now.getTime() - new Date(lastChatIso).getTime()) / 86_400_000;
    if (Number.isFinite(days) && days >= NEGLECT_DAYS_PER_POINT) {
      neglectPenalty = Math.min(
        NEGLECT_MAX_PENALTY,
        Math.floor(days / NEGLECT_DAYS_PER_POINT),
        Math.max(0, params.current - NEGLECT_FLOOR)
      );
    }
  }

  let delta = baseIntimacyDelta(params.pleasantness, params.mode);
  if (delta > 0) {
    delta = Math.max(0, Math.min(delta, DAILY_INTIMACY_GAIN_CAP - ledger));
  }

  const total = delta - neglectPenalty;
  const intimacy = Math.max(0, Math.min(100, Math.round(params.current + total)));

  return {
    intimacy,
    delta: intimacy - params.current,
    neglectPenalty,
    relationship: {
      ledgerDate: today,
      gainedToday: ledger + Math.max(0, delta),
      lastChatAt: now.toISOString(),
    },
  };
}

export interface TurnEmotionResult {
  vector: EmotionVector;
  snapshot: PersonaEmotionSnapshot;
  description: string;
  pleasantness: number;
  hoursSinceLast: number;
  intimacy: IntimacyUpdate;
  traits: PersonalityTraits;
  sulkingTransition: {
    justResolved: boolean;
    boundaryHitReason: string | null;
  };
}

/**
 * 跨轮情绪演进：从上一轮持久化的情绪出发 → 按间隔时间自然衰减 → 处理本轮用户消息 → 更新别扭态与好感度
 */
export function evolveTurnEmotion(
  persona: Pick<PersonaRecord, 'personaMd' | 'emotionState' | 'intimacy' | 'relationship'> &
    Partial<Pick<PersonaRecord, 'profile' | 'spec'>>,
  userText: string,
  mode: PersonaMode,
  now: Date = new Date()
): TurnEmotionResult {
  const traits = resolvePersonalityTraits(persona);
  const temperament = persona.spec?.temperament;
  const initialHistory = Array.isArray(persona.emotionState?.recentPad)
    ? persona.emotionState.recentPad.slice(-5).map((pad) => ({
        ...createDefaultEmotionVector(),
        pleasure: pad.p,
        arousal: pad.a,
        dominance: pad.d,
      }))
    : undefined;
  const engine = new EmotionEngine(
    traits,
    snapshotToVector(persona.emotionState),
    initialHistory
  );

  const lastUpdatedMs = persona.emotionState?.lastUpdated
    ? new Date(persona.emotionState.lastUpdated).getTime()
    : NaN;
  const hoursSinceLast = Number.isFinite(lastUpdatedMs)
    ? Math.max(0, Math.min(MAX_DECAY_HOURS, (now.getTime() - lastUpdatedMs) / 3_600_000))
    : 0;
  if (hoursSinceLast >= 0.05) {
    engine.evolveByTime(hoursSinceLast, { isSulking: Boolean(persona.emotionState?.sulking) });
  }

  const boundaryHitReason = detectBoundaryHit(userText, persona.personaMd, temperament);
  const coaxSignal = detectCoaxingSignal(userText, traits, persona.personaMd, temperament);
  const matchedCoaxMethod = matchTemperamentCoaxMethod(userText, temperament);

  const vector = engine.processEvent({
    type: 'message',
    content: userText,
    sender: 'user',
    timestamp: now,
    metadata: boundaryHitReason ? { boundaryHit: true } : undefined,
  });

  const pleasantness = vector.appraisal?.pleasantness ?? 0;
  const sulkingRes = advanceSulkingState({
    prevSulking: persona.emotionState?.sulking,
    pleasantness,
    boundaryHitReason,
    coaxSignal,
    traits,
    temperament,
    matchedCoaxMethod,
    now,
  });

  const adjustedPleasure = Math.max(
    -1,
    Math.min(1, vector.pleasure + sulkingRes.pleasureRebound)
  );
  const finalPrimary =
    sulkingRes.pleasureRebound !== 0
      ? mapPADToEmotion(adjustedPleasure, vector.arousal, vector.dominance)
      : vector.primary;

  const intimacy = computeIntimacyUpdate({
    current: persona.intimacy,
    pleasantness,
    mode,
    relationship: persona.relationship,
    lastChatAt: persona.emotionState?.lastUpdated,
    now,
  });

  const resolvedMoodLabel = sulkingRes.sulking
    ? getTemperamentMoodLabel(
        sulkingRes.sulking.level,
        sulkingRes.sulking.archetype || temperament?.archetype
      )
    : sulkingRes.justResolved
      ? '姑且消气了'
      : persona.emotionState?.sulking
        ? finalPrimary
        : persona.emotionState?.moodLabel || finalPrimary;

  const nextRecentPad = [
    ...(persona.emotionState?.recentPad || []),
    {
      p: Number(adjustedPleasure.toFixed(2)),
      a: Number(vector.arousal.toFixed(2)),
      d: Number(vector.dominance.toFixed(2)),
    },
  ].slice(-5);

  const snapshot: PersonaEmotionSnapshot = {
    primary: finalPrimary,
    pleasure: Number(adjustedPleasure.toFixed(2)),
    arousal: Number(vector.arousal.toFixed(2)),
    dominance: Number(vector.dominance.toFixed(2)),
    intensity: Number(vector.intensity.toFixed(2)),
    moodLabel: resolvedMoodLabel,
    lastUpdated: now.toISOString(),
    decayRate: vector.decayRate,
    ...(sulkingRes.sulking ? { sulking: sulkingRes.sulking } : {}),
    recentPad: nextRecentPad,
  };

  return {
    vector,
    snapshot,
    description: sulkingRes.sulking
      ? `${engine.getEmotionDescription()}（当前别扭等级 ${sulkingRes.sulking.level}：${sulkingRes.sulking.reason}）`
      : engine.getEmotionDescription(),
    pleasantness,
    hoursSinceLast,
    intimacy,
    traits,
    sulkingTransition: {
      justResolved: sulkingRes.justResolved,
      boundaryHitReason,
    },
  };
}
