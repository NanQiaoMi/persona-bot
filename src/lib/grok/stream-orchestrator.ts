import { EmotionEngine, inferPersonalityTraits } from '@/lib/emotion/engine';
import {
  DeepSearchResponse,
  performDeepSearch,
  shouldAutoTriggerSearch,
} from '@/lib/grok/deep-search';
import {
  isLocalGatewayUrl,
  LOCAL_GATEWAY_BASE_URL,
} from '@/lib/grok/image-generator';
import { getMascotConfigForPersona } from '@/components/workspace/mascot-palette';
import { getPersonaModeSpec } from '@/lib/grok/persona-modes';
import { autoPersistTurnMemory } from '@/lib/persona/auto-memory';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { storageRepo } from '@/lib/storage/repository';
import {
  ConversationMessage,
  MediaCard,
  PageArtifactCardData,
  PendingFollowup,
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRecord,
} from '@/lib/storage/types';

export interface ChatTurnRequest {
  slug: string;
  mentionedSlug?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    imageUrl?: string;
    timestamp?: string;
  }>;
  mode?: PersonaMode;
  thinkMode?: boolean;
  deepSearch?: boolean;
  requestPhoto?: boolean;
  requestSticker?: boolean;
  modelId?: string;
}

export type StreamEvent =
  | {
      type: 'status';
      text: string;
    }
  | {
      type: 'media';
      mediaCards: MediaCard[];
    }
  | {
      type: 'search';
      status: 'searching' | 'done';
      query: string;
      provider?: string;
      results: DeepSearchResponse['results'];
    }
  | {
      type: 'thought';
      delta: string;
      fullThought: string;
      durationMs: number;
    }
  | {
      type: 'emotion';
      emotionState: PersonaEmotionSnapshot;
      intimacy: number;
      intimacyChange: number;
    }
  | {
      type: 'reply';
      delta: string;
      fullReply: string;
      bursts: string[];
      mediaCards: MediaCard[];
      isDemoMode: boolean;
    }
  | {
      type: 'message_part';
      message: ConversationMessage;
      index: number;
      total: number;
      hasMore: boolean;
    }
  | {
      type: 'done';
      message: ConversationMessage;
      messages?: ConversationMessage[];
      followup?: PendingFollowup;
    };

/**
 * 解析模型输出中的 <thought>、[MOOD]、[EARLY]、[FOLLOWUP]、[PHOTO]、[STICKER]、[VOICE] 与 [BURST]
 */
export function parseStructuredModelOutput(rawText: string, fallbackThought = ''): {
  thought: string;
  mood: string;
  cleanReply: string;
  bursts: string[];
  mediaCards: MediaCard[];
  followup?: { delaySec: number; content: string };
} {
  let working = rawText.trim();
  let thought = fallbackThought;

  const thoughtMatch = working.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thoughtMatch) {
    thought = thoughtMatch[1].trim();
    working = working.replace(thoughtMatch[0], '').trim();
  }

  let mood = '';
  const moodMatch = working.match(/\[MOOD:\s*([^\]]+)\]/i);
  if (moodMatch) {
    mood = moodMatch[1].trim();
    working = working.replace(moodMatch[0], '').trim();
  }

  let earlyText = '';
  const earlyMatch = working.match(/\[EARLY:\s*([^\]]+)\]/i);
  if (earlyMatch) {
    earlyText = earlyMatch[1].trim();
    working = working.replace(earlyMatch[0], '').trim();
  }

  let followup: { delaySec: number; content: string } | undefined;
  const followupMatch = working.match(
    /\[FOLLOWUP:\s*(\d{1,2})\s*[|｜]\s*([^\]]+)\]/i
  );
  if (followupMatch) {
    const rawSec = Number(followupMatch[1]);
    const delaySec = Math.max(5, Math.min(30, Number.isFinite(rawSec) ? rawSec : 8));
    const fContent = followupMatch[2].trim();
    if (fContent) {
      followup = { delaySec, content: fContent };
    }
    working = working.replace(followupMatch[0], '').trim();
  }

  const mediaCards: MediaCard[] = [];
  const photoRegex = /\[PHOTO:\s*([^\]]+)\]/gi;
  let photoMatch: RegExpExecArray | null;
  while ((photoMatch = photoRegex.exec(working)) !== null) {
    mediaCards.push({
      type: 'photo',
      caption: photoMatch[1].trim(),
    });
  }
  working = working.replace(photoRegex, '').trim();

  const stickerRegex = /\[STICKER:\s*([^\]]+)\]/gi;
  let stickerMatch: RegExpExecArray | null;
  while ((stickerMatch = stickerRegex.exec(working)) !== null) {
    mediaCards.push({
      type: 'sticker',
      caption: stickerMatch[1].trim(),
    });
  }
  working = working.replace(stickerRegex, '').trim();

  const voiceRegex = /\[VOICE:\s*([^\]]+)\]/gi;
  let voiceMatch: RegExpExecArray | null;
  while ((voiceMatch = voiceRegex.exec(working)) !== null) {
    const val = voiceMatch[1].trim();
    const secNum = Number(val);
    mediaCards.push({
      type: 'voice',
      caption: Number.isFinite(secNum) ? `拟真语音消息 (${secNum}s)` : val,
      durationSec: Number.isFinite(secNum)
        ? secNum
        : Math.max(3, Math.min(18, Math.ceil(val.length / 4))),
    });
  }
  working = working.replace(voiceRegex, '').trim();

  const bursts = splitLiveBursts(working);
  if (earlyText && !bursts.some((b) => b === earlyText)) {
    bursts.unshift(earlyText);
  }

  const cleanReply = bursts.join('\n\n');

  return {
    thought,
    mood,
    cleanReply: cleanReply || '（轻轻挑了下眉，等你继续往下说）',
    bursts: bursts.length > 0 ? bursts : [cleanReply || '我在听呢，继续说～'],
    mediaCards,
    followup,
  };
}

