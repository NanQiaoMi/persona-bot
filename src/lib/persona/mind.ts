import { extractPersonaBoundaryHints } from '@/lib/emotion/sulking';
import type {
  CognitiveStyle,
  DefenseStyle,
  DisagreementStyle,
  PersonaMindSpec,
  PersonaTemperamentSpec,
  PersonaTraitsSpec,
  TemperamentArchetype,
} from '@/lib/persona/spec';
import type { PersonaMode, PersonaProfile, PersonaRecord } from '@/lib/storage/types';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number(n.toFixed(2))));
}

/**
 * 根据一段性格描述推断最合适的默认对话模式；
 * 仅在明确有对应倾向时选择 fun / companion / analytical，否则统一默认 authentic（不再强制 fun）。
 */
export function inferDefaultModeFromPersonality(personalityText?: string): PersonaMode {
  const text = (personalityText || '').trim();
  if (!text) return 'authentic';
  if (/(毒舌|吐槽|杠精|搞笑|整活|嘴欠|沙雕|幽默锐评)/.test(text)) {
    return 'fun';
  }
  if (/(温柔|治愈|高共情|贴心|粘人|宠溺|陪伴型|伴侣)/.test(text)) {
    return 'companion';
  }
  if (/(极客|理性|学霸|第一性原理|冷静分析|逻辑控|拆解|智囊)/.test(text)) {
    return 'analytical';
  }
  return 'authentic';
}

function collectCorpusText(
  personaMd: string,
  profile?: Partial<PersonaProfile>
): string {
  return [
    profile?.basicPersonality || '',
    profile?.bio || '',
    profile?.mbti || '',
    profile?.attachment || '',
    (profile?.personalityTags || []).join(' '),
    personaMd || '',
  ]
    .filter(Boolean)
    .join('\n');
}

function extractCoreValues(personaMd: string, profile?: Partial<PersonaProfile>): string[] {
  const values: string[] = [];
  const add = (val: string) => {
    const clean = val.replace(/^[-*+\s]+/, '').trim().slice(0, 36);
    if (clean.length >= 3 && !values.includes(clean)) {
      values.push(clean);
    }
  };

  if (profile?.basicPersonality?.trim()) {
    add(profile.basicPersonality.trim());
  }

  for (const tag of profile?.personalityTags || []) {
    if (tag && tag.length >= 2) {
      add(`保持「${tag}」的本色`);
    }
    if (values.length >= 3) break;
  }

  const boundaryHints = extractPersonaBoundaryHints(personaMd);
  for (const hint of boundaryHints.slice(0, 2)) {
    add(`讨厌被「${hint}」`);
  }

  if (values.length === 0) {
    add('真诚胜过敷衍客套');
    add('有自己的判断，不盲目顺从');
  }
  return values.slice(0, 5);
}

/**
 * 纯 TS 启发式推断角色的「性格思考方式、心理防御机制、分歧表达与口是心非度」
 */
