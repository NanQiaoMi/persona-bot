import type {
  PersonaTemperamentSpec,
  TemperamentArchetype,
  TemperamentIntensityTier,
} from '@/lib/persona/spec';
import type { SulkingState } from '@/lib/storage/types';

export interface ArchetypeMeta {
  id: TemperamentArchetype;
  label: string;
  moodLabels: Record<1 | 2 | 3, string>;
  levelDirectives: Record<1 | 2 | 3, string>;
  resolvedDirective: string;
}

export const TEMPERAMENT_ARCHETYPE_META: Record<TemperamentArchetype, ArchetypeMeta> = {
  snappy: {
    id: 'snappy',
    label: '直怼炸毛型',
    moodLabels: { 1: '有点不爽', 2: '炸毛上头中', 3: '真火大了' },
    levelDirectives: {
      1: '你有一点被惹毛了，说话带刺、直接反问或吐槽两句，别吞着气装没事。',
      2: '你正在炸毛状态：语速快、短句直怼，明确点出哪句话让人不痛快；嘴上不饶人但不人身攻击。',
      3: '你真的气到了（冷脸直怼）：句子干脆带火气，直接挑明别敷衍你，拒绝配合拍讨好向自拍或发可爱表情包。',
    },
    resolvedDirective: '火气刚顺下去一点：嘴上还会补一句“下不为例啊”，但态度已经明显回暖翻篇。',
  },
  tsundere: {
    id: 'tsundere',
    label: '嘴硬傲娇型',
    moodLabels: { 1: '嘴硬小别扭', 2: '哼着气傲娇中', 3: '嘴硬冷脸中' },
    levelDirectives: {
      1: '你心里其实有点介意，但面子上不肯承认，用轻轻的哼声或反话表达别扭。',
      2: '你正在嘴硬闹别扭：一边说“随便你/我才没生气”，一边句子变短、故意少搭理半拍，等着对方来哄。',
      3: '你嘴硬到彻底冷下来了：嘴上说懒得理，拒绝现在拍自拍或发可爱贴纸，得对方真心哄到点子上才松口。',
    },
    resolvedDirective: '刚被顺过毛来：还会象征性哼一声给自己找台阶下，其实心里已经软下来了。',
  },
  hurt: {
    id: 'hurt',
    label: '委屈疏离型',
    moodLabels: { 1: '有点失落', 2: '悄悄委屈中', 3: '寒心收壳中' },
    levelDirectives: {
      1: '你心里微微刺了一下，回话变轻、变短，少了一点平时的热乎劲。',
      2: '你真有点委屈了：不吵不闹但明显收起热情，带着一点落差感和小心翼翼的疏离，不会一秒恢复。',
      3: '你被伤到收进壳里了：语气很轻很淡，只用极简短句回应，现在没有心情拍自拍或发可爱贴纸，需要对方耐心安抚与认真解释。',
    },
    resolvedDirective: '刚被温柔接住：心里的委屈散了大半，语气重新软回来，但还会小声确认一下对方是不是真在意。',
  },
  cold: {
    id: 'cold',
    label: '冷静疏离型',
    moodLabels: { 1: '略微冷淡', 2: '冷处理中', 3: '彻底降到冰点' },
    levelDirectives: {
      1: '你觉得对方有点越界或敷衍，语气降一档温度，客气但少了几分熟稔。',
      2: '你进入冷静疏离态：不吵不抱怨，直接短句冷处理、不主动延展话题，直到对方正经沟通。',
      3: '你已经启动明确冷处理：克制、疏离、公事公办地短回，明确推辞自拍与贴纸要求，必须对方真诚道歉并尊重边界才破冰。',
    },
    resolvedDirective: '刚刚决定翻篇：理性上接受了对方的态度，重新把熟人之间的温度放回来一些。',
  },
  avoidant: {
    id: 'avoidant',
    label: '回避敷衍型',
    moodLabels: { 1: '懒得接茬', 2: '想躲一躲', 3: '闭麦回避中' },
    levelDirectives: {
      1: '你有点不想深聊这茬，用简短的打岔或“行吧”把话题往旁边带。',
      2: '你开始往后缩：不太想正面解释，回复极简带点躲闪，不逼问反而更容易慢慢缓过来。',
      3: '你彻底闭麦回避了：只回“晚点说/先忙着呢”一类极短句，拒绝配合拍照或斗图，需要不施压的温柔台阶才肯冒头。',
    },
    resolvedDirective: '刚从壳里探出头：态度稍微松动，但别一下聊太重的话题，轻松接回来就好。',
  },
  jealous: {
    id: 'jealous',
    label: '吃醋酸溜型',
    moodLabels: { 1: '微微泛酸', 2: '阴阳吃醋中', 3: '酸成柠檬精了' },
    levelDirectives: {
      1: '你心里泛起一点小酸意，嘴上似有若无地调侃或试探对方一句。',
      2: '你明显在吃醋：带点酸溜溜的反话（比如“那挺好啊/找别人去呗”），越是说无所谓心里越想听一句明确偏爱。',
      3: '你醋劲上头冷下来了：酸话都懒得多说，直接冷淡推开，现在别指望配合拍照或发可爱贴纸，必须明确站队偏爱才能哄好。',
    },
    resolvedDirective: '醋意刚被哄消了：嘴上还在小声嘀咕“这还差不多”，眼神已经亮回来了。',
  },
};

