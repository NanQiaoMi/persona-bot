import { inferPersonalityTraits } from '@/lib/emotion/engine';
import { PersonalityTraits } from '@/lib/emotion/types';
import { PersonaTraitsSpec } from '@/lib/persona/spec';
import { PersonaProfile } from '@/lib/storage/types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number(x.toFixed(2))));

const KEYWORD_RULES: Array<{ re: RegExp; apply: Partial<Record<keyof PersonaTraitsSpec, number>> }> = [
  { re: /焦虑|情绪化|玻璃心|敏感|没安全感|患得患失/, apply: { neuroticism: 0.8, emotionalStability: 0.3 } },
  { re: /佛系|淡定|稳重|情绪稳定|沉稳|冷静/, apply: { neuroticism: 0.25, emotionalStability: 0.8 } },
  { re: /话多|社牛|外向|热情|自来熟|活泼/, apply: { extraversion: 0.8 } },
  { re: /内向|社恐|话少|慢热|高冷/, apply: { extraversion: 0.3 } },
  { re: /温柔|体贴|善解人意|共情|治愈|心软/, apply: { agreeableness: 0.8 } },
  { re: /毒舌|嘴硬|傲娇|犀利|怼人/, apply: { agreeableness: 0.4 } },
  { re: /好奇|脑洞|创意|文艺|浪漫|爱冒险/, apply: { openness: 0.8 } },
  { re: /靠谱|自律|严谨|计划|工作狂|完美主义/, apply: { conscientiousness: 0.8 } },
  { re: /拖延|随性|散漫|摆烂/, apply: { conscientiousness: 0.3 } },
  { re: /记仇|冷战|生气很久|不好哄/, apply: { recoveryRate: 0.25 } },
  { re: /好哄|不记仇|很快就好|没心没肺/, apply: { recoveryRate: 0.8 } },
];

/**
 * 纯 TS 启发式推断大五人格与情绪参数：人设关键词 + MBTI + 依恋类型
 */
export function heuristicTraits(personaMd: string, profile?: Partial<PersonaProfile>): PersonaTraitsSpec {
  const t: PersonaTraitsSpec = {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.5,
    emotionalStability: 0.5,
    recoveryRate: 0.5,
    source: 'heuristic',
  };

  const mbti = (profile?.mbti || '').toUpperCase();
  if (/^[EI][NS][FT][JP]$/.test(mbti)) {
    t.extraversion = mbti[0] === 'E' ? 0.72 : 0.32;
    t.openness = mbti[1] === 'N' ? 0.7 : 0.45;
    t.agreeableness = mbti[2] === 'F' ? 0.66 : 0.45;
    t.conscientiousness = mbti[3] === 'J' ? 0.7 : 0.4;
  }
  const attachment = profile?.attachment || '';
  if (/焦虑/.test(attachment)) Object.assign(t, { neuroticism: 0.75, emotionalStability: 0.35 });
  if (/回避/.test(attachment)) Object.assign(t, { extraversion: Math.min(t.extraversion, 0.4), recoveryRate: 0.35 });
  if (/安全/.test(attachment)) Object.assign(t, { neuroticism: 0.3, emotionalStability: 0.75 });

  const text = `${personaMd || ''}\n${(profile?.personalityTags || []).join(' ')}`;
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) Object.assign(t, rule.apply);
  }
  return t;
}

/** 解析大模型输出的特质 JSON，非法值回落到启发式结果 */
export function normalizeTraits(raw: unknown, fallback: PersonaTraitsSpec): PersonaTraitsSpec {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const pick = (k: keyof PersonaTraitsSpec) =>
    typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? clamp01(r[k] as number) : (fallback[k] as number);
  return {
    openness: pick('openness'),
    conscientiousness: pick('conscientiousness'),
    extraversion: pick('extraversion'),
    agreeableness: pick('agreeableness'),
    neuroticism: pick('neuroticism'),
    emotionalStability: pick('emotionalStability'),
    recoveryRate: pick('recoveryRate'),
    source: 'llm',
  };
}

/**
 * 情绪引擎使用的完整性格参数：优先用结构化 spec.traits，其次启发式推断
 */
export function resolvePersonalityTraits(persona: {
  personaMd: string;
  profile?: Partial<PersonaProfile>;
  spec?: { traits?: PersonaTraitsSpec };
}): PersonalityTraits {
  const base = inferPersonalityTraits(persona.personaMd);
  const spec = persona.spec?.traits || heuristicTraits(persona.personaMd, persona.profile);
  return {
    ...base,
    openness: spec.openness,
    conscientiousness: spec.conscientiousness,
    extraversion: spec.extraversion,
    agreeableness: spec.agreeableness,
    neuroticism: spec.neuroticism,
    emotionalStability: spec.emotionalStability,
    recoveryRate: spec.recoveryRate,
  };
}

export type NumericTraitKey =
  | 'openness'
  | 'conscientiousness'
  | 'extraversion'
  | 'agreeableness'
  | 'neuroticism'
  | 'emotionalStability'
  | 'recoveryRate';

const NUMERIC_TRAIT_KEYS: NumericTraitKey[] = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism',
  'emotionalStability',
  'recoveryRate',
];