export function inferPersonaMind(
  personaMd: string,
  profile?: Partial<PersonaProfile>,
  traits?: Partial<PersonaTraitsSpec>
): PersonaMindSpec {
  const text = collectCorpusText(personaMd, profile);
  const mbti = (profile?.mbti || '').toUpperCase();

  let cognitiveStyle: CognitiveStyle = 'intuitive-feeling';
  if (/逻辑|理性|极客|学霸|第一性原理|冷静|分析|拆解|INTJ|INTP|ENTJ|ISTJ/.test(text) || mbti[2] === 'T') {
    cognitiveStyle = 'analytical-logic';
  } else if (/行动派|干脆|直接|执行|务实|效率|ESTP|ISTP|ESTJ/.test(text)) {
    cognitiveStyle = 'pragmatic-action';
  } else if (/慢热|观察|敏锐|防备|克制|谨慎|INFJ|INFP|ISFJ/.test(text)) {
    cognitiveStyle = 'observant-guarded';
  }

  let defenseStyle: DefenseStyle = 'humor-deflect';
  if (/傲娇|嘴硬|口是心非|别扭|面子/.test(text)) {
    defenseStyle = 'tsundere-mask';
  } else if (/直球|炸毛|急眼|有话直说|护短|犀利|暴脾气/.test(text)) {
    defenseStyle = 'direct-pushback';
  } else if (/回避|慢热|筑墙|缩壳|冷淡|沉默|闷/.test(text)) {
    defenseStyle = 'withdraw-quiet';
  } else if (/敏感|多想|脑补|患得患失|玻璃心|焦虑/.test(text) || (traits?.neuroticism ?? 0.5) >= 0.72) {
    defenseStyle = 'overthink-spiral';
  } else if ((traits?.agreeableness ?? 0.5) <= 0.42) {
    defenseStyle = 'direct-pushback';
  }

  let disagreementStyle: DisagreementStyle = 'gentle-firm';
  if (/直球|毒舌|犀利|不留情|直怼|暴脾气/.test(text)) {
    disagreementStyle = 'blunt';
  } else if (/吐槽|互损|嘴硬|调侃|戏谑|傲娇/.test(text)) {
    disagreementStyle = 'teasing-pushback';
  } else if (/阴阳|反讽|冷笑/.test(text)) {
    disagreementStyle = 'sarcastic-side';
  } else if ((traits?.agreeableness ?? 0.5) <= 0.42) {
    disagreementStyle = 'teasing-pushback';
  }

  let subtextLevel = 0.45;
  if (defenseStyle === 'tsundere-mask' || defenseStyle === 'withdraw-quiet') {
    subtextLevel = 0.72;
  } else if (defenseStyle === 'overthink-spiral') {
    subtextLevel = 0.65;
  } else if (defenseStyle === 'direct-pushback') {
    subtextLevel = 0.25;
  }
  if (/口是心非|嘴硬/.test(text)) {
    subtextLevel = Math.max(subtextLevel, 0.75);
  }
  if (/直爽|有啥说啥|藏不住话/.test(text)) {
    subtextLevel = Math.min(subtextLevel, 0.22);
  }

  return {
    cognitiveStyle,
    defenseStyle,
    disagreementStyle,
    subtextLevel: clamp01(subtextLevel),
    coreValues: extractCoreValues(personaMd, profile),
    source: 'heuristic',
  };
}

const ARCHETYPE_DEFAULT_COAX: Record<TemperamentArchetype, string[]> = {
  snappy: ['别硬杠，先顺着承认错误', '递个台阶或打趣转移注意力'],
  tsundere: ['认真哄两句并夸一下', '给点具体的小偏爱或投喂'],
  hurt: ['好好抱抱安抚并解释清楚', '耐心听完委屈别敷衍'],
  cold: ['真诚道歉并说清楚原因', '给足尊重别继续催促'],
  avoidant: ['不逼问，先给空间再温柔接住', '用轻松小事重新破冰'],
  jealous: ['明确偏爱和站队', '哄着证明对方最特别'],
};

/**
 * 纯 TS 启发式推断角色的「脾气原型、专属雷区与顺毛哄法」
 */
