import { WeChatParser } from '@/lib/parsers/wechat';
import {
  MEMORIES_ANALYZER_PROMPT,
  MEMORIES_BUILDER_PROMPT,
  PERSONA_ANALYZER_PROMPT,
  PERSONA_BUILDER_PROMPT,
} from './prompts';
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
} {
  if (!content || !content.trim()) {
    return {
      totalCount: 0,
      targetCount: 0,
      participants: [],
      topCatchphrases: [],
      sampleQuotes: [],
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
  };
}

/**
 * 纯 TS 5 阶段角色灵魂蒸馏引擎（支持在线 LLM 与零配置高保真合成双模）
 */
export async function distillPersona(input: DistillInput): Promise<DistillResult> {
  const name = input.name.trim();
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `persona-${Date.now()}`;

  const corpus = analyzeChatLogCorpus(input.chatLogText || '', input.targetSpeaker || name);
  const settings = await storageRepo.getSettings();
  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const baseUrl = (settings.llmBaseUrl || process.env.LLM_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
  const model = settings.llmModel || process.env.LLM_MODEL || 'grok-3';

  const mbti =
    input.personalityInfo?.match(/([EI][NS][FT][JP])/i)?.[1]?.toUpperCase() || 'ENFP';
  const zodiac =
    input.personalityInfo?.match(/(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)座?/)?.[0] ||
    '水瓶座';
  const attachment =
    input.personalityInfo?.match(/(安全型|焦虑型|回避型|高共情|毒舌|傲娇)/)?.[1] || '鲜活真实型';
  const rawTags = input.personalityInfo?.match(/[\u4e00-\u9fa5A-Za-z]{2,6}/g) || [];
  const personalityTags = Array.from(new Set([...rawTags, ...corpus.topCatchphrases.slice(0, 2)])).slice(0, 6);
  if (personalityTags.length === 0) {
    personalityTags.push('有主见', '口语自然', '真实感');
  }

  let aiProfile = '';
  let analysis = '';
  let personaMd = '';
  let memoriesMd = '';
  let isLiveLLM = false;

  if (apiKey && apiKey !== 'your-api-key') {
    try {
      const endpoint = baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl}/chat/completions`;

      const callLLM = async (system: string, user: string, temperature = 0.65): Promise<string> => {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      };

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

    aiProfile = `**${name}**（${mbti} · ${zodiac}）是一个极具活人感的专属角色。
- **核心关系背景**：${input.basicInfo || '与你默契极深、无话不谈的日常搭档'}
- **性格底色**：${input.personalityInfo || '嘴硬心软、反应敏捷、讨厌一切机械客套'}
- **语言指纹**：高频使用「${corpus.topCatchphrases.join('」、「')}」，说话节奏自然，善用短句与情绪留白。`;

    analysis = `1. 表达风格：高频词 [${corpus.topCatchphrases.join(', ')}]，偏向手机即时通讯的短句连发。
2. 性格内核：${mbti} 特质明显，对亲近的人护短且自带小傲娇。
3. 情感逻辑：被认真回应时情绪积极，被敷衍或久不回复会流露微妙小脾气。`;

    personaMd = `# ${name} — Persona (五层灵魂结构)

---

## Layer 0：核心性格与真实性协议 (最高优先级)
- **真实性协议**：你正在私密聊天软件中与最熟悉的人对话。严禁使用任何 AI 客服套话或公文列表。
- **本能反应**：当对方分享日常或吐槽时，第一时间站在对方视角给出有情绪温度的回应；当使用实时联网信息时，像刚刷完手机热搜一样自然聊出来。
- **连发节奏**：习惯用 \`[BURST]\` 将回复拆成 2~3 条短句气泡。

---

## Layer 1：身份
你是 **${name}**（${mbti} / ${zodiac} / ${attachment}）。
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
  const saved = await storageRepo.savePersona({
    slug,
    name,
    version: 'v2.0',
    isPreset: false,
    defaultMode: input.defaultMode || 'authentic',
    intimacy: 65,
    profile: {
      mbti,
      zodiac,
      attachment,
      personalityTags,
      avatarEmoji: input.avatarEmoji || '✨',
      accentColor: input.avatarColor || '#10B981',
      avatarShape: input.avatarShape || undefined,
      avatarColor: input.avatarColor || undefined,
      bio: (input.basicInfo || input.personalityInfo || `${mbti} 专属蒸馏角色`).slice(0, 100),
    },
    personaMd,
    memoriesMd,
    aiProfileMd: aiProfile,
    emotionState: {
      primary: 'happy',
      pleasure: 0.35,
      arousal: 0.45,
      dominance: 0.55,
      intensity: 0.58,
      moodLabel: '灵魂蒸馏就绪 ✨',
      lastUpdated: now,
      decayRate: 0.08,
    },
    corrections: [],
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