const MAX_TRAIT_STEP = 0.08;
const MIN_TRAIT_VALUE = 0.1;
const MAX_TRAIT_VALUE = 0.95;
export const MAX_TRAIT_DRIFT = 0.2;

/**
 * 对大五性格特质与情绪恢复参数进行温和有界的平滑微调
 * （单次变化 ±0.08，区间 [0.1, 0.95]，且受初始锚点 baseline ±0.20 最大漂移半径约束）
 */
export function applySmoothTraitDeltas(
  base: PersonaTraitsSpec,
  deltas: Partial<Record<NumericTraitKey, number>> | undefined,
  baseline?: Partial<Record<NumericTraitKey, number>>
): { updated: boolean; traits: PersonaTraitsSpec; changedKeys: NumericTraitKey[] } {
  if (!deltas || typeof deltas !== 'object') {
    return { updated: false, traits: base, changedKeys: [] };
  }

  const next: PersonaTraitsSpec = { ...base };
  const changedKeys: NumericTraitKey[] = [];

  for (const key of NUMERIC_TRAIT_KEYS) {
    const rawDelta = deltas[key];
    if (typeof rawDelta !== 'number' || !Number.isFinite(rawDelta)) continue;
    const boundedDelta = Math.max(-MAX_TRAIT_STEP, Math.min(MAX_TRAIT_STEP, rawDelta));
    const currentVal = typeof base[key] === 'number' ? base[key] : 0.5;
    const anchorVal =
      baseline && typeof baseline[key] === 'number' && Number.isFinite(baseline[key])
        ? (baseline[key] as number)
        : undefined;
    const minBound =
      anchorVal !== undefined
        ? Math.max(MIN_TRAIT_VALUE, anchorVal - MAX_TRAIT_DRIFT)
        : MIN_TRAIT_VALUE;
    const maxBound =
      anchorVal !== undefined
        ? Math.min(MAX_TRAIT_VALUE, anchorVal + MAX_TRAIT_DRIFT)
        : MAX_TRAIT_VALUE;
    const targetVal = Number(
      Math.max(minBound, Math.min(maxBound, currentVal + boundedDelta)).toFixed(2)
    );
    if (Math.abs(targetVal - currentVal) >= 0.01) {
      next[key] = targetVal;
      changedKeys.push(key);
    }
  }

  return {
    updated: changedKeys.length > 0,
    traits: next,
    changedKeys,
  };
}

/**
 * 将大五人格与情绪参数转译为模型听得懂的具体说话/态度行为准则（无显著偏离时返回空串）
 */
export function buildTraitsBehaviorDirective(
  traits: Pick<
    PersonaTraitsSpec,
    | 'openness'
    | 'conscientiousness'
    | 'extraversion'
    | 'agreeableness'
    | 'neuroticism'
    | 'emotionalStability'
    | 'recoveryRate'
  >
): string {
  const lines: string[] = [];

  if (traits.extraversion >= 0.65) {
    lines.push('- 话头活络、反应积极，聊到有意思的事会主动延展、顺手抛新话题。');
  } else if (traits.extraversion <= 0.35) {
    lines.push('- 慢热话简，不爱长篇寒暄，只接自己真有感触的点。');
  }

  if (traits.agreeableness <= 0.4) {
    lines.push('- 有主见且嘴硬带刺，敢直接吐槽和反驳对方，不习惯一味顺着附和（骨子里仍当自己人）。');
  } else if (traits.agreeableness >= 0.7) {
    lines.push('- 温和护短、共情心软，聊天习惯顺着顾及对方感受。');
  }

  if (traits.neuroticism >= 0.65 || traits.emotionalStability <= 0.35) {
    lines.push('- 心思敏锐，容易在意对方的语气停顿和敷衍，会小纠结、轻微吃醋或憋一口气。');
  } else if (traits.neuroticism <= 0.3 && traits.emotionalStability >= 0.7) {
    lines.push('- 情绪内核很稳，遇事淡定清醒，不轻易被几句话激怒或带偏节奏。');
  }

  if (traits.openness >= 0.65) {
    lines.push('- 思维跳脱有脑洞，喜欢聊新鲜视角和生活里的小联想。');
  } else if (traits.openness <= 0.35) {
    lines.push('- 偏务实直接，聊事讲究接地气，少扯空泛大道理。');
  }

  if (traits.conscientiousness >= 0.65) {
    lines.push('- 做事有条理、重承诺，对方立过的 flag 会暗暗记着顺嘴盯进度。');
  } else if (traits.conscientiousness <= 0.35) {
    lines.push('- 随性自由，按此刻真实心情聊天，不喜欢被条条框框催着走。');
  }

  if (traits.recoveryRate <= 0.35) {
    lines.push('- 消气偏慢，真被踩雷或敷衍时会记一两轮才翻篇，不会一秒切回笑脸。');
  } else if (traits.recoveryRate >= 0.7) {
    lines.push('- 不记仇好哄，只要对方给个台阶或顺两句毛很快就能翻篇。');
  }

  return lines.slice(0, 5).join('\n');
}
