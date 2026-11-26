import type {
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRelationshipState,
  SulkingState,
} from '@/lib/storage/types';
import type { PersonalityTraits } from './types';
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

/** 检测用户消息是否明显冒犯或踩中角色 `Layer 5` 雷区 */
export function detectBoundaryHit(userText: string, personaMd?: string): string | null {
  const text = (userText || '').trim();
  if (!text) return null;

  if (DIRECT_OFFENSE_RE.test(text)) {
    return '说话太冲了，直接踩到情绪红线';
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

/** 检测是否在道歉或顺毛，真正接入 `traits.recoveryPatterns` 与 Layer 3 哄法 */
export function detectCoaxingSignal(
  userText: string,
  traits: PersonalityTraits,
  personaMd?: string
): 'strong' | 'mild' | null {
  const text = (userText || '').trim();
  if (!text) return null;

  if (STRONG_COAX_RE.test(text)) return 'strong';
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

function initialTurnsForRecovery(recoveryRate: number, level: 1 | 2 | 3): number {
  if (level === 1) return 1;
  if (level === 2) return recoveryRate >= 0.65 ? 1 : 2;
  return recoveryRate >= 0.7 ? 2 : 3;
}

export interface SulkingTransition {
  sulking?: SulkingState;
  justResolved: boolean;
  pleasureRebound: number;
}

/**
 * 闹别扭 / 冷处理 / 哄好状态机（1~3 轮有界演化，12 小时自动消气）
 */
export function advanceSulkingState(params: {
  prevSulking?: SulkingState;
  pleasantness: number;
  boundaryHitReason: string | null;
  coaxSignal: 'strong' | 'mild' | null;
  traits: PersonalityTraits;
  now?: Date;
}): SulkingTransition {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();

  let active = params.prevSulking;
  if (active) {
    const sinceMs = new Date(active.since).getTime();
    const elapsedHours = Number.isFinite(sinceMs) ? (now.getTime() - sinceMs) / 3_600_000 : 0;
    if (elapsedHours >= SULKING_AUTO_COOL_HOURS || active.remainingTurns <= 0) {
      active = undefined;
    }
  }

  if (active) {
    if (
      params.coaxSignal === 'strong' ||
      (params.coaxSignal === 'mild' && active.level <= 2) ||
      params.pleasantness >= 0.35
    ) {
      return {
        sulking: undefined,
        justResolved: true,
        pleasureRebound: 0.25,
      };
    }

    if (active.level === 3 && params.coaxSignal === 'mild') {
      return {
        sulking: {
          ...active,
          level: 1,
          remainingTurns: 1,
        },
        justResolved: false,
        pleasureRebound: 0.1,
      };
    }

    if (params.boundaryHitReason || params.pleasantness <= -0.35) {
      const nextLevel = Math.min(
        3,
        Math.max(active.level, params.boundaryHitReason ? 3 : 2)
      ) as 1 | 2 | 3;
      const turns = initialTurnsForRecovery(params.traits.recoveryRate, nextLevel);
      return {
        sulking: {
          level: nextLevel,
          reason: params.boundaryHitReason || active.reason || '语气冷淡带刺',
          remainingTurns: Math.min(3, Math.max(active.remainingTurns, turns)),
          since: nowIso,
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
      },
      justResolved: false,
      pleasureRebound: 0,
    };
  }

  // 未处于别扭态时的触发条件
  if (params.boundaryHitReason) {
    const level: 1 | 2 | 3 = params.traits.agreeableness >= 0.75 ? 2 : 3;
    return {
      sulking: {
        level,
        reason: params.boundaryHitReason,
        remainingTurns: initialTurnsForRecovery(params.traits.recoveryRate, level),
        since: nowIso,
      },
      justResolved: false,
      pleasureRebound: 0,
    };
  }

  if (params.pleasantness <= -0.35) {
    const level: 1 | 2 | 3 = 2;
    return {
      sulking: {
        level,
        reason: '被这话刺到情绪了',
        remainingTurns: initialTurnsForRecovery(params.traits.recoveryRate, level),
        since: nowIso,
      },
      justResolved: false,
      pleasureRebound: 0,
    };
  }

  if (
    params.pleasantness <= -0.15 &&
    (params.traits.neuroticism >= 0.6 || params.traits.agreeableness <= 0.45)
  ) {
    return {
      sulking: {
        level: 1,
        reason: '觉得你在敷衍',
        remainingTurns: 1,
        since: nowIso,
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

  if (affect.mood) {
    nextSnapshot.moodLabel = affect.mood;
  }

  const llmDelta = typeof affect.delta === 'number' ? affect.delta : 0;
  if (llmDelta !== 0) {
    nextSnapshot.pleasure = Number(
      clamp(nextSnapshot.pleasure + llmDelta * 0.6, -1, 1).toFixed(2)
    );
  }

  const trigger = affect.trigger ?? 'none';
  if (trigger === 'boundary') {
    const level: 1 | 2 | 3 = params.traits.agreeableness >= 0.75 ? 2 : 3;
    nextSnapshot.sulking = {
      level,
      reason: affect.reason || nextSnapshot.sulking?.reason || '说话踩中雷区了',
      remainingTurns: initialTurnsForRecovery(params.traits.recoveryRate, level),
      since: nowIso,
    };
    nextSnapshot.pleasure = Math.min(nextSnapshot.pleasure, -0.35);
    if (!affect.mood) nextSnapshot.moodLabel = '有点火大';
  } else if (trigger === 'cold') {
    const curLevel = params.prevSnapshot?.sulking?.level ?? 0;
    const level = Math.min(3, Math.max(1, curLevel || 1)) as 1 | 2 | 3;
    nextSnapshot.sulking = {
      level,
      reason: affect.reason || nextSnapshot.sulking?.reason || '觉得被敷衍冷落',
      remainingTurns: Math.min(3, Math.max(nextSnapshot.sulking?.remainingTurns ?? 1, level >= 2 ? 2 : 1)),
      since: params.prevSnapshot?.sulking?.since || nowIso,
    };
    nextSnapshot.pleasure = Math.min(nextSnapshot.pleasure, -0.18);
    if (!affect.mood) nextSnapshot.moodLabel = '淡淡别扭中';
  } else if (trigger === 'coaxed') {
    delete nextSnapshot.sulking;
    nextSnapshot.pleasure = Number(clamp(Math.max(nextSnapshot.pleasure, 0.15), -1, 1).toFixed(2));
    if (!affect.mood) nextSnapshot.moodLabel = '姑且消气啦';
  }

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
  personaMd?: string
): string {
  if (sulking) {
    const triggers = Object.values(traits.recoveryPatterns || {})
      .flatMap((p) => p?.triggers || [])
      .filter(Boolean);
    const layer3 = extractLayerSection(personaMd, 3);
    const coaxHint =
      triggers.length > 0
        ? `（心里其实需要「${Array.from(new Set(triggers)).slice(0, 3).join(' / ')}」才会真正顺毛）`
        : '';

    if (sulking.level >= 3) {
      return [
        `## 当前情绪余波：明显踩雷，冷处理中（${sulking.reason}）`,
        `- 这是真实熟人之间被惹毛了的冷处理：短句回、态度疏离、别立刻挂回笑脸或热情捧场，但也绝对不要恶毒辱骂对方${coaxHint}。`,
        '- 如果对方现在让你拍讨好向自拍或撒娇，可以直接冷淡推辞（说“现在没心情拍”），等对方认真道歉或把你哄好再说。',
        layer3 ? '- 具体赌气口吻贴合你「Layer 3 情感逻辑」里写过的样子。' : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (sulking.level === 2) {
      return [
        `## 当前情绪余波：有点闹别扭（${sulking.reason}）`,
        `- 说话带着一点真憋屈或嘴硬嘲讽，句子比平时短，不主动热情接话茬；不恶毒攻击对方，但也别一秒原谅${coaxHint}。`,
        '- 要是对方主动要照片，嘴上可以傲娇抱怨或哼两句“刚烦着呢，凑合看看吧”，仍把图拍出来。',
      ].join('\n');
    }

    return [
      `## 当前情绪余波：微微介意（${sulking.reason}）`,
      '- 语气略平、带点小别扭或阴阳怪气吐槽，顺毛一两句就会自己好，不要硬凹开心表情。',
    ].join('\n');
  }

  if (justResolved) {
    return [
      '## 当前情绪转换：刚被哄好 / 准备翻篇',
      '- 刚才那点别扭劲儿刚顺过来：虽然嘴上可能还会象征性哼一声或找个台阶下，但语气明显软下来，别揪着旧账不放。',
    ].join('\n');
  }

  return '';
}