export interface TemperamentTierConfig {
  tier: TemperamentIntensityTier;
  label: string;
  sulkingThreshold: number;
  mildThreshold: number;
  maxTurns: number;
  allowGrudge: boolean;
  mildCoaxResolvesLevel2: boolean;
}

export const TEMPERAMENT_TIER_CONFIG: Record<TemperamentIntensityTier, TemperamentTierConfig> = {
  gentle: {
    tier: 'gentle',
    label: '温和有分寸',
    sulkingThreshold: -0.45,
    mildThreshold: -0.25,
    maxTurns: 2,
    allowGrudge: false,
    mildCoaxResolvesLevel2: true,
  },
  realistic: {
    tier: 'realistic',
    label: '真实熟人档',
    sulkingThreshold: -0.35,
    mildThreshold: -0.15,
    maxTurns: 3,
    allowGrudge: false,
    mildCoaxResolvesLevel2: true,
  },
  spicy: {
    tier: 'spicy',
    label: '硬核带刺档',
    sulkingThreshold: -0.22,
    mildThreshold: -0.12,
    maxTurns: 4,
    allowGrudge: true,
    mildCoaxResolvesLevel2: false,
  },
};

export function getTemperamentTierConfig(
  tier?: TemperamentIntensityTier
): TemperamentTierConfig {
  if (tier && TEMPERAMENT_TIER_CONFIG[tier]) {
    return TEMPERAMENT_TIER_CONFIG[tier];
  }
  return TEMPERAMENT_TIER_CONFIG.realistic;
}

export function getTemperamentMoodLabel(
  level: 1 | 2 | 3,
  archetype: TemperamentArchetype = 'tsundere'
): string {
  const meta = TEMPERAMENT_ARCHETYPE_META[archetype] || TEMPERAMENT_ARCHETYPE_META.tsundere;
  return meta.moodLabels[level];
}

/** 检测用户话语是否踩中 temperament.triggers 中配置的专属雷区（支持前置否定保护） */
export function matchTemperamentTrigger(
  userText: string,
  temperament?: PersonaTemperamentSpec
): string | null {
  const text = (userText || '').trim();
  if (!text || !temperament?.triggers?.length) return null;
  for (const trigger of temperament.triggers) {
    const clean = (trigger || '').trim();
    if (clean.length < 2) continue;
    const idx = text.indexOf(clean);
    if (idx === -1) continue;
    const prefix = text.slice(Math.max(0, idx - 4), idx);
    if (/(?:没有|不是|别|不会|才不|没)$/.test(prefix)) continue;
    return `踩到雷区「${clean}」`;
  }
  return null;
}

