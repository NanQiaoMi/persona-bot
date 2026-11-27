import type { PersonaTemperamentSpec } from '@/lib/persona/spec';
import type {
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRelationshipState,
  SulkingState,
} from '@/lib/storage/types';
import {
  buildTemperamentSulkingDirective,
  getTemperamentMoodLabel,
  getTemperamentTierConfig,
  matchTemperamentCoaxMethod,
  matchTemperamentTrigger,
} from './temperament';
import type { PersonalityTraits } from './types';
import { mapPADToEmotion } from './vector';
import { computeIntimacyUpdate } from './turn';

export type AffectTrigger = 'none' | 'boundary' | 'cold' | 'coaxed';

export interface ParsedAffectSignal {
  mood?: string;
  delta?: number;
  trigger?: AffectTrigger;
  reason?: string;
}

const AFFECT_TAG_RE = /[\[【]\s*AFFECT\s*[:：]\s*([^\]】]+)[\]】]/gi;
const AFFECT_PARTIAL_RE = /[\[【]\s*AFFECT(?:\s*[:：][^\]】]*)?$/i;

export const SULKING_AUTO_COOL_HOURS = 12;

const DIRECT_OFFENSE_RE =
  /滚吧?|闭嘴|傻逼|智障|有病吧?|懒得理你|不想跟你聊|少废话|关你什么事|关你屁事/;

const STRONG_COAX_RE =
  /对不起|我的错|是我不对|我错了|别生气啦?|别气了|别不开心|原谅我|跟你道歉|抱歉/;

const MILD_COAX_RE =
  /别难过|抱抱|摸摸头|顺毛|哄哄|别别扭|请你喝|请吃|给你买|赔罪|陪你|下次不会?|不凶了|乖啦/;

