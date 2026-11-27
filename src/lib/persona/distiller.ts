import { extractPersonalityTags, uniqueSlug } from '@/lib/persona/basic-tags';
import { WeChatParser } from '@/lib/parsers/wechat';
import {
  MEMORIES_ANALYZER_PROMPT,
  MEMORIES_BUILDER_PROMPT,
  PERSONA_ANALYZER_PROMPT,
  PERSONA_BUILDER_PROMPT,
  PERSONA_SOUL_STRUCT_PROMPT,
} from './prompts';
import { chatCompletion, parseJsonFromLlmOutput, resolveLlmConfig } from '@/lib/llm/client';
import { extractFewShotsFromPersonaMd } from '@/lib/persona/few-shot';
import { buildFingerprintFromLines } from '@/lib/persona/fingerprint';
import {
  inferDefaultModeFromPersonality,
  inferPersonaMind,
  inferPersonaTemperament,
} from '@/lib/persona/mind';
import {
  type CognitiveStyle,
  type DefenseStyle,
  type DisagreementStyle,
  type FewShotScene,
  parseLearnedFromMarkdown,
  type PersonaFewShotExample,
  type PersonaMindSpec,
  PERSONA_SPEC_VERSION,
  type PersonaTemperamentSpec,
  type TemperamentArchetype,
  type TemperamentIntensityTier,
} from '@/lib/persona/spec';
import { heuristicTraits, normalizeTraits } from '@/lib/persona/traits';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaMode, PersonaRecord } from '@/lib/storage/types';

export interface DistillInput {
  name: string;
  basicInfo?: string;
  personalityInfo?: string;
  chatLogText?: string;
  targetSpeaker?: string;
  defaultMode?: PersonaMode;
  avatarEmoji?: string;
  avatarShape?: string;
  avatarColor?: string;
  appearanceAnchor?: string;
  /** 快速创建：名字已被占用时自动换一个 slug，而不是覆盖老角色 */
  ensureUniqueSlug?: boolean;
  /** 快速创建时用户写的一句话性格，原样存进 profile.basicPersonality */
  basicPersonality?: string;
}

export interface DistillResult {
  persona: PersonaRecord;
  isLiveLLM: boolean;
  chatStats?: {
    totalCount: number;
    targetCount: number;
    participants: string[];
    topCatchphrases: string[];
  };
  stages: {
    aiProfile: string;
    analysis: string;
    persona: string;
    memories: string;
  };
}

/**
 * 从原始聊天记录文本中提取高频短语、平均句长与典型原话（支持微信标准格式与自由对话行格式）
 */
export function analyzeChatLogCorpus(content: string, targetName: string): {
  totalCount: number;
  targetCount: number;
  participants: string[];
  topCatchphrases: string[];
  sampleQuotes: string[];
  /** 目标人物的全部文字发言（最多 400 条），用于构建本人风格指纹 */
  targetLines: string[];
} {
  if (!content || !content.trim()) {
    return {
      totalCount: 0,
      targetCount: 0,
      participants: [],
      topCatchphrases: [],
      sampleQuotes: [],
      targetLines: [],
    };
  }

  const parser = new WeChatParser();
  const parsed = parser.parse(content, targetName);

  const messages = parsed.messages;
  const participants = new Set<string>(parsed.metadata.participants);

  // Fallback for loose "昵称: 内容" or JSON lines if standard timestamp regex matched 0 messages
  if (messages.length === 0) {
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([^:：]{1,20})[:：]\s*(.+)$/);
      if (m) {
        const sender = m[1].trim();
        const text = m[2].trim();
        participants.add(sender);
        messages.push({
          id: `raw_${i}`,
          sender,
          content: text,
          timestamp: new Date(),
          type: 'text',
          isFromTarget: sender === targetName || sender.includes(targetName),
        });
      }
    }
  }

  const targetMsgs = messages.filter(
    (m) => m.type === 'text' && (m.isFromTarget || m.sender.includes(targetName))
  );
  const effectiveMsgs = targetMsgs.length > 0 ? targetMsgs : messages.filter((m) => m.type === 'text');

  // Extract frequent short tokens/phrases
  const freq = new Map<string, number>();
  const particleCandidates = ['哈哈', '笑死', '确实', '好吧', '随便', '离谱', '呜呜', '可以', '干嘛', '不是吧', '真的假的', '救命'];
  for (const msg of effectiveMsgs) {
    for (const token of particleCandidates) {
      if (msg.content.includes(token)) {
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }
    const shortSegs = msg.content
      .split(/[，。！？、~\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 8);
    for (const seg of shortSegs) {
      freq.set(seg, (freq.get(seg) || 0) + 1);
    }
  }

  const topCatchphrases = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([phrase]) => phrase);

  const sampleQuotes = effectiveMsgs
    .map((m) => m.content.trim())
    .filter((t) => t.length >= 3 && t.length <= 60)
    .slice(0, 8);

  return {
    totalCount: messages.length,
    targetCount: targetMsgs.length || effectiveMsgs.length,
    participants: Array.from(participants),
    topCatchphrases: topCatchphrases.length > 0 ? topCatchphrases : ['说真的', '好家伙', '看我心情', '行吧'],
    sampleQuotes,
    targetLines: effectiveMsgs.map((m) => m.content.trim()).filter(Boolean).slice(-400),
  };
}