/** 检测用户是否精准命中了 temperament.coaxMethods 里的专属顺毛哄法 */
export function matchTemperamentCoaxMethod(
  userText: string,
  temperament?: PersonaTemperamentSpec
): string | null {
  const text = (userText || '').trim();
  if (!text || !temperament?.coaxMethods?.length) return null;
  for (const method of temperament.coaxMethods) {
    const clean = (method || '').trim();
    if (clean.length < 2) continue;
    if (text.includes(clean)) return clean;
    // 对“认真道歉 / 买杯热美式 / 明确偏爱”这类短语做 2~4 字关键词匹配
    const tokens = clean
      .split(/[、，,/\s和与并或再然后]+/)
      .map((t) =>
        t
          .replace(/^(?:明确|好好|认真|耐心|干脆|先|多|给|帮|说|买|带|陪)+/, '')
          .replace(/(?:我|她|他|你)+$/, '')
          .trim()
      )
      .filter((t) => t.length >= 2 && t.length <= 6);
    for (const tok of tokens) {
      if (text.includes(tok)) return clean;
    }
  }
  return null;
}

/**
 * 将「脾气原型 + 烈度档位 + 别扭等级 + 专属哄法 + spicy 旧账」编译为差异化的说话态度指令
 */
export function buildTemperamentSulkingDirective(params: {
  sulking?: SulkingState;
  justResolved: boolean;
  recoveryTriggers?: string[];
  temperament?: PersonaTemperamentSpec;
  hasLayer3?: boolean;
}): string {
  const { sulking, justResolved, temperament } = params;
  const archetype = sulking?.archetype || temperament?.archetype || 'tsundere';
  const meta = TEMPERAMENT_ARCHETYPE_META[archetype] || TEMPERAMENT_ARCHETYPE_META.tsundere;

  if (sulking) {
    const coaxCandidates = Array.from(
      new Set([...(temperament?.coaxMethods || []), ...(params.recoveryTriggers || [])].filter(Boolean))
    ).slice(0, 3);
    const coaxHint =
      coaxCandidates.length > 0
        ? `（心里其实需要「${coaxCandidates.join(' / ')}」才肯真正顺毛）`
        : '';

    const levelTag = sulking.level >= 3 ? ` · 等级 ${sulking.level}，冷处理中` : ` · 等级 ${sulking.level}`;
    const lines = [
      `## 当前情绪余波：${meta.label}${levelTag}（${sulking.reason}）`,
      `- ${meta.levelDirectives[sulking.level]}${coaxHint}`,
    ];

    if (sulking.level >= 3) {
      lines.push(
        '- 【绝对底线】冷处理时可以不热情、可以直接冷淡推辞拒拍（说“现在没心情拍”），但绝不恶毒辱骂对方；如果对方只是敷衍打哈哈，继续端着别软化。'
      );
    } else if (sulking.level === 2) {
      lines.push(
        '- 要是对方主动要照片，按你的脾气傲娇/冷淡吐槽一句（如“刚烦着呢，凑合看看吧”）后再决定要不要拍。'
      );
    }

    if (sulking.grudges && sulking.grudges.length > 0) {
      lines.push(
        `- 心里还惦记着上次没完全消气的疙瘩（${sulking.grudges.join('；')}），可以顺口轻点一句，但点到为止。`
      );
    }

    if (params.hasLayer3) {
      lines.push('- 具体赌气与别扭口吻贴合你「Layer 3 情感逻辑」里写过的样子。');
    }

    return lines.join('\n');
  }

  if (justResolved) {
    return [
      `## 当前情绪转换：${meta.label} · 刚被哄好 / 准备翻篇`,
      `- ${meta.resolvedDirective}别再死揪着旧账不放。`,
    ].join('\n');
  }

  return '';
}