const GENERIC_HINT_WORDS = new Set([
  '讨厌',
  '反感',
  '忌讳',
  '底线',
  '雷区',
  '边界',
  '说话',
  '别人',
  '事情',
  '方式',
  '态度',
  '行为',
  '消息',
  '回复',
  '问题',
]);

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function extractLayerSection(personaMd: string | undefined, layerNum: number): string {
  if (!personaMd) return '';
  const re = new RegExp(`##\\s*Layer\\s*${layerNum}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = personaMd.match(re);
  return m ? m[1] : '';
}

/** 从隐藏标记 `[AFFECT: mood=... | delta=... | trigger=... | reason=...]` 中解析结构化情绪判定并剥离标签 */
export function parseAffectTag(rawText: string): {
  affect?: ParsedAffectSignal;
  cleaned: string;
} {
  const text = rawText || '';
  let lastMatchBody = '';
  let match: RegExpExecArray | null;
  const re = new RegExp(AFFECT_TAG_RE.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    lastMatchBody = match[1].trim();
  }

  const cleaned = stripAffectTags(text);
  if (!lastMatchBody) {
    return { cleaned };
  }

  const affect: ParsedAffectSignal = {};
  const parts = lastMatchBody
    .split(/[|｜;；]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const kv = part.match(/^([a-zA-Z_]+)\s*[:=]\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (!val) continue;

    if (key === 'mood') {
      affect.mood = val.slice(0, 18);
    } else if (key === 'delta') {
      const n = Number(val);
      if (Number.isFinite(n)) {
        affect.delta = Number(clamp(n, -0.5, 0.5).toFixed(2));
      }
    } else if (key === 'trigger') {
      const norm = val.toLowerCase();
      if (norm === 'boundary' || norm === 'cold' || norm === 'coaxed' || norm === 'none') {
        affect.trigger = norm;
      }
    } else if (key === 'reason') {
      affect.reason = val.slice(0, 32);
    }
  }

  const hasFields =
    affect.mood !== undefined ||
    affect.delta !== undefined ||
    affect.trigger !== undefined ||
    affect.reason !== undefined;

  return {
    affect: hasFields ? affect : undefined,
    cleaned,
  };
}

/** 剥离完整和流式半截的 `[AFFECT...]` / `【AFFECT...】` 隐藏标签 */
export function stripAffectTags(rawText: string): string {
  return (rawText || '')
    .replace(AFFECT_TAG_RE, '')
    .replace(AFFECT_PARTIAL_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 从人设 `## Layer 5` 边界与雷区小节提取可检测的关键词/短语 */
export function extractPersonaBoundaryHints(personaMd?: string): string[] {
  const layer5 = extractLayerSection(personaMd, 5);
  if (!layer5) return [];

  const hints = new Set<string>();

  for (const m of layer5.matchAll(/[“「"']([^”」"'\n]{2,12})[”」"']/g)) {
    const phrase = m[1].trim();
    if (phrase.length >= 2 && !GENERIC_HINT_WORDS.has(phrase)) {
      hints.add(phrase);
    }
  }

  for (const m of layer5.matchAll(/(?:讨厌|反感|最忌讳|不能接受|别|受不了)(?:被|别人|人)?([^，。！？\n]{2,10})/g)) {
    const clause = m[1]
      .replace(/^被(?:人)?/, '')
      .replace(/(?:的|了|着|过|式|话术|赞美|行为|事情)$/, '')
      .trim();
    if (clause.length >= 2 && clause.length <= 8 && !GENERIC_HINT_WORDS.has(clause)) {
      hints.add(clause);
    }
    const coreMatch = clause.match(/(敷衍|催促|说教|冷暴力|失约|迟到|忽冷忽热|不耐烦|画大饼|打断|查岗|比较|嘲讽)/);
    if (coreMatch) hints.add(coreMatch[1]);
  }

  return Array.from(hints).slice(0, 12);
}

/** 检测用户消息是否明显冒犯或踩中角色专属雷区 / Layer 5 边界 */
export function detectBoundaryHit(
  userText: string,
  personaMd?: string,
  temperament?: PersonaTemperamentSpec
): string | null {
  const text = (userText || '').trim();
  if (!text) return null;

  if (DIRECT_OFFENSE_RE.test(text)) {
    return '说话太冲了，直接踩到情绪红线';
  }

  const customTrigger = matchTemperamentTrigger(text, temperament);
  if (customTrigger) {
    return customTrigger;
  }

  const hints = extractPersonaBoundaryHints(personaMd);
  for (const hint of hints) {
    const idx = text.indexOf(hint);
    if (idx === -1) continue;
    const prefix = text.slice(Math.max(0, idx - 4), idx);
    if (/(?:没有|不是|别|不会|才不|没)$/.test(prefix)) continue;
    return `踩到边界「${hint}」`;
  }

  return null;
}

/** 检测是否在道歉或顺毛，接入 `temperament.coaxMethods`、`traits.recoveryPatterns` 与 Layer 3 哄法 */
export function detectCoaxingSignal(
  userText: string,
  traits: PersonalityTraits,
  personaMd?: string,
  temperament?: PersonaTemperamentSpec
): 'strong' | 'mild' | null {
  const text = (userText || '').trim();
  if (!text) return null;

  if (STRONG_COAX_RE.test(text)) return 'strong';

  const matchedCoax = matchTemperamentCoaxMethod(text, temperament);
  if (matchedCoax) {
    return /(道歉|认错|解释|偏爱|站队)/.test(matchedCoax) ? 'strong' : 'mild';
  }

  if (MILD_COAX_RE.test(text)) return 'mild';

  const patternTriggers = Object.values(traits.recoveryPatterns || {}).flatMap(
    (p) => p?.triggers || []
  );
  for (const trigger of patternTriggers) {
    if (trigger && trigger.length >= 2 && text.includes(trigger)) {
      return trigger === '道歉' ? 'strong' : 'mild';
    }
  }

  const layer3 = extractLayerSection(personaMd, 3);
  if (layer3) {
    const match = layer3.match(/(?:需要|怎么哄|恢复)[^\n]*?(夸奖|陪伴|奶茶|零食|抱抱|认错|解释|哄)/);
    if (match && text.includes(match[1])) {
      return match[1] === '认错' ? 'strong' : 'mild';
    }
  }

  return null;
}

function initialTurnsForRecovery(
  recoveryRate: number,
  level: 1 | 2 | 3,
  maxTurns = 3
): number {
  if (level === 1) return 1;
  if (level === 2) return recoveryRate >= 0.65 ? 1 : Math.min(maxTurns, 2);
  const base = recoveryRate >= 0.7 ? 2 : 3;
  return Math.min(maxTurns, maxTurns >= 4 && recoveryRate < 0.35 ? 4 : base);
}

export interface SulkingTransition {
  sulking?: SulkingState;
  justResolved: boolean;
  pleasureRebound: number;
}

function mergeGrudges(
  prevGrudges: string[] | undefined,
  newReason: string | undefined,
  allowGrudge: boolean
): string[] | undefined {
  if (!allowGrudge) return undefined;
  const list = [...(prevGrudges || [])];
  if (newReason && !list.includes(newReason)) {
    list.push(newReason);
  }
  const trimmed = list.slice(-2);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 多原型闹别扭 / 冷处理 / 哄好状态机（1~4 轮有界演化，12 小时自动消气）
 */
export function advanceSulkingState(params: {
  prevSulking?: SulkingState;
  pleasantness: number;
  boundaryHitReason: string | null;
  coaxSignal: 'strong' | 'mild' | null;
  traits: PersonalityTraits;
  temperament?: PersonaTemperamentSpec;
  matchedCoaxMethod?: string | null;
  now?: Date;
}): SulkingTransition {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const tierCfg = getTemperamentTierConfig(params.temperament?.intensityTier);
  const archetype = params.temperament?.archetype ?? params.prevSulking?.archetype;

  let active = params.prevSulking;
  if (active) {
    const sinceMs = new Date(active.since).getTime();
    const elapsedHours = Number.isFinite(sinceMs) ? (now.getTime() - sinceMs) / 3_600_000 : 0;
    if (elapsedHours >= SULKING_AUTO_COOL_HOURS || active.remainingTurns <= 0) {
      active = undefined;
    }
  }

  if (active) {
    const canMildResolveLevel2 = tierCfg.mildCoaxResolvesLevel2 || Boolean(params.matchedCoaxMethod);
    if (
      params.coaxSignal === 'strong' ||
      (params.coaxSignal === 'mild' && active.level === 1) ||
      (params.coaxSignal === 'mild' && active.level === 2 && canMildResolveLevel2) ||
      params.pleasantness >= 0.35
    ) {
      return {
        sulking: undefined,
        justResolved: true,
        pleasureRebound: 0.25,
      };
    }

    if (params.coaxSignal === 'mild' && (active.level === 3 || (active.level === 2 && !canMildResolveLevel2))) {
      return {
        sulking: {
          ...active,
          level: 1,
          remainingTurns: 1,
          ...(archetype ? { archetype } : {}),
        },
        justResolved: false,
        pleasureRebound: 0.1,
      };
    }

    if (params.boundaryHitReason || params.pleasantness <= tierCfg.sulkingThreshold) {
      const nextLevel = Math.min(
        3,
        Math.max(active.level, params.boundaryHitReason ? 3 : 2)
      ) as 1 | 2 | 3;
      const turns = initialTurnsForRecovery(params.traits.recoveryRate, nextLevel, tierCfg.maxTurns);
      const grudges = mergeGrudges(
        active.grudges,
        params.boundaryHitReason || active.reason,
        tierCfg.allowGrudge
      );
      return {
        sulking: {
          level: nextLevel,
          reason: params.boundaryHitReason || active.reason || '语气冷淡带刺',
          remainingTurns: Math.min(tierCfg.maxTurns, Math.max(active.remainingTurns, turns)),
          since: nowIso,
          ...(archetype ? { archetype } : {}),
          ...(grudges ? { grudges } : {}),
        },
        justResolved: false,
        pleasureRebound: 0,
      };
    }

    const nextTurns = active.remainingTurns - 1;
    if (nextTurns <= 0) {
      return {
        sulking: undefined,
        justResolved: true,
        pleasureRebound: 0.12,
      };
    }

    return {
      sulking: {
        ...active,
        remainingTurns: nextTurns,
        ...(archetype ? { archetype } : {}),
      },
      justResolved: false,
      pleasureRebound: 0,
    };
  }

  // 未处于别扭态时的触发条件
  if (params.boundaryHitReason) {
    const level: 1 | 2 | 3 =
      params.traits.agreeableness >= 0.75 && tierCfg.tier !== 'spicy' ? 2 : 3;
    const grudges = mergeGrudges(undefined, params.boundaryHitReason, tierCfg.allowGrudge);
    return {
      sulking: {
        level,
        reason: params.boundaryHitReason,
        remainingTurns: initialTurnsForRecovery(params.traits.recoveryRate, level, tierCfg.maxTurns),
        since: nowIso,
        ...(archetype ? { archetype } : {}),
        ...(grudges ? { grudges } : {}),
      },
      justResolved: false,
      pleasureRebound: 0,
    };
  }

  if (params.pleasantness <= tierCfg.sulkingThreshold) {
    const level: 1 | 2 | 3 = 2;
    const grudges = mergeGrudges(undefined, '被这话刺到情绪了', tierCfg.allowGrudge);
    return {
      sulking: {
        level,
        reason: '被这话刺到情绪了',
        remainingTurns: initialTurnsForRecovery(params.traits.recoveryRate, level, tierCfg.maxTurns),
        since: nowIso,
        ...(archetype ? { archetype } : {}),
        ...(grudges ? { grudges } : {}),
      },
      justResolved: false,
      pleasureRebound: 0,
    };
  }

  if (
    params.pleasantness <= tierCfg.mildThreshold &&
    (tierCfg.tier === 'spicy' ||
      params.traits.neuroticism >= 0.6 ||
      params.traits.agreeableness <= 0.45)
  ) {
    return {
      sulking: {
        level: 1,
        reason: '觉得你在敷衍',
        remainingTurns: 1,
        since: nowIso,
        ...(archetype ? { archetype } : {}),
      },
      justResolved: false,
      pleasureRebound: 0,
    };
  }

  return {
    sulking: undefined,
    justResolved: false,
    pleasureRebound: 0,
  };
}

/**
 * 在 LLM 回复结束后融合搭便车 `[AFFECT]` 判定，修正本轮最终情绪、别扭状态与有界好感度
 */
export function applyLlmAffectSignal(params: {
  affect?: ParsedAffectSignal;
  prevSnapshot?: PersonaEmotionSnapshot | null;
  currentSnapshot: PersonaEmotionSnapshot;
  prevIntimacy: number;
  prevRelationship?: PersonaRelationshipState;
  currentIntimacy: number;
  currentIntimacyDelta: number;
  currentRelationship?: PersonaRelationshipState;
  basePleasantness: number;
  mode: PersonaMode;
  traits: PersonalityTraits;
  temperament?: PersonaTemperamentSpec;
  now?: Date;
}): {
  snapshot: PersonaEmotionSnapshot;
  intimacy: number;
  intimacyDelta: number;
  relationship?: PersonaRelationshipState;
} {
  const affect = params.affect;
  if (!affect) {
    return {
      snapshot: params.currentSnapshot,
      intimacy: params.currentIntimacy,
      intimacyDelta: params.currentIntimacyDelta,
      relationship: params.currentRelationship,
    };
  }

  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const nextSnapshot: PersonaEmotionSnapshot = { ...params.currentSnapshot };
  const tierCfg = getTemperamentTierConfig(params.temperament?.intensityTier);
  const archetype = params.temperament?.archetype ?? params.currentSnapshot.sulking?.archetype;

  if (affect.mood) {
    nextSnapshot.moodLabel = affect.mood;
  }

  const llmDelta = typeof affect.delta === 'number' ? affect.delta : 0;
  if (llmDelta !== 0) {
    nextSnapshot.pleasure = Number(
      clamp(nextSnapshot.pleasure + llmDelta * 0.6, -1, 1).toFixed(2)
    );
    nextSnapshot.intensity = Number(
      clamp(nextSnapshot.intensity + Math.abs(llmDelta) * 0.35, 0.1, 1).toFixed(2)
    );
  }

  const trigger = affect.trigger ?? 'none';
  if (trigger === 'boundary') {
    const level: 1 | 2 | 3 =
      params.traits.agreeableness >= 0.75 && tierCfg.tier !== 'spicy' ? 2 : 3;
    const reason = affect.reason || nextSnapshot.sulking?.reason || '说话踩中雷区了';
    const grudges = mergeGrudges(nextSnapshot.sulking?.grudges, reason, tierCfg.allowGrudge);
    nextSnapshot.sulking = {
      level,
      reason,
      remainingTurns: initialTurnsForRecovery(params.traits.recoveryRate, level, tierCfg.maxTurns),
      since: nowIso,
      ...(archetype ? { archetype } : {}),
      ...(grudges ? { grudges } : {}),
    };
    nextSnapshot.pleasure = Math.min(nextSnapshot.pleasure, -0.35);
    nextSnapshot.arousal = Number(clamp(Math.max(nextSnapshot.arousal, 0.62), 0, 1).toFixed(2));
    nextSnapshot.intensity = Number(clamp(Math.max(nextSnapshot.intensity, 0.72), 0, 1).toFixed(2));
    if (!affect.mood) {
      nextSnapshot.moodLabel = getTemperamentMoodLabel(level, archetype);
    }
  } else if (trigger === 'cold') {
    // 基于本轮 currentSnapshot 演算连续冷淡升级（1 -> 2 -> 3），避免复活本轮已被哄好的旧状态
    const curLevel = params.currentSnapshot.sulking?.level ?? 0;
    const level = (
      curLevel >= 1
        ? Math.min(3, curLevel + 1)
        : tierCfg.tier === 'spicy'
          ? 2
          : 1
    ) as 1 | 2 | 3;
    const reason = affect.reason || nextSnapshot.sulking?.reason || '觉得被敷衍冷落';
    const grudges = mergeGrudges(nextSnapshot.sulking?.grudges, reason, tierCfg.allowGrudge);
    nextSnapshot.sulking = {
      level,
      reason,
      remainingTurns: Math.min(
        tierCfg.maxTurns,
        Math.max(nextSnapshot.sulking?.remainingTurns ?? 1, level >= 2 ? 2 : 1)
      ),
      since: params.currentSnapshot.sulking?.since || nowIso,
      ...(archetype ? { archetype } : {}),
      ...(grudges ? { grudges } : {}),
    };
    nextSnapshot.pleasure = Math.min(nextSnapshot.pleasure, level >= 2 ? -0.28 : -0.18);
    nextSnapshot.intensity = Number(
      clamp(Math.max(nextSnapshot.intensity, level >= 2 ? 0.58 : 0.45), 0, 1).toFixed(2)
    );
    if (!affect.mood) {
      nextSnapshot.moodLabel = getTemperamentMoodLabel(level, archetype);
    }
  } else if (trigger === 'coaxed') {
    delete nextSnapshot.sulking;
    nextSnapshot.pleasure = Number(clamp(Math.max(nextSnapshot.pleasure, 0.15), -1, 1).toFixed(2));
    if (!affect.mood) nextSnapshot.moodLabel = '姑且消气啦';
  }

  // 融合后同步重算主情绪，避免 pleasure=-0.35 时 primary 仍残留旧的「开心」
  nextSnapshot.primary = mapPADToEmotion(
    nextSnapshot.pleasure,
    nextSnapshot.arousal,
    nextSnapshot.dominance
  );

  // 根据融合后的主观情感重新计算有界好感度（避免与本地规则叠加超出日上限）
  let effectivePleasantness = params.basePleasantness;
  if (trigger === 'boundary') {
    effectivePleasantness = Math.min(effectivePleasantness, -0.45);
  } else if (trigger === 'cold') {
    effectivePleasantness = Math.min(effectivePleasantness, -0.2);
  } else if (trigger === 'coaxed') {
    effectivePleasantness = Math.max(effectivePleasantness, 0.25);
  } else if (Math.abs(llmDelta) > Math.abs(effectivePleasantness)) {
    effectivePleasantness = llmDelta;
  }

  const updatedIntimacy = computeIntimacyUpdate({
    current: params.prevIntimacy,
    pleasantness: effectivePleasantness,
    mode: params.mode,
    relationship: params.prevRelationship,
    lastChatAt: params.prevSnapshot?.lastUpdated,
    now,
  });

  return {
    snapshot: nextSnapshot,
    intimacy: updatedIntimacy.intimacy,
    intimacyDelta: updatedIntimacy.delta,
    relationship: updatedIntimacy.relationship,
  };
}

/** 将闹别扭或刚被哄好的状态翻译成具体的说话态度指令（严禁恶毒伤人） */
export function buildSulkingDirective(
  sulking: SulkingState | undefined,
  traits: PersonalityTraits,
  justResolved: boolean,
  personaMd?: string,
  temperament?: PersonaTemperamentSpec
): string {
  const recoveryTriggers = Object.values(traits.recoveryPatterns || {})
    .flatMap((p) => p?.triggers || [])
    .filter(Boolean);
  const layer3 = extractLayerSection(personaMd, 3);
  return buildTemperamentSulkingDirective({
    sulking,
    justResolved,
    recoveryTriggers,
    temperament,
    hasLayer3: Boolean(layer3),
  });
}