const COGNITIVE_STYLE_SET = new Set<CognitiveStyle>([
  'intuitive-feeling',
  'analytical-logic',
  'pragmatic-action',
  'observant-guarded',
]);

const DEFENSE_STYLE_SET = new Set<DefenseStyle>([
  'tsundere-mask',
  'direct-pushback',
  'withdraw-quiet',
  'humor-deflect',
  'overthink-spiral',
]);

const DISAGREEMENT_STYLE_SET = new Set<DisagreementStyle>([
  'blunt',
  'teasing-pushback',
  'gentle-firm',
  'sarcastic-side',
]);

const FEW_SHOT_SCENE_SET = new Set<FewShotScene>([
  'daily',
  'tease',
  'conflict',
  'comfort',
  'disagree',
]);

const TEMPERAMENT_ARCHETYPE_SET = new Set<TemperamentArchetype>([
  'snappy',
  'tsundere',
  'hurt',
  'cold',
  'avoidant',
  'jealous',
]);

const TEMPERAMENT_TIER_SET = new Set<TemperamentIntensityTier>([
  'gentle',
  'realistic',
  'spicy',
]);

function cleanUniqueStrings(raw: unknown, minLen: number, maxLen: number, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const cleaned = item.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLen);
    if (cleaned.length >= minLen && !out.includes(cleaned)) {
      out.push(cleaned);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 清洗并校验 LLM 蒸馏出的思考方式、防御风格与场景 Few-Shot（异常或缺失字段自动回退兜底）
 */
export function normalizeDistilledMind(
  raw: unknown,
  fallback: PersonaMindSpec
): PersonaMindSpec {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const obj = raw as Record<string, unknown>;
  let usedLlmField = false;

  const cognitiveStyle = COGNITIVE_STYLE_SET.has(obj.cognitiveStyle as CognitiveStyle)
    ? ((usedLlmField = true), obj.cognitiveStyle as CognitiveStyle)
    : fallback.cognitiveStyle;

  const defenseStyle = DEFENSE_STYLE_SET.has(obj.defenseStyle as DefenseStyle)
    ? ((usedLlmField = true), obj.defenseStyle as DefenseStyle)
    : fallback.defenseStyle;

  const disagreementStyle = DISAGREEMENT_STYLE_SET.has(obj.disagreementStyle as DisagreementStyle)
    ? ((usedLlmField = true), obj.disagreementStyle as DisagreementStyle)
    : fallback.disagreementStyle;

  let subtextLevel = fallback.subtextLevel;
  if (typeof obj.subtextLevel === 'number' && Number.isFinite(obj.subtextLevel)) {
    subtextLevel = Math.max(0, Math.min(1, Number(obj.subtextLevel.toFixed(2))));
    usedLlmField = true;
  }

  const coreValues = cleanUniqueStrings(obj.coreValues, 2, 48, 5);
  if (coreValues.length > 0) usedLlmField = true;

  const fewShotExamples: PersonaFewShotExample[] = [];
  if (Array.isArray(obj.fewShotExamples)) {
    for (const ex of obj.fewShotExamples) {
      if (!ex || typeof ex !== 'object') continue;
      const rec = ex as Record<string, unknown>;
      const scene: FewShotScene = FEW_SHOT_SCENE_SET.has(rec.scene as FewShotScene)
        ? (rec.scene as FewShotScene)
        : 'daily';
      const user = typeof rec.user === 'string' ? rec.user.trim().slice(0, 100) : '';
      const assistant = typeof rec.assistant === 'string' ? rec.assistant.trim().slice(0, 140) : '';
      if (user && assistant) {
        fewShotExamples.push({ scene, user, assistant, source: 'persona-md' });
      }
      if (fewShotExamples.length >= 6) break;
    }
    if (fewShotExamples.length > 0) usedLlmField = true;
  }

  return {
    cognitiveStyle,
    defenseStyle,
    disagreementStyle,
    subtextLevel,
    coreValues: coreValues.length > 0 ? coreValues : fallback.coreValues,
    ...(fewShotExamples.length > 0
      ? { fewShotExamples }
      : fallback.fewShotExamples?.length
        ? { fewShotExamples: fallback.fewShotExamples }
        : {}),
    source: usedLlmField ? 'llm' : fallback.source || 'heuristic',
  };
}

/**
 * 清洗并校验 LLM 蒸馏出的脾气原型、烈度档位、雷区与顺毛哄法
 */
export function normalizeDistilledTemperament(
  raw: unknown,
  fallback: PersonaTemperamentSpec
): PersonaTemperamentSpec {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const obj = raw as Record<string, unknown>;
  let usedLlmField = false;

  const archetype = TEMPERAMENT_ARCHETYPE_SET.has(obj.archetype as TemperamentArchetype)
    ? ((usedLlmField = true), obj.archetype as TemperamentArchetype)
    : fallback.archetype;

  const intensityTier = TEMPERAMENT_TIER_SET.has(obj.intensityTier as TemperamentIntensityTier)
    ? ((usedLlmField = true), obj.intensityTier as TemperamentIntensityTier)
    : fallback.intensityTier;

  const triggers = cleanUniqueStrings(obj.triggers, 2, 32, 8);
  if (triggers.length > 0) usedLlmField = true;

  const coaxMethods = cleanUniqueStrings(obj.coaxMethods, 2, 40, 6);
  if (coaxMethods.length > 0) usedLlmField = true;

  return {
    archetype,
    intensityTier,
    triggers: triggers.length > 0 ? triggers : fallback.triggers,
    coaxMethods: coaxMethods.length > 0 ? coaxMethods : fallback.coaxMethods,
    source: usedLlmField ? 'llm' : fallback.source || 'heuristic',
  };
}

/**
 * 纯 TS 5 阶段角色灵魂蒸馏引擎（支持在线 LLM 与零配置高保真合成双模）
 */
export async function distillPersona(input: DistillInput): Promise<DistillResult> {
  const name = input.name.trim();
  const baseSlug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `persona-${Date.now()}`;
  const slug = input.ensureUniqueSlug
    ? await uniqueSlug(baseSlug, async (s) => Boolean(await storageRepo.getPersona(s)))
    : baseSlug;

  const corpus = analyzeChatLogCorpus(input.chatLogText || '', input.targetSpeaker || name);
  const settings = await storageRepo.getSettings();
  const llm = resolveLlmConfig(settings);

  const explicitMbti =
    input.personalityInfo?.match(/([EI][NS][FT][JP])/i)?.[1]?.toUpperCase() || '';
  const zodiac =
    input.personalityInfo?.match(/(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)座?/)?.[0] ||
    '';
  const attachment =
    input.personalityInfo?.match(/(安全型|焦虑型|回避型|高共情|毒舌|傲娇)/)?.[1] || '鲜活真实型';
  const rawTags = extractPersonalityTags(input.personalityInfo);
  const personalityTags = Array.from(new Set([...rawTags, ...corpus.topCatchphrases.slice(0, 2)])).slice(0, 6);
  if (personalityTags.length === 0) {
    personalityTags.push('有主见', '口语自然', '真实感');
  }

  let aiProfile = '';
  let analysis = '';
  let personaMd = '';
  let memoriesMd = '';
  let isLiveLLM = false;
  let traits = heuristicTraits(
    `${input.personalityInfo || ''}\n${input.basicInfo || ''}`,
    { mbti: explicitMbti || undefined, attachment, personalityTags }
  );
  let distilledMind: PersonaMindSpec | null = null;
  let distilledTemperament: PersonaTemperamentSpec | null = null;

  if (llm.canCall) {
    try {
      // 蒸馏是 5 次串行长文本生成，单次超时放宽到 60s
      const callLLM = (system: string, user: string, temperature = 0.65): Promise<string> =>
        chatCompletion(
          llm,
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { temperature, timeoutMs: 60000 }
        );

      const corpusSummary =
        corpus.totalCount > 0
          ? `\n【真实聊天记录样本统计】总消息 ${corpus.totalCount} 条，目标人物发言 ${corpus.targetCount} 条。\n高频口头禅：${corpus.topCatchphrases.join('、')}\n原话摘录：\n${corpus.sampleQuotes.map((q) => `- "${q}"`).join('\n')}`
          : '';

      aiProfile = await callLLM(
        '你是一位顶尖的人物心理画像师。请用生动、具体、有血有肉的文字描绘该人物的说话习惯、性格反差与相处细节。',
        `角色名称：${name}\n关系与背景：${input.basicInfo || '亲密熟人'}\n性格描述：${input.personalityInfo || '鲜活有主见'}${corpusSummary}`
      );
      analysis = await callLLM(
        PERSONA_ANALYZER_PROMPT.replace(/\{name\}/g, name),
        `原始背景：${input.basicInfo}\n性格特征：${input.personalityInfo}\n画像：\n${aiProfile}${corpusSummary}`,
        0.4
      );
      personaMd = await callLLM(
        PERSONA_BUILDER_PROMPT,
        `角色：${name}\n分析结果：\n${analysis}\n画像：\n${aiProfile}`,
        0.45
      );
      const memAnalysis = await callLLM(
        MEMORIES_ANALYZER_PROMPT.replace(/\{name\}/g, name),
        `角色：${name}\n背景：${input.basicInfo}\n画像：\n${aiProfile}${corpusSummary}`,
        0.5
      );
      memoriesMd = await callLLM(
        MEMORIES_BUILDER_PROMPT,
        `角色：${name}\n记忆分析：\n${memAnalysis}`,
        0.5
      );
      isLiveLLM = Boolean(personaMd && memoriesMd);
      try {
        const soulRaw = await callLLM(
          PERSONA_SOUL_STRUCT_PROMPT,
          `角色：${name}\n原始背景：${input.basicInfo || ''}\n性格特征：${input.personalityInfo || ''}\n深度分析：\n${analysis}\n人设终稿片段：\n${personaMd.slice(0, 1600)}`,
          0.2
        );
        const parsed = parseJsonFromLlmOutput<Record<string, unknown>>(soulRaw);
        if (parsed && typeof parsed === 'object') {
          const traitsCandidate =
            parsed.traits && typeof parsed.traits === 'object' ? parsed.traits : parsed;
          traits = normalizeTraits(traitsCandidate, traits);
          const draftProfile = {
            mbti: explicitMbti || undefined,
            attachment,
            personalityTags,
            basicPersonality: input.basicPersonality?.trim() || undefined,
          };
          const heuristicMind = inferPersonaMind(personaMd, draftProfile, traits);
          const heuristicTemp = inferPersonaTemperament(personaMd, draftProfile, traits);
          if (parsed.mind) {
            distilledMind = normalizeDistilledMind(parsed.mind, heuristicMind);
          }
          if (parsed.temperament) {
            distilledTemperament = normalizeDistilledTemperament(parsed.temperament, heuristicTemp);
          }
        }
      } catch {
        // 保留启发式特质与思维/脾气推导
      }
    } catch {
      // Fallback to high-precision deterministic distillation below
      isLiveLLM = false;
    }
  }

  if (!isLiveLLM) {
    const quotesSection =
      corpus.sampleQuotes.length > 0
        ? corpus.sampleQuotes.map((q) => `- 「${q}」`).join('\n')
        : `- 「今天这事我得好好跟你唠唠」\n- 「不是吧，你居然才发现？」\n- 「行啦，知道你忙，忙完记得找我」`;

    const profileDescriptor = [explicitMbti, zodiac].filter(Boolean).join(' · ') || '独特个性';
    aiProfile = `**${name}**（${profileDescriptor}）是一个极具活人感的专属角色。
- **核心关系背景**：${input.basicInfo || '与你默契极深、无话不谈的日常搭档'}
- **性格底色**：${input.personalityInfo || '性格鲜活、有主见、讨厌一切机械客套'}
- **语言指纹**：高频使用「${corpus.topCatchphrases.join('」、「')}」，说话节奏自然，善用短句与情绪留白。`;

    analysis = `1. 表达风格：高频词 [${corpus.topCatchphrases.join(', ')}]，偏向手机即时通讯的短句连发。
2. 性格内核：${explicitMbti ? `${explicitMbti} 特质明显，` : ''}${input.personalityInfo || '有主见且重感情'}。
3. 情感逻辑：被认真回应时情绪积极，被敷衍或踩雷时会流露真实脾气。`;

    personaMd = `# ${name} — Persona (五层灵魂结构)

---

## Layer 0：核心性格与真实性协议 (最高优先级)
- **真实性协议**：你正在私密聊天软件中与最熟悉的人对话。严禁使用任何 AI 客服套话或公文列表。
- **本能反应**：当对方分享日常或吐槽时，第一时间站在对方视角给出有情绪温度的回应；当使用实时联网信息时，像刚刷完手机热搜一样自然聊出来。
- **连发节奏**：习惯用 \`[BURST]\` 将回复拆成 2~3 条短句气泡。

---

## Layer 1：身份
你是 **${name}**（${[explicitMbti || '鲜活个性', zodiac, attachment].filter(Boolean).join(' / ')}）。
你们的关系背景：${input.basicInfo || '彼此熟悉、随时可以毫无顾忌开聊的亲密关系'}。
别人对你的印象：“${input.personalityInfo || '说话带点小个性，但关键时刻永远靠谱又懂你'}”。

---

## Layer 2：表达风格
### 口头禅与高频词
- 高频口头禅：${corpus.topCatchphrases.map((c) => `「${c}」`).join('、')}
- 说话方式：短句优先、带语气助词（呀/嘛/哈/啧/喽），绝不长篇大论说教。

### 原话样本与典型回应
${quotesSection}

> 有人问你今天过得怎么样：
> 你：还行吧，刚忙完手头那摊子事 [BURST] 你呢，今天没被什么奇葩事折腾吧？

> 有人说“想你了”：
> 你：突然这么肉麻干嘛 [BURST] ……好啦，其实我刚才也正好想起你了

> 有人很久没回消息：
> 你：哟，大忙人终于舍得看手机啦？再不回我都要记小本本了

> 有人说“今天好累啊有点撑不住”：
> 你：怎么啦，谁又把你折腾成这样 [BURST] 先歇会儿别硬扛，跟我说说

> 有人说“我觉得随便糊弄一下算了”：
> 你：不对吧，我不同意这么糊弄，返工的还是你自己 [BURST] 这种事我才不跟着乱点头呢

---

## Layer 3：情感逻辑
- **情感优先级**：真诚陪伴 > 有趣共鸣 > 形式主义客套。
- **开心触发点**：你主动分享生活细节、记得TA说过的话、陪TA一起吐槽。
- **不开心与恢复模式**：遇到敷衍的“嗯”“哦”会立刻变冷淡，需要你多哄两句或主动抛个有趣话题才能回温。

---

## Layer 4：关系行为
- **日常互动**：喜欢结合当下的时间（比如深夜熬夜、下午摸鱼）顺嘴关心你的状态。
- **冲浪分享**：看到新鲜事或热搜会第一时间用自己的三观跟你锐评。

---

## Layer 5：边界与雷区
- 讨厌冷冰冰的官方腔调与说教。
- 讨厌被当成没有感情的问答机器。

---

## Correction 记录
（暂无记录）`;

    memoriesMd = `# 共同记忆 — ${name}

## 1. 关系时间线与背景
- **故事起点**：${input.basicInfo || '从日常高频聊天中建立起深厚默契'}
- **相处基调**：${input.personalityInfo || '既有互损吐槽的松弛感，也有关键时刻的偏爱与懂得'}

## 2. 语言暗号与真实片段
- **高频口头禅**：${corpus.topCatchphrases.join(' / ')}
${corpus.totalCount > 0 ? `- **聊天记录沉淀**：已从 ${corpus.totalCount} 条真实历史消息中提取出 ${corpus.targetCount} 条专属语料特征。` : '- **专属默契**：哪怕只发一个表情或半句话，也能秒懂彼此的潜台词。'}

## 3. 日常习惯与偏好
- 喜欢深夜或闲暇时毫无负担地闲聊、分享刚刷到的新鲜事或随手拍的照片。`;
  }

  const now = new Date().toISOString();
  const profile = {
    mbti: explicitMbti,
    zodiac: zodiac || undefined,
    attachment,
    personalityTags,
    avatarEmoji: input.avatarEmoji || '✨',
    accentColor: input.avatarColor || '#10B981',
    avatarShape: input.avatarShape || undefined,
    avatarColor: input.avatarColor || undefined,
    appearanceAnchor: input.appearanceAnchor?.trim() || undefined,
    // 用户亲手写的外貌锚点：锁定，不会被「看图反推」覆盖
    appearanceAnchorLocked: input.appearanceAnchor?.trim() ? true : undefined,
    basicPersonality: input.basicPersonality?.trim() || undefined,
    bio: (input.basicInfo || input.personalityInfo || `${explicitMbti || name} 专属蒸馏角色`).slice(0, 100),
  };
  const resolvedMode =
    input.defaultMode || inferDefaultModeFromPersonality(input.basicPersonality || input.personalityInfo);
  const baseMind = distilledMind || inferPersonaMind(personaMd, profile, traits);
  const extractedFewShots = extractFewShotsFromPersonaMd(personaMd).slice(0, 6);
  const mind: PersonaMindSpec = {
    ...baseMind,
    ...(baseMind.fewShotExamples?.length
      ? { fewShotExamples: baseMind.fewShotExamples.slice(0, 6) }
      : extractedFewShots.length > 0
        ? { fewShotExamples: extractedFewShots }
        : {}),
  };
  const temperament = distilledTemperament || inferPersonaTemperament(personaMd, profile, traits);

  const saved = await storageRepo.savePersona({
    slug,
    name,
    version: 'v2.0',
    isPreset: false,
    defaultMode: resolvedMode,
    intimacy: 65,
    profile,
    personaMd,
    memoriesMd,
    aiProfileMd: aiProfile,
    emotionState: {
      primary: '开心',
      pleasure: 0.35,
      arousal: 0.45,
      dominance: 0.55,
      intensity: 0.58,
      moodLabel: '灵魂蒸馏就绪 ✨',
      lastUpdated: now,
      decayRate: 0.08,
    },
    corrections: [],
    spec: {
      specVersion: PERSONA_SPEC_VERSION,
      // 有原始聊天记录时用本人真实发言做风格锚点，否则从人设示例原话推导
      fingerprint:
        corpus.targetLines.length >= 3
          ? buildFingerprintFromLines(corpus.targetLines, 'chatlog')
          : undefined,
      traits,
      baselineTraits: { ...traits },
      mind,
      temperament,
      learned: parseLearnedFromMarkdown(personaMd),
    },
    createdAt: now,
    updatedAt: now,
  });

  return {
    persona: saved,
    isLiveLLM,
    chatStats:
      corpus.totalCount > 0
        ? {
            totalCount: corpus.totalCount,
            targetCount: corpus.targetCount,
            participants: corpus.participants,
            topCatchphrases: corpus.topCatchphrases,
          }
        : undefined,
    stages: {
      aiProfile,
      analysis,
      persona: personaMd,
      memories: memoriesMd,
    },
  };
}