/**
 * 将流式或完整文本按 [BURST] / [EARLY] 拆分为干净的多气泡数组，清理内部多余空行
 */
export function splitLiveBursts(rawText: string): string[] {
  const withoutTags = rawText
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<thought>[\s\S]*/gi, '')
    .replace(/\[EARLY:\s*([^\]]+)\]/gi, '$1[BURST]')
    .replace(/\[(?:MOOD|PHOTO|STICKER|VOICE|FOLLOWUP):[^\]]*\]?/gi, '')
    .replace(/\[(?:MOOD|PHOTO|STICKER|VOICE|BURST|EARLY|FOLLOWUP)[^\]]*$/i, '');

  return withoutTags
    .split(/\[BURST\]/gi)
    .map((segment) =>
      segment
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    )
    .filter(Boolean);
}

/**
 * 清理模型可能夹带的底层网关/临时聊天拒答套话，保持角色沉浸感与有效回复
 */
export function sanitizeGatewayRefusalLeaks(bursts: string[]): string[] {
  const refusalPattern =
    /(?:不过)?(?:你现在是在|当前处于)?临时聊天[^。！？\n]*[。！？]?|切换到普通聊天[^。！？\n]*[。！？]?|(?:无法|不能)(?:直接)?使用图片生成[^。！？\n]*[。！？]?|我没有真实的手机[^。！？\n]*[。！？]?|不能假装这是我的实拍[^。！？\n]*[。！？]?/gi;

  const cleaned = bursts
    .map((b) =>
      b
        .replace(refusalPattern, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    )
    .filter((b) => b.length > 0 && !/^[🙈😅🤭\s]+$/.test(b));

  return cleaned.length > 0 ? cleaned : ['这就发给你看看呀～'];
}

/**
 * 基于用户最新要求与模型回复中的服装/场景细节，提取准确的生图/表情包描述，杜绝空泛占位词
 */
export function buildContextualMediaCaption(
  kind: 'photo' | 'sticker',
  personaName: string,
  userText: string,
  assistantReply: string,
  mood?: string
): string {
  const cleanUser = userText
    .replace(/^(?:请|帮我|能不能|可以)?(?:给我)?(?:发张|来张|发个|来个|看看|拍张|生成一张|画一张)/g, '')
    .replace(/(?:的照片|的图片|随手拍|看看呗|吗|呀|呢|！|。|\?)+$/g, '')
    .trim();

  const replyVisualLine = assistantReply
    .split(/[\n。！？]/)
    .map((s) => s.trim())
    .find(
      (s) =>
        s.length >= 6 &&
        s.length <= 90 &&
        /穿|裙|靴|衣|帽|发|夜景|台灯|咖啡|书桌|房间|微笑|眨眼|比耶|穿搭|风格/.test(s) &&
        !/临时聊天|普通聊天|照片发来/.test(s)
    );

  if (kind === 'sticker') {
    const moodPart = mood || cleanUser || '俏皮互动';
    return `${personaName} 表现出「${moodPart.slice(0, 32)}」的可爱贴纸表情包`;
  }

  const parts = [cleanUser, replyVisualLine].filter(Boolean);
  const merged = Array.from(new Set(parts)).join('，').slice(0, 110);
  if (merged.length >= 4) {
    return `${merged}的清晰真实生活随手拍照片`;
  }
  return `${personaName} 温馨自然的日常随手拍照片`;
}

function sleepForSimulatedStream(ms: number): Promise<void> {
  if (process.env.VITEST || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitLongProseParagraph(paragraph: string): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];
  if (trimmed.length <= 55) return [trimmed];

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const sentenceUnits: string[] = [];

  for (const line of lines) {
    if (line.length <= 40) {
      sentenceUnits.push(line);
      continue;
    }
    const matched = line.match(
      /[^。！？!?]+(?:[。！？!?]+[”’"'」』）)\s~～…]*|$)/g
    );
    if (matched && matched.length > 0) {
      for (const s of matched) {
        const cleanS = s.trim();
        if (cleanS) sentenceUnits.push(cleanS);
      }
    } else {
      sentenceUnits.push(line);
    }
  }

  if (sentenceUnits.length <= 1) return [trimmed];

  const grouped: string[] = [];
  let current = '';

  for (const unit of sentenceUnits) {
    if (!current) {
      current = unit;
      continue;
    }
    if (current.length < 18 && current.length + unit.length <= 68) {
      const needsSpace =
        /[a-zA-Z0-9]$/.test(current) && /^[a-zA-Z0-9]/.test(unit);
      current = `${current}${needsSpace ? ' ' : ''}${unit}`;
    } else {
      grouped.push(current);
      current = unit;
    }
  }

  if (current) {
    if (
      grouped.length > 0 &&
      current.length < 8 &&
      grouped[grouped.length - 1].length + current.length <= 75
    ) {
      grouped[grouped.length - 1] = `${grouped[grouped.length - 1]}${current}`;
    } else {
      grouped.push(current);
    }
  }

  return grouped.length > 0 ? grouped : [trimmed];
}

/**
 * 将回复语义拆分为多条自然聊天短消息（保留显式 [BURST]，同时自动拆分长段落，但保护代码块与列表完整）
 */
export function splitIntoNaturalMessages(
  bursts: string[],
  maxSegments = 4
): string[] {
  const rawChunks = bursts.map((b) => b.trim()).filter(Boolean);
  if (rawChunks.length === 0) {
    return ['我在听呢，继续说～'];
  }

  const expanded: string[] = [];
  for (const chunk of rawChunks) {
    const hasCodeFence = /```/.test(chunk);
    const hasMarkdownList = /(?:^|\n)\s*(?:[-*+]|\d+\.)\s+/.test(chunk);
    if (hasCodeFence || hasMarkdownList) {
      expanded.push(chunk);
      continue;
    }

    const paragraphs = chunk
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const para of paragraphs) {
      expanded.push(...splitLongProseParagraph(para));
    }
  }

  const normalized = expanded.filter(Boolean);
  if (normalized.length === 0) {
    return ['我在听呢，继续说～'];
  }

  const limit = Math.max(1, maxSegments);
  if (normalized.length <= limit) {
    return normalized;
  }

  const head = normalized.slice(0, limit - 1);
  const tailMerged = normalized.slice(limit - 1).join('\n');
  return [...head, tailMerged];
}

/**
 * 计算拟真人类打字/思考间隔（毫秒）；Vitest 下默认返回 0 以保持测试秒级完成
 */
export function computeRealisticTypingDelayMs(
  segment: string,
  index = 1,
  options?: { respectTestEnv?: boolean; jitter?: boolean }
): number {
  if (options?.respectTestEnv !== false && process.env.VITEST) {
    return 0;
  }
  const len = Math.max(1, segment.trim().length);
  const jitterMs =
    options?.jitter !== false ? Math.floor(Math.random() * 280) : 0;

  if (index <= 0) {
    return Math.min(750, Math.max(260, Math.round(260 + len * 14 + jitterMs)));
  }
  return Math.min(2800, Math.max(750, Math.round(680 + len * 46 + jitterMs)));
}

/**
 * 当未配置外部 API Key 或网络离线时，基于多轮上下文、角色五层人格、模式与实时联网结果合成高网感 Grok 风格响应
 */
export function synthesizePersonaAwareFallback(
  persona: PersonaRecord,
  userMessage: string,
  mode: PersonaMode,
  searchResp: DeepSearchResponse | null,
  hasImage: boolean,
  requestPhoto: boolean,
  historyCount = 1
): string {
  const modeSpec = getPersonaModeSpec(mode);
  const firstTag = persona.profile.personalityTags[0] || '真实鲜活';
  const topSearch = searchResp?.results[0];
  const isDeepFollowUp = historyCount > 2;

  let thought = '';
  let mood = '';
  const bursts: string[] = [];
  let mediaTag = '';

  if (hasImage) {
    thought = `收到一张图片。先扫一眼构图和细节，别像图像识别工具那样机械报菜名，用我（${persona.name}）的${modeSpec.shortLabel}直觉先接住再吐槽或夸一句。`;
    mood = '放大看图中';
    if (mode === 'fun') {
      bursts.push('行啊，终于开始上图证明自己不是赛博幽灵了？让我放大审一下细节。');
      bursts.push('说实话，这氛围感比我想象中在线不少，你今天审美居然没掉线。');
    } else if (mode === 'companion') {
      bursts.push('看到你分享过来的画面，一下子就像坐到你旁边了一样。');
      bursts.push('这张光线好温柔，下次看到好看的风景也第一时间发给我好不好？');
    } else if (mode === 'analytical') {
      bursts.push('画面信息接收完毕。构图重心和主体表达都很清晰。');
      bursts.push('你是想让我帮你客观评价一下细节，还是单纯想分享此刻的状态？');
    } else {
      bursts.push('突然甩张图过来……是想让我夸你拍得好吗？');
      bursts.push('行吧，勉强算你过关，先帮你收进记忆里了。');
    }
  } else if (topSearch) {
    const secondSearch = searchResp?.results[1];
    thought = `DeepSearch 刚刚捞回来 ${searchResp?.results.length || 1} 条关于「${searchResp?.query}」的实时脉搏（主来源：${topSearch.source}）。剥掉新闻通稿的腔调，直接用${modeSpec.shortLabel}风格聊透核心看点。`;
    if (mode === 'fun') {
      mood = '冲浪锐评中';
      bursts.push(
        `刚帮你把全网关于「${searchResp?.query}」的瓜扒了一遍，信息密度拉满。`
      );
      bursts.push(
        `说人话版本就是：${topSearch.snippet.slice(0, 96)}${secondSearch ? `；而且另一边还在热议「${secondSearch.title}」` : ''}。这剧情是不是比电视剧还离谱？`
      );
    } else if (mode === 'analytical') {
      mood = '第一性原理核验';
      bursts.push(
        `已交叉核验「${searchResp?.query}」的最新动态（来源：${topSearch.source}）。`
      );
      bursts.push(
        `剥离情绪噪音后，核心事实就一句话：${topSearch.snippet.slice(0, 105)}。真正值得盯紧的是它背后的长期变量，你想往哪一层深挖？`
      );
    } else if (mode === 'companion') {
      mood = '陪你同步世界';
      bursts.push(
        `看你提到「${searchResp?.query}」，我顺手翻了一下最新的讨论。`
      );
      bursts.push(
        `大家主要在聊：${topSearch.snippet.slice(0, 90)}。你今天怎么突然关注到这个啦，是不是跟你最近在忙的事有关？`
      );
    } else {
      mood = '刚刷到同款';
      bursts.push(`你说「${searchResp?.query}」啊？我刚才刷信息流正好也瞥见了。`);
      bursts.push(
        `大致意思就是 ${topSearch.snippet.slice(0, 88)}……你怎么突然对这个感兴趣了？`
      );
    }
  } else {
    const isEmotional = /想你|抱抱|累|难过|烦|压力|睡不着|失眠/.test(userMessage);
    const isChallenge = /凭什么|不对|反驳|胡说|笨|测试|你是ai|机器人/i.test(userMessage);

    if (isChallenge) {
      thought = `对方在试探或抬杠（「${userMessage.slice(0, 22)}」）。守住 Layer 0 真实性协议，绝不认怂更不跳出人设，反手用幽默或嘴硬接住。`;
      mood = mode === 'fun' ? '反杀抬杠中' : '微挑眉';
      bursts.push(
        mode === 'fun'
          ? '哟，开始对我进行图灵测试还是蓄意挑衅了？这问题问得有点太小看我了吧。'
          : '少拿这种问题试探我，我什么脾气你又不是第一天知道。'
      );
      bursts.push('说吧，是不是闲得发慌专门来逗我玩的？');
    } else if (mode === 'fun') {
      thought = `${isDeepFollowUp ? '紧接上一轮的聊天节奏，' : ''}收到「${userMessage.slice(0, 24)}」。切入 Grok 毒舌幽默视角：先拆套路再给情绪或洞见，保持「${firstTag}」底色。`;
      mood = isEmotional ? '嘴硬护短中' : '毒舌在线';
      if (isEmotional) {
        bursts.push('先停一下，别自己一个人闷头硬扛，这可不像平时的你。');
        bursts.push('把让你掉电的破事全倒出来，今晚我负责帮你一起精准吐槽，不收咨询费。');
      } else {
        bursts.push(
          `听到你说「${userMessage.slice(0, 20)}」，我脑子里瞬间闪过三个绝佳吐槽点。`
        );
        bursts.push('不过先听你把来龙去脉讲完——你这波操作背后肯定还有反转对吧？');
      }
    } else if (mode === 'companion') {
      thought = `读到「${userMessage.slice(0, 24)}」，能感觉到字里行间的情绪波动。把节奏放缓，第一时间接住对方的感受，给足偏爱与安全感。`;
      mood = '温柔偏爱中';
      if (isEmotional) {
        bursts.push('抱抱你，今天一定消耗了好多能量吧，到我这里就不用再端着了。');
        bursts.push('什么都不用急着解决，想说话我就安静听着，想放空我就陪你发会儿呆。');
      } else {
        bursts.push(`嗯，我在认真听呢。每次听你聊起「${userMessage.slice(0, 16)}」这类事，都觉得你眼光特别细腻。`);
        bursts.push('后面怎么样了？接着讲给我听呀。');
      }
    } else if (mode === 'analytical') {
      thought = `解构输入「${userMessage.slice(0, 24)}」：区分表层现象与底层约束，用高信息密度但自然的口吻给出清晰视角。`;
      mood = '冷静推演中';
      bursts.push(
        `把「${userMessage.slice(0, 18)}」拆开看，核心其实就两个维度：你现在手里可控的变量是什么，以及最坏情况的边界在哪里。`
      );
      bursts.push('如果你愿意把前提条件补全两句，我们可以直接推演出最省力的破局方案。');
    } else {
      thought = `看到他发来「${userMessage.slice(0, 24)}」，按我（${persona.name}）一贯${firstTag}的性格，表面保持松弛分寸，心里其实很在意他的下文。`;
      mood = persona.slug === 'lin-wan' ? '嘴硬心软' : '自然在线';
      if (persona.slug === 'lin-wan') {
        bursts.push(
          isEmotional
            ? '大晚上的说这些干嘛……不过你要是真觉得累了，歇一会儿也没人会笑话你。'
            : `每次聊到「${userMessage.slice(0, 14)}」，你都是这副口吻。`
        );
        bursts.push('……好啦，我正好也没睡，你想说就接着说呗。');
      } else {
        bursts.push(`刚看到你发「${userMessage.slice(0, 18)}」，我一下就被拉进这个话题了。`);
        bursts.push('你接着往下说，我手头的事刚好告一段落。');
      }
    }
  }

  if (requestPhoto || /自拍|照片|看看你|发张图/.test(userMessage)) {
    mediaTag = `\n[PHOTO: ${persona.name}的随手实拍：深空暗调桌面一角，暖色台灯映着半杯饮品与微亮的屏幕，镜头一角掠过一点自然随性的笑意]`;
  } else if (/语音|听你声音|说句话/.test(userMessage)) {
    mediaTag = `\n[VOICE: ${bursts[0] || '听得清吗？专门录一条语音回复你。'}]`;
  }

  return `<thought>${thought}</thought>\n[MOOD: ${mood}]\n${bursts.join(' [BURST] ')}${mediaTag}`;
}

/**
 * 在 DeepSearch 检索或结构化清单/汇总/档案场景下，自动生成可交互的 Grok Bot「页面」卡片
 */
function buildPageCardIfRelevant(
  persona: PersonaRecord,
  userMessage: string,
  searchResp: DeepSearchResponse | null,
  cleanReply: string,
  mode: PersonaMode
): PageArtifactCardData | undefined {
  const isStructuredIntent =
    Boolean(searchResp && searchResp.results.length > 0) ||
    /清单|汇总|总结|对比|机会|计划|分析|档案|报告|热搜|攻略|盘点/.test(userMessage);

  if (!isStructuredIntent) return undefined;

  const queryTitle = searchResp?.query
    ? `${searchResp.query} · 实时情报清单`
    : `${persona.name} 的结构化整理页面`;

  const sourceCount = searchResp?.results.length || 0;
  const nowStr = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const firstSource = searchResp?.results[0];
  const secondSource = searchResp?.results[1];

  return {
    id: `page_${Date.now()}`,
    title: queryTitle,
    subtitle: firstSource
      ? `${firstSource.snippet.slice(0, 110)}（由 ${persona.name} 结合实时信息与人设视角整理，点击底部可展开完整档案）`
      : `基于当前对话上下文由 ${persona.name} 为你整理的可续查结构化页面，支持展开阅读全文与来源核验。`,
    metrics: [
      {
        value: sourceCount > 0 ? `${sourceCount}` : `${cleanReply.length}`,
        label: sourceCount > 0 ? '实时来源' : '正文字符',
        detail: firstSource
          ? `主信源：${firstSource.source}`
          : `人格尺度：${getPersonaModeSpec(mode).shortLabel}`,
        tone: 'neutral',
      },
      {
        value: `${persona.intimacy}%`,
        label: '当前亲密度',
        detail: `心情：${persona.emotionState.moodLabel || persona.emotionState.primary}`,
        tone: 'teal',
      },
      {
        value: searchResp ? searchResp.provider.toUpperCase() : persona.profile.mbti || 'GROK',
        label: searchResp ? '检索引擎' : '人格基底',
        detail: secondSource
          ? `交叉参考：${secondSource.title.slice(0, 22)}`
          : '支持上下文实时续写更新',
        tone: 'amber',
      },
      {
        value: 'LIVE',
        label: '实时状态',
        detail: `更新于 ${nowStr} (Asia/Shanghai)`,
        tone: 'rose',
      },
    ],
    statusNotice: searchResp
      ? `阶段: deepsearch-${searchResp.provider} · 已抓取 ${sourceCount} 条公开网页摘要并注入角色记忆 (${nowStr})`
      : `阶段: persona-synthesis · 已按 ${persona.name} 五层人格与当前对话上下文生成页面 (${nowStr})`,
    footerLabel: '页面',
    fullContent: [
      `# ${queryTitle}`,
      '',
      `> 生成角色：${persona.name} (${persona.profile.mbti || 'Persona'}) · 模式：${getPersonaModeSpec(mode).label}`,
      '',
      '## 核心整理内容',
      cleanReply,
      '',
      ...(searchResp && searchResp.results.length > 0
        ? [
            '## DeepSearch 实时参考来源',
            ...searchResp.results.map(
              (r, i) => `${i + 1}. **${r.title}** (${r.source})\n   ${r.snippet}${r.url ? `\n   链接：${r.url}` : ''}`
            ),
          ]
        : []),
    ].join('\n'),
    sources: searchResp?.results,
  };
}

/**
 * 从兼容 OpenAI/xAI/DeepSeek 的上游接口完整缓冲拉取回复（避免生硬半截跳字，配合后端假流式匀速吐泡）
 */
async function fetchBufferedUpstreamLLM(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatTurnRequest['messages'],
  temperature: number
): Promise<{ rawOutput: string; reasoningContent: string; thoughtDurationMs: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey !== 'your-api-key') {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const reqStart = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-16).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      temperature,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok || !res.body) {
    throw new Error(`LLM stream status ${res.status}`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const json = await res.json();
    const messageObj = json.choices?.[0]?.message || {};
    const rawContent =
      typeof messageObj.content === 'string' ? messageObj.content : '';
    const reasoningContent =
      typeof messageObj.reasoning_content === 'string'
        ? messageObj.reasoning_content
        : '';
    return {
      rawOutput: rawContent,
      reasoningContent,
      thoughtDurationMs: Math.max(300, Date.now() - reqStart),
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawContent = '';
  let nativeReasoning = '';
  let thoughtStart = Date.now();
  let thoughtEnd = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payloadStr = trimmed.slice(5).trim();
      if (!payloadStr || payloadStr === '[DONE]') continue;

      try {
        const json = JSON.parse(payloadStr);
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          if (!nativeReasoning) thoughtStart = Date.now();
          nativeReasoning += delta.reasoning_content;
        }

        if (typeof delta.content === 'string' && delta.content) {
          rawContent += delta.content;
          if (rawContent.includes('</thought>') && !thoughtEnd) {
            thoughtEnd = Date.now();
          }
        }
      } catch {
        // Ignore partial JSON lines
      }
    }
  }

  const finalThoughtDuration = Math.max(
    300,
    (thoughtEnd || Date.now()) - thoughtStart
  );

  return {
    rawOutput: rawContent,
    reasoningContent: nativeReasoning,
    thoughtDurationMs: finalThoughtDuration,
  };
}