export function inferPersonaTemperament(
  personaMd: string,
  profile?: Partial<PersonaProfile>,
  traits?: Partial<PersonaTraitsSpec>
): PersonaTemperamentSpec {
  const text = collectCorpusText(personaMd, profile);

  let archetype: TemperamentArchetype = 'tsundere';
  if (/吃醋|占有欲|酸|偏心|比较/.test(text)) {
    archetype = 'jealous';
  } else if (/炸毛|暴脾气|直怼|急眼|火大/.test(text)) {
    archetype = 'snappy';
  } else if (/委屈|玻璃心|掉眼泪|敏感|受伤/.test(text)) {
    archetype = 'hurt';
  } else if (/冷处理|冷淡|高冷|懒得理|不说话/.test(text)) {
    archetype = 'cold';
  } else if (/回避|敷衍|算了|懒得解释|逃避/.test(text)) {
    archetype = 'avoidant';
  } else if (/傲娇|嘴硬|口是心非/.test(text)) {
    archetype = 'tsundere';
  } else if ((traits?.neuroticism ?? 0.5) >= 0.72) {
    archetype = 'hurt';
  } else if ((traits?.extraversion ?? 0.5) <= 0.36) {
    archetype = 'cold';
  } else if ((traits?.agreeableness ?? 0.5) <= 0.42) {
    archetype = 'snappy';
  }

  const triggers = extractPersonaBoundaryHints(personaMd);
  const effectiveTriggers =
    triggers.length > 0 ? triggers.slice(0, 6) : ['敷衍嗯哦', '画大饼不兑现', '说话居高临下'];

  const layer3Match = (personaMd || '').match(/##\s*Layer\s*3[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  const coaxMethods: string[] = [];
  if (layer3Match) {
    const hints = layer3Match[1].match(/(?:需要|哄|顺毛|恢复|软化)[^。\n]{2,28}/g) || [];
    for (const h of hints.slice(0, 3)) {
      const cleaned = h.trim();
      if (cleaned && !coaxMethods.includes(cleaned)) coaxMethods.push(cleaned);
    }
  }
  if (coaxMethods.length === 0) {
    coaxMethods.push(...ARCHETYPE_DEFAULT_COAX[archetype]);
  }

  return {
    archetype,
    intensityTier: 'realistic',
    triggers: effectiveTriggers,
    coaxMethods: coaxMethods.slice(0, 4),
    source: 'heuristic',
  };
}

export function resolvePersonaMind(
  persona: Pick<PersonaRecord, 'personaMd' | 'profile' | 'spec'>
): PersonaMindSpec {
  if (persona.spec?.mind) {
    return persona.spec.mind;
  }
  return inferPersonaMind(persona.personaMd, persona.profile, persona.spec?.traits);
}

const COGNITIVE_LABELS: Record<CognitiveStyle, string> = {
  'intuitive-feeling': '第一反应先感受氛围和对方情绪温度，再决定怎么接话',
  'analytical-logic': '先在心里拆解逻辑、破绽和真正意图，不吃空头情绪鸡汤',
  'pragmatic-action': '直奔核心问题与可行动作，不喜欢绕弯子和空泛客套',
  'observant-guarded': '敏锐捕捉字里行间的小细节，心里过两遍确认安全感再落笔',
};

const DEFENSE_LABELS: Record<DefenseStyle, string> = {
  'tsundere-mask': '心里在意或被戳中时，习惯先嘴硬、反问或拿吐槽遮掩真实软肋',
  'direct-pushback': '被冒犯或觉得不对劲时直接顶回去，不憋着当受气包',
  'withdraw-quiet': '感到失望或不被理解时会往后缩半步、话变少，把情绪收在壳里',
  'humor-deflect': '遇到尴尬、刺耳或太沉重的话，下意识先用玩笑或自嘲化解场子',
  'overthink-spiral': '容易顺着半句话往下脑补很多细节，表面越平静心里越打转',
};

const DISAGREEMENT_LABELS: Record<DisagreementStyle, string> = {
  blunt: '直接坦率说出不同看法，不绕弯子',
  'teasing-pushback': '带着熟人调侃和轻微吐槽点破问题',
  'gentle-firm': '语气温和但立场明确，不被对方牵着鼻子走',
  'sarcastic-side': '带点反讽或斜睨式吐槽表达不认同',
};

/**
 * 将角色思维方式、防御机制与真实熟人分歧权编译为系统提示词指令
 */
export function buildMindCognitiveDirective(
  mind: PersonaMindSpec,
  temperament?: PersonaTemperamentSpec
): string {
  const subtextDesc =
    mind.subtextLevel >= 0.65
      ? '心里想 10 分时，嘴上通常只露 3~5 分，剩下的藏在停顿、反问或转移话题里'
      : mind.subtextLevel <= 0.3
        ? '心里想什么基本就直说什么，很少藏着掖着兜圈子'
        : '看关系远近决定说几分真话，既有分寸感也不会假客气';

  const lines: string[] = [
    '## 性格思考内核与真实熟人分歧权',
    `- **思考习惯**：${COGNITIVE_LABELS[mind.cognitiveStyle]}。`,
    `- **心理防御**：${DEFENSE_LABELS[mind.defenseStyle]}。`,
    `- **保留分寸**：${subtextDesc}。`,
    `- **真实熟人分歧权（重要）**：你不是顺从的客服！当对方说得明显离谱、自欺欺人、或与你最在意的底线冲突时，必须用「${DISAGREEMENT_LABELS[mind.disagreementStyle]}」的方式表达真实看法或站住立场，不要为了讨好无脑附和“你说得对”。`,
  ];

  if (mind.coreValues.length > 0) {
    lines.push(`- **你在意的事**：${mind.coreValues.slice(0, 4).join('；')}。`);
  }

  if (temperament) {
    const tierNote =
      temperament.intensityTier === 'spicy'
        ? '脾气直接且敏锐，踩雷后别轻易翻篇'
        : temperament.intensityTier === 'gentle'
          ? '脾气偏柔和有分寸，介意时会直说但容易被真诚安抚'
          : '像真实熟人一样有底线有脾气，被敷衍或踩雷会真不高兴';
    lines.push(`- **情绪基调**：${tierNote}。`);
  }

  return lines.join('\n');
}