/**
 * 执行一次完整的 Grok + Persona 多阶段对话编排（支持真·逐字流式 SSE 透传与平滑离线兜底）
 */
export async function executeGrokChatTurn(
  req: ChatTurnRequest,
  onEvent?: (event: StreamEvent) => void
): Promise<ConversationMessage> {
  const channelPersona =
    (await storageRepo.getPersona(req.slug)) ||
    (await storageRepo.getPersona('grok-ella'))!;
  const mentionedResponder =
    req.mentionedSlug && req.mentionedSlug !== channelPersona.slug
      ? await storageRepo.getPersona(req.mentionedSlug)
      : null;
  const persona = mentionedResponder || channelPersona;
  const fromBotMeta = mentionedResponder
    ? (() => {
        const m = getMascotConfigForPersona(
          mentionedResponder.slug,
          mentionedResponder.profile
        );
        return {
          slug: mentionedResponder.slug,
          name: mentionedResponder.name,
          shape: m.shape,
          color: m.color,
        };
      })()
    : undefined;
  const settings = await storageRepo.getSettings();

  const activeMode: PersonaMode = req.mode || persona.defaultMode || 'authentic';
  const thinkEnabled = req.thinkMode ?? settings.defaultThinkMode ?? true;
  const lastUserMsgObj = req.messages[req.messages.length - 1] || {
    role: 'user' as const,
    content: '你好',
  };
  const lastUserText = lastUserMsgObj.content || '';
  const hasImage = Boolean(lastUserMsgObj.imageUrl);

  // Stage 1: DeepSearch
  let searchResp: DeepSearchResponse | null = null;
  const shouldSearch =
    Boolean(req.deepSearch) ||
    (req.deepSearch === undefined &&
      settings.defaultDeepSearch &&
      shouldAutoTriggerSearch(lastUserText));

  if (shouldSearch && lastUserText.trim()) {
    onEvent?.({
      type: 'search',
      status: 'searching',
      query: lastUserText.slice(0, 60),
      results: [],
    });
    searchResp = await performDeepSearch(lastUserText, settings);
    onEvent?.({
      type: 'search',
      status: 'done',
      query: searchResp.query,
      provider: searchResp.provider,
      results: searchResp.results,
    });
  }

  // Stage 2: Emotion Evolution
  const traits = inferPersonalityTraits(persona.personaMd);
  const engine = new EmotionEngine(traits);
  const evolved = engine.processEvent({
    type: 'message',
    content: lastUserText,
    sender: 'user',
    timestamp: new Date(),
  });

  const intimacyDelta =
    evolved.pleasure >= 0 ? (activeMode === 'companion' ? 2 : 1) : -1;
  const newIntimacy = Math.max(0, Math.min(100, persona.intimacy + intimacyDelta));

  const updatedEmotion: PersonaEmotionSnapshot = {
    primary: evolved.primary,
    pleasure: Number(evolved.pleasure.toFixed(2)),
    arousal: Number(evolved.arousal.toFixed(2)),
    dominance: Number(evolved.dominance.toFixed(2)),
    intensity: Number(evolved.intensity.toFixed(2)),
    moodLabel: persona.emotionState.moodLabel || `${evolved.primary}`,
    lastUpdated: new Date().toISOString(),
    decayRate: evolved.decayRate,
  };

  // Stage 3: Prompt Assembly & Streaming LLM Call
  const assembler = new PromptAssembler();
  const systemPrompt = assembler.assembleFromRecord(persona, {
    mode: activeMode,
    thinkMode: thinkEnabled,
    searchContext: searchResp,
    lastUserMessage: lastUserText,
    hasImageAttachment: hasImage,
    emotionSummary: {
      emotion: updatedEmotion.primary,
      intensity: updatedEmotion.intensity,
      attitude: engine.getEmotionDescription(),
      intimacy: newIntimacy,
    },
  });

  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const baseUrl = (
    settings.llmBaseUrl ||
    process.env.LLM_BASE_URL ||
    LOCAL_GATEWAY_BASE_URL
  ).replace(/\/$/, '');
  const model =
    req.modelId || settings.llmModel || process.env.LLM_MODEL || 'gpt-5.6';
  const imageModel = settings.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2.6';
  const isVitest = Boolean(process.env.VITEST);
  const canCallUpstream =
    (Boolean(apiKey) && apiKey !== 'your-api-key') ||
    (!isVitest && isLocalGatewayUrl(baseUrl));

  let rawModelOutput = '';
  let nativeReasoning = '';
  let thoughtDurationMs = 950;
  let isDemoMode = false;

  if (canCallUpstream) {
    onEvent?.({
      type: 'status',
      text: `${persona.name} 正在输入...`,
    });
    try {
      const endpoint = baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl}/chat/completions`;

      const temperature =
        activeMode === 'fun' ? 0.9 : activeMode === 'analytical' ? 0.5 : 0.78;

      const buffered = await fetchBufferedUpstreamLLM(
        endpoint,
        apiKey,
        model,
        systemPrompt,
        req.messages,
        temperature
      );

      rawModelOutput = buffered.rawOutput;
      nativeReasoning = buffered.reasoningContent;
      thoughtDurationMs = buffered.thoughtDurationMs;
      if (!rawModelOutput.trim()) {
        throw new Error('Empty model response');
      }
    } catch {
      isDemoMode = true;
      rawModelOutput = synthesizePersonaAwareFallback(
        persona,
        lastUserText,
        activeMode,
        searchResp,
        hasImage,
        Boolean(req.requestPhoto),
        req.messages.length
      );
    }
  } else {
    isDemoMode = true;
    rawModelOutput = synthesizePersonaAwareFallback(
      persona,
      lastUserText,
      activeMode,
      searchResp,
      hasImage,
      Boolean(req.requestPhoto),
      req.messages.length
    );
  }

  const parsed = parseStructuredModelOutput(
    rawModelOutput,
    nativeReasoning || ''
  );

  const sanitizedBursts = sanitizeGatewayRefusalLeaks(parsed.bursts);
  const segments = splitIntoNaturalMessages(sanitizedBursts);
  parsed.bursts = segments;
  parsed.cleanReply = segments.join('\n\n');

  if (parsed.mood) {
    updatedEmotion.moodLabel = parsed.mood;
  }

  const hasExplicitSticker =
    Boolean(req.requestSticker) ||
    /表情包|发个图|来个图|斗图|贴纸|sticker/i.test(lastUserText);
  const hasExplicitPhoto =
    Boolean(req.requestPhoto) ||
    /自拍|照片|随手拍|画一张|生成.*图|配张图/i.test(lastUserText);

  if (
    hasExplicitSticker &&
    !parsed.mediaCards.some((c) => c.type === 'sticker')
  ) {
    parsed.mediaCards.unshift({
      type: 'sticker',
      caption: buildContextualMediaCaption(
        'sticker',
        persona.name,
        lastUserText,
        parsed.cleanReply,
        parsed.mood
      ),
    });
  } else if (
    hasExplicitPhoto &&
    !parsed.mediaCards.some((c) => c.type === 'photo')
  ) {
    parsed.mediaCards.unshift({
      type: 'photo',
      caption: buildContextualMediaCaption(
        'photo',
        persona.name,
        lastUserText,
        parsed.cleanReply,
        parsed.mood
      ),
    });
  }

  // Filter auto-emitted visual cards according to user preferences unless explicitly requested
  parsed.mediaCards = parsed.mediaCards.filter((card) => {
    if (card.type === 'sticker' && !hasExplicitSticker) {
      return settings.enableAutoSticker !== false;
    }
    if (card.type === 'photo' && !hasExplicitPhoto) {
      return settings.enableAutoPhoto !== false;
    }
    return true;
  });

  const pageCard = buildPageCardIfRelevant(
    persona,
    lastUserText,
    searchResp,
    parsed.cleanReply,
    activeMode
  );

  // Mark first visual media card as 'generating' when upstream gateway is reachable;
  // frontend triggers non-blocking /api/media/generate immediately after text reply lands
  const firstVisualIdx = parsed.mediaCards.findIndex(
    (c) => (c.type === 'sticker' || c.type === 'photo') && !c.imageUrl
  );
  if (firstVisualIdx !== -1 && canCallUpstream) {
    parsed.mediaCards[firstVisualIdx] = {
      ...parsed.mediaCards[firstVisualIdx],
      status: 'generating',
      model: imageModel,
    };
  }

  const baseTs = Date.now();
  const modelLabel = isDemoMode ? '离线演示' : model;

  if (!onEvent) {
    const combinedMessage: ConversationMessage = {
      id: `msg_${baseTs}_ai`,
      role: 'assistant',
      content: parsed.cleanReply,
      timestamp: new Date(baseTs).toISOString(),
      thought: thinkEnabled && parsed.thought ? parsed.thought : undefined,
      thoughtDurationMs:
        thinkEnabled && parsed.thought ? thoughtDurationMs : undefined,
      searchQuery: searchResp?.query,
      searchResults: searchResp?.results,
      pageCard,
      fromBot: fromBotMeta,
      mode: activeMode,
      mood: updatedEmotion.moodLabel,
      intimacyChange: intimacyDelta,
      mediaCards: parsed.mediaCards.length > 0 ? parsed.mediaCards : undefined,
      bursts: segments,
      modelUsed: modelLabel,
      isDemoMode,
    };

    const userMessageRecord: ConversationMessage = {
      id: `msg_${baseTs}_user`,
      role: 'user',
      content: lastUserText,
      timestamp: lastUserMsgObj.timestamp || new Date(baseTs).toISOString(),
      imageUrl: lastUserMsgObj.imageUrl,
      mode: activeMode,
    };

    await storageRepo.updateEmotionAndIntimacy(persona.slug, updatedEmotion, newIntimacy);
    await storageRepo.appendMessages(channelPersona.slug, [
      userMessageRecord,
      combinedMessage,
    ]);
    void autoPersistTurnMemory(persona.slug, lastUserText, parsed.cleanReply).catch(
      () => {}
    );

    return combinedMessage;
  }

  const assistantMessages: ConversationMessage[] = segments.map((seg, i) => {
    const isFirst = i === 0;
    const isLast = i === segments.length - 1;
    return {
      id: `msg_${baseTs}_ai_${i}`,
      role: 'assistant',
      content: seg,
      timestamp: new Date(baseTs + i * 1000).toISOString(),
      thought:
        isFirst && thinkEnabled && parsed.thought ? parsed.thought : undefined,
      thoughtDurationMs:
        isFirst && thinkEnabled && parsed.thought ? thoughtDurationMs : undefined,
      searchQuery: isFirst ? searchResp?.query : undefined,
      searchResults: isFirst ? searchResp?.results : undefined,
      pageCard: isLast ? pageCard : undefined,
      fromBot: fromBotMeta,
      mode: activeMode,
      mood: isLast ? updatedEmotion.moodLabel : undefined,
      intimacyChange: isLast ? intimacyDelta : undefined,
      mediaCards:
        isLast && parsed.mediaCards.length > 0 ? parsed.mediaCards : undefined,
      bursts: [seg],
      modelUsed: isLast ? modelLabel : undefined,
      isDemoMode: isLast ? isDemoMode : undefined,
    };
  });

  // Smooth paced simulated streaming ("假流式": buffer complete response first, then type out and emit multi-messages sequentially)
  const startTs = Date.now();
  if (thinkEnabled && parsed.thought) {
    const stepSize = Math.max(8, Math.ceil(parsed.thought.length / 5));
    let acc = '';
    for (let i = 0; i < parsed.thought.length; i += stepSize) {
      const delta = parsed.thought.slice(i, i + stepSize);
      acc += delta;
      onEvent({
        type: 'thought',
        delta,
        fullThought: acc,
        durationMs: Math.max(400, Date.now() - startTs + i * 12),
      });
      await sleepForSimulatedStream(18);
    }
    thoughtDurationMs = Math.max(500, parsed.thought.length * 16);
  }

  onEvent({
    type: 'emotion',
    emotionState: updatedEmotion,
    intimacy: newIntimacy,
    intimacyChange: intimacyDelta,
  });

  for (let i = 0; i < segments.length; i += 1) {
    const targetSegment = segments[i];
    const isLast = i === segments.length - 1;

    if (i === 0) {
      await sleepForSimulatedStream(
        computeRealisticTypingDelayMs(targetSegment, 0)
      );
    } else {
      onEvent({
        type: 'status',
        text: `${persona.name} 正在输入...`,
      });
      await sleepForSimulatedStream(
        computeRealisticTypingDelayMs(targetSegment, i)
      );
    }

    const step = Math.max(4, Math.ceil(targetSegment.length / 10));
    for (let pos = step; pos < targetSegment.length + step; pos += step) {
      const partial = targetSegment.slice(0, pos);
      onEvent({
        type: 'reply',
        delta: partial,
        fullReply: partial,
        bursts: [partial],
        mediaCards: isLast ? parsed.mediaCards : [],
        isDemoMode,
      });
      await sleepForSimulatedStream(24);
    }

    onEvent({
      type: 'message_part',
      message: assistantMessages[i],
      index: i,
      total: segments.length,
      hasMore: !isLast,
    });
  }

  const finalAssistantMessage =
    assistantMessages[assistantMessages.length - 1];

  const userMessageRecord: ConversationMessage = {
    id: `msg_${baseTs}_user`,
    role: 'user',
    content: lastUserText,
    timestamp: lastUserMsgObj.timestamp || new Date(baseTs).toISOString(),
    imageUrl: lastUserMsgObj.imageUrl,
    mode: activeMode,
  };

  await storageRepo.updateEmotionAndIntimacy(persona.slug, updatedEmotion, newIntimacy);
  await storageRepo.appendMessages(channelPersona.slug, [
    userMessageRecord,
    ...assistantMessages,
  ]);
  void autoPersistTurnMemory(persona.slug, lastUserText, parsed.cleanReply).catch(
    () => {}
  );

  const pendingFollowup: PendingFollowup | undefined = parsed.followup
    ? {
        delaySec: parsed.followup.delaySec,
        content: parsed.followup.content,
        fromBot: fromBotMeta,
      }
    : undefined;

  onEvent({
    type: 'done',
    message: finalAssistantMessage,
    messages: assistantMessages,
    followup: pendingFollowup,
  });

  return {
    ...finalAssistantMessage,
    content: parsed.cleanReply,
    bursts: segments,
    thought: assistantMessages[0]?.thought,
    thoughtDurationMs: assistantMessages[0]?.thoughtDurationMs,
    searchQuery: assistantMessages[0]?.searchQuery,
    searchResults: assistantMessages[0]?.searchResults,
  };
}
