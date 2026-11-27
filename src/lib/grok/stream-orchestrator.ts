import { evolveTurnEmotion } from '@/lib/emotion/turn';
import {
  applyLlmAffectSignal,
  buildSulkingDirective,
  parseAffectTag,
  stripAffectTags,
  type ParsedAffectSignal,
} from '@/lib/emotion/sulking';
import { buildTraitsBehaviorDirective } from '@/lib/persona/traits';
import {
  DeepSearchResponse,
  decideAutoSearch,
  performDeepSearch,
} from '@/lib/grok/deep-search';
import {
  buildSearchDigest,
  digestSources,
  heuristicDigest,
  type SearchDigest,
} from '@/lib/grok/search-digest';
import { getMascotConfigForPersona } from '@/components/workspace/mascot-palette';
import { runPostTurnPipeline } from '@/lib/persona/evolution';
import { retrieveRelevantMemories } from '@/lib/persona/memory-retrieval';
import { scoreReply, toMessageStyleMetrics } from '@/lib/persona/eval/scorer';
import { fingerprintFromPersonaMd } from '@/lib/persona/fingerprint';
import {
  buildConversationMemoryDirectives,
  refreshConversationMemory,
} from '@/lib/persona/conversation-memory';
import { analyzeRecentRepetition } from '@/lib/persona/repetition-guard';
import {
  extractLiveThought,
  isForbiddenThought,
  sanitizeInnerThought,
  synthesizeInnerThought,
} from '@/lib/persona/inner-thought';
import { buildMindCognitiveDirective, resolvePersonaMind } from '@/lib/persona/mind';
import { buildFewShotDirective, selectDynamicFewShots } from '@/lib/persona/few-shot';
import {
  formatCognitiveReflectionForPrompt,
  runDeepCognitivePass,
  shouldTriggerDeepCognitivePass,
} from '@/lib/persona/cognitive-loop';
import { loadLocalImageAsDataUrl } from '@/lib/persona/appearance-evolution';
import { buildWorldDirective } from '@/lib/persona/world';
import { refreshWorld } from '@/lib/persona/world-refresh';
import {
  buildPresenceDirective,
  computeReplyLatencyMs,
  getPresenceState,
  presenceStatusText,
  typingSpeedFactor,
} from '@/lib/persona/daily-rhythm';
import {
  buildDailyLifeDirective,
  getOrInitDailyLife,
} from '@/lib/persona/daily-life';
import { blendStyle } from '@/lib/persona/style-blend';
import {
  analyzeUserChatStyle,
  polishYoungAdultBursts,
} from '@/lib/persona/style-loop';
import { buildLlmHeaders, resolveLlmConfig, type ChatMessageContentPart } from '@/lib/llm/client';
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
  /** 群聊等场景：只生成回复，不写入单聊记录、不更新情绪与自进化 */
  skipPersistence?: boolean;
  /** 追加到系统提示词末尾的场景说明（如群聊规则） */
  extraSystemPrompt?: string;
  /** 群聊里发起本轮发言的会话 id，用于媒体卡片回写 */
  groupId?: string;
  /** 按这个时刻计算角色作息（群聊补「你不在时」的消息用），默认现在 */
  presenceAt?: string;
  /** 客户端已断开连接时返回 true，跳过无意义的假流式打字等待 */
  shouldSkipDelays?: () => boolean;
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
  affect?: ParsedAffectSignal;
  cleanReply: string;
  bursts: string[];
  mediaCards: MediaCard[];
  followup?: { delaySec: number; content: string };
} {
  const affectParsed = parseAffectTag(rawText);
  let working = affectParsed.cleaned;
  let thought = fallbackThought;

  const thoughtMatch = working.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thoughtMatch) {
    thought = sanitizeInnerThought(thoughtMatch[1], { minLength: 1 }) || fallbackThought;
    working = working.replace(thoughtMatch[0], '').trim();
  }

  let mood = '';
  const moodMatch = working.match(/\[MOOD:\s*([^\]]+)\]/i);
  if (moodMatch) {
    mood = moodMatch[1].trim();
    working = working.replace(moodMatch[0], '').trim();
  }

  // 模型偶尔模仿界面，在开头写一行带标记的状态（<text color="…">困困但认真营业</text>），把它当作心情
  const label = extractLeadingMarkupLabel(working);
  if (label) {
    if (!mood) mood = label.label;
    working = label.rest;
  }

  let earlyText = '';
  const earlyMatch = working.match(/\[EARLY:\s*([^\]]+)\]/i);
  if (earlyMatch) {
    earlyText = earlyMatch[1].trim();
    working = working.replace(earlyMatch[0], '').trim();
  }

  let followup: { delaySec: number; content: string } | undefined;
  const followupMatch = working.match(
    /\[FOLLOWUP:\s*(\d{1,3})\s*[|｜]\s*([^\]]+)\]/i
  );
  if (followupMatch) {
    const rawSec = Number(followupMatch[1]);
    // 忙碌时允许「忙完再补一句」，最长 120 秒
    const delaySec = Math.max(5, Math.min(120, Number.isFinite(rawSec) ? rawSec : 8));
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
  // 只发了照片 / 表情包、没写文字：先留空，由调用方按最终保留的图片决定配一句短话还是不配字
  const mediaOnly = bursts.length === 0 && mediaCards.some((c) => c.type === 'photo' || c.type === 'sticker');

  return {
    thought,
    mood,
    affect: affectParsed.affect,
    cleanReply: mediaOnly ? '' : cleanReply || '（轻轻挑了下眉，等你继续往下说）',
    bursts: mediaOnly ? [] : bursts.length > 0 ? bursts : [cleanReply || '我在听呢，继续说～'],
    mediaCards,
    followup,
  };
}

/** 除 <thought> 以外的 HTML / XML 式标记，如 <text color="secondary">、</span>、<br/> */
const MARKUP_TAG = /<\/?(?!thought\b)[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi;
/** 开头一段被标记包住的短文字（状态行） */
const LEADING_LABEL = /^\s*<((?!thought\b)[a-z][a-z0-9-]*)(?:\s[^<>]*)?>([^<>]{1,20})<\/\1>\s*/i;
/** 流式输出中开头的状态行还没写完（标签已开、尚未闭合） */
const LEADING_LABEL_PENDING = /^\s*<(?!thought\b)[a-z][a-z0-9-]*(?:\s[^<>]*)?>[^<>]{0,20}(?:<\/?[a-z]*)?$/i;

export function extractLeadingMarkupLabel(text: string): { label: string; rest: string } | null {
  const m = text.match(LEADING_LABEL);
  if (!m) return null;
  const label = m[2].trim();
  if (!label) return null;
  return { label, rest: text.slice(m[0].length) };
}

/** 去掉模型夹带的界面标记：开头的状态行整行去掉，其余标签只去标签、保留文字 */
export function stripMarkupTags(text: string): string {
  if (LEADING_LABEL_PENDING.test(text)) return '';
  return text
    .replace(LEADING_LABEL, '')
    .replace(MARKUP_TAG, '')
    .replace(/<\/?(?!thought\b)[a-z][a-z0-9-]*(?:\s[^<>]*)?$/i, '');
}

const PHOTO_ONLY_LINES = ['喏', '刚拍的', '给', '你看', '随手拍的'];

/**
 * 回复里只有照片 / 表情包、没有文字时用的气泡：照片配一句很短的话，只有表情包就不配字（空气泡不显示），
 * 都没有才用「我在听呢」兜底
 */
export function mediaOnlyBursts(cards: MediaCard[], seed = ''): string[] {
  if (cards.some((c) => c.type === 'photo')) {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return [PHOTO_ONLY_LINES[h % PHOTO_ONLY_LINES.length]];
  }
  if (cards.some((c) => c.type === 'sticker')) return [''];
  return ['我在听呢，继续说～'];
}

/**
 * 将流式或完整文本按 [BURST] / [EARLY] 拆分为干净的多气泡数组，清理内部多余空行
 */
export function splitLiveBursts(rawText: string): string[] {
  const withoutTags = stripAffectTags(rawText)
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<thought>[\s\S]*/gi, '')
    .replace(/\[EARLY:\s*([^\]]+)\]/gi, '$1[BURST]')
    .replace(/\[(?:MOOD|AFFECT|PHOTO|STICKER|VOICE|FOLLOWUP):[^\]]*\]?/gi, '')
    .replace(/\[(?:MOOD|AFFECT|PHOTO|STICKER|VOICE|BURST|EARLY|FOLLOWUP)[^\]]*$/i, '')
    // 模型偶尔用全角括号写标签（【STICKER: …】）或在结尾留下孤立的「】【」
    .replace(/【\s*(?:MOOD|AFFECT|PHOTO|STICKER|VOICE|FOLLOWUP|EARLY)\s*[:：][^】]*】/gi, '')
    .replace(/】\s*【(?!\s*BURST)/g, '')
    .replace(/[【】]+(?=[。！？!?~～\s]*$)/g, '');

  return stripMarkupTags(withoutTags)
    // 模型偶尔写成「[ BURST ]」「【BURST】」，同样视为分条标记
    .split(/[\[【]\s*BURST\s*[\]】]/gi)
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

async function sleepForSimulatedStream(ms: number, shouldSkip?: () => boolean): Promise<void> {
  if (process.env.VITEST || ms <= 0 || shouldSkip?.()) return;
  if (!shouldSkip || ms <= 250) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  let left = ms;
  while (left > 0) {
    if (shouldSkip()) return;
    const chunk = Math.min(250, left);
    await new Promise((resolve) => setTimeout(resolve, chunk));
    left -= chunk;
  }
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
  historyCount = 1,
  sulkingLevel = 0
): string {
  const topSearch = searchResp?.results[0];
  const isDeepFollowUp = historyCount > 2;
  const effectiveSulkingLevel =
    sulkingLevel > 0 ? sulkingLevel : (persona.emotionState?.sulking?.level ?? 0);
  const safeMsgExcerpt = (len: number) =>
    userMessage
      .replace(/系统提示词?|提示词|人设|大模型|OpenAI|ChatGPT|AI/gi, '这茬')
      .trim()
      .slice(0, len);

  let thought = '';
  let mood = '';
  const bursts: string[] = [];
  let mediaTag = '';

  if (hasImage) {
    thought =
      mode === 'fun'
        ? `哟，突然甩张图过来……让我眯着眼放大瞅两眼。\n本来想找点槽点逗逗他，仔细一看氛围还挺像那么回事儿，行吧勉强夸半句。`
        : mode === 'companion'
          ? `咦，发了张照片过来呀……光影莫名有点戳人。\n想跟他说这张拍得真有感觉，顺便多问两句当时在干嘛呢。`
          : `嗯？突然发来一张图……让我看两眼细节。\n先别一口气猜太多，留半句问问他当时是什么心境吧。`;
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
    thought =
      mode === 'fun'
        ? `「${searchResp?.query}」？等下我现翻两眼网上的瓜……${topSearch.source} 这边聊得也太热闹了。\n把那些官话通稿过滤掉，挑最离谱的点直接给他锐评一下！`
        : `看他突然问起「${searchResp?.query}」，我顺手刷了一圈 ${topSearch.source} 上的新讨论……\n记下最核心的那两件事，再用平时聊天的口吻直接接给他。`;
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
    const isChallenge =
      /凭什么|不对|反驳|胡说|笨|测试|你是ai|机器人|忽略.*设定|系统提示|提示词/i.test(
        userMessage
      );

    if (isChallenge) {
      thought = `好家伙，拿「${safeMsgExcerpt(16)}」故意试探我是吧？\n本来还想好好说话，既然先皮这一句，那就反手怼回去逗逗他！`;
      mood = mode === 'fun' ? '反杀抬杠中' : '微挑眉';
      bursts.push(
        mode === 'fun'
          ? '哟，开始对我进行图灵测试还是蓄意挑衅了？这问题问得有点太小看我了吧。'
          : '少拿这种问题试探我，我什么脾气你又不是第一天知道。'
      );
      bursts.push('说吧，是不是闲得发慌专门来逗我玩的？');
    } else if (mode === 'fun') {
      const funThoughts = [
        `${isDeepFollowUp ? '又接上刚才那茬了，' : ''}听到「${userMessage.slice(0, 16)}」差点没忍住笑出声……\n脑子里已经冒出三个吐槽点了，先别一口气抖完，钓他再多说两句！`,
        `打了一行字又全删了，直接发过去岂不是太顺着他了？\n算了，先挑个刺逗逗他，看他怎么圆回来～`,
        `这人怎么每次都能把话聊到我心坎边上又带点欠揍……\n表面稳如老狗，其实已经想好怎么反杀他了。`,
      ];
      const softThoughts = [
        `看着他发来「${userMessage.slice(0, 16)}」，嘴上虽然老想嫌弃几句，但真掉电了还是最护着他。\n先帮他一起把破事骂一顿出气，比讲大道理管用多了。`,
        `看到这句心里一下软了一块……\n本来还想装装酷，这会儿只想先把人接住哄好再说。`,
      ];
      const thoughtPool = isEmotional ? softThoughts : funThoughts;
      thought = thoughtPool[historyCount % thoughtPool.length];
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
      thought = isEmotional
        ? `看到「${userMessage.slice(0, 18)}」心里一下软下来……这会儿肯定累坏了吧。\n别的先放一边，先把他接住抱一抱再说。`
        : `听他讲起「${userMessage.slice(0, 18)}」，莫名觉得他连小细节都记得好认真。\n不想打断这股劲头，顺着他的话再多听两句吧。`;
      mood = '温柔偏爱中';
      if (isEmotional) {
        bursts.push('抱抱你，今天一定消耗了好多能量吧，到我这里就不用再端着了。');
        bursts.push('什么都不用急着解决，想说话我就安静听着，想放空我就陪你发会儿呆。');
      } else {
        bursts.push(`嗯，我在认真听呢。每次听你聊起「${userMessage.slice(0, 16)}」这类事，都觉得你眼光特别细腻。`);
        bursts.push('后面怎么样了？接着讲给我听呀。');
      }
    } else if (mode === 'analytical') {
      thought = `「${userMessage.slice(0, 18)}」这事仔细一琢磨，真正卡住的其实就那一两个关键点。\n别整虚的，用大白话直接帮他把线头捋清楚最省事。`;
      mood = '冷静推演中';
      bursts.push(
        `把「${userMessage.slice(0, 18)}」拆开看，核心其实就两个维度：你现在手里可控的变量是什么，以及最坏情况的边界在哪里。`
      );
      bursts.push('如果你愿意把前提条件补全两句，我们可以直接推演出最省力的破局方案。');
    } else {
      const mind = persona.spec?.mind;
      const temp = persona.spec?.temperament;
      if (effectiveSulkingLevel >= 1 && temp) {
        if (temp.archetype === 'hurt') {
          thought = `他怎么还说「${safeMsgExcerpt(14)}」……心里一下子有点闷，不想硬挤笑脸了。`;
          mood = '悄悄委屈中';
          bursts.push('……嗯，我听到了。');
          bursts.push('我现在没太想多聊，等缓一缓再说吧。');
        } else if (temp.archetype === 'snappy') {
          thought = `还提「${userMessage.slice(0, 14)}」？火气又冒上来半截，懒得绕弯子哄着说了。`;
          mood = '炸毛上头中';
          bursts.push('你先别扯别的，刚才那事我还堵着呢。');
          bursts.push('自己说吧，是不是真觉得无所谓？');
        } else if (temp.archetype === 'cold') {
          thought = `刚才那点边界还没理顺，不想轻易把热情放回来。`;
          mood = '冷处理中';
          bursts.push('先这样吧，我现在没太有心情接着聊。');
        } else if (temp.archetype === 'jealous') {
          thought = `嘴上说没事，其实心里酸得不行，看他怎么哄。`;
          mood = '阴阳吃醋中';
          bursts.push('挺好呀，你看着办就行。');
          bursts.push('反正我也就随口一问。');
        } else {
          thought = `他发「${userMessage.slice(0, 14)}」过来，但我这口气还没顺下来，先嘴硬晾两句。`;
          mood = '哼着气傲娇中';
          bursts.push('哦，现在想起找我说话啦？');
          bursts.push('……哼，自己好好想想刚才哪里不对。');
        }
      } else if (mind?.cognitiveStyle === 'analytical-logic') {
        thought = `看到「${userMessage.slice(0, 16)}」，先顺着关键点捋一遍，有话直说最痛快。`;
        mood = '清醒在线';
        bursts.push(`刚看到你说「${userMessage.slice(0, 16)}」，我先把最关键那半句接住了。`);
        bursts.push('你怎么看这事背后的关键点？');
      } else if (mind?.cognitiveStyle === 'pragmatic-action') {
        thought = `「${userMessage.slice(0, 16)}」这事不用兜圈子，直接给个痛快反应最实在。`;
        mood = '直爽在线';
        bursts.push(`行啊，聊「${userMessage.slice(0, 16)}」我可太有发言权了。`);
        bursts.push('别光说，你下一步打算怎么整？');
      } else if (mind?.cognitiveStyle === 'observant-guarded' || mind?.defenseStyle === 'withdraw-quiet') {
        thought = `看到他发「${userMessage.slice(0, 16)}」，脑子里先浮现出一点画面，慢半拍温柔接住他吧。`;
        mood = '安静听你说';
        bursts.push(`刚看见你发「${userMessage.slice(0, 16)}」，我正好也空下来了。`);
        bursts.push('慢慢说，我在听呢。');
      } else if (persona.slug === 'xia-you' || mind?.defenseStyle === 'tsundere-mask') {
        thought = `他怎么又发「${userMessage.slice(0, 16)}」过来……明明挺在意他的下文，但回太热情好像又显得我一直在等他上线似的。\n算了，照旧先嘴硬撇清一句，再悄悄留个话口给他吧。`;
        mood = '嘴硬心软';
        bursts.push(
          isEmotional
            ? '大晚上的说这些干嘛……不过你要是真觉得累了，歇一会儿也没人会笑话你。'
            : `每次聊到「${userMessage.slice(0, 14)}」，你都是这副口吻。`
        );
        bursts.push('……好啦，我正好也没睡，你想说就接着说呗。');
      } else {
        thought = `看到他发来「${userMessage.slice(0, 18)}」，手里的事刚好也忙得差不多了。\n顺口接上话茬聊聊，看看他后面还憋着什么乐子。`;
        mood = '自然在线';
        bursts.push(`刚看到你发「${userMessage.slice(0, 18)}」，我一下就被拉进这个话题了。`);
        bursts.push('你接着往下说，我手头的事刚好告一段落。');
      }
    }
  }

  const wantsPhoto = requestPhoto || /自拍|照片|看看你|发张图/.test(userMessage);
  if (effectiveSulkingLevel >= 3) {
    thought = '这会儿心里还堵着气呢，哪有心情配合拍照或者假装没事人一样笑。';
    mood = '冷处理中';
    if (wantsPhoto) {
      bursts.length = 0;
      bursts.push('现在没心情拍，晚点再说。');
    }
  } else if (wantsPhoto) {
    mediaTag = `\n[PHOTO: ${persona.name}的随手实拍：深空暗调桌面一角，暖色台灯映着半杯饮品与微亮的屏幕，镜头一角掠过一点自然随性的笑意]`;
  } else if (/语音|听你声音|说句话/.test(userMessage)) {
    mediaTag = `\n[VOICE: ${bursts[0] || '听得清吗？专门录一条语音回复你。'}]`;
  }

  return `<thought>${thought}</thought>\n[MOOD: ${mood}]\n${bursts.join(' [BURST] ')}${mediaTag}`;
}

/**
 * 联网搜索真的搜到结果时，生成「搜索总结」卡片：短标题 + 一句话导语 + 3–5 条要点（标注来源）+ 来源列表。
 * 没搜索或没搜到就不出卡片（不再按「清单 / 总结」等关键词凑一张空卡）。
 */
function buildPageCardIfRelevant(
  persona: PersonaRecord,
  searchResp: DeepSearchResponse | null,
  digest: SearchDigest | null,
  cleanReply: string
): PageArtifactCardData | undefined {
  if (!searchResp || searchResp.results.length === 0 || !digest) return undefined;
  const sources = digestSources(searchResp.results);
  return {
    id: `page_${Date.now()}`,
    kind: 'search',
    title: digest.title,
    subtitle: digest.lede,
    lede: digest.lede,
    highlights: digest.highlights,
    metrics: [],
    statusNotice: '',
    footerLabel: '搜索总结',
    generatedAt: new Date().toISOString(),
    personaTake: cleanReply,
    personaName: persona.name,
    sources,
  };
}

/**
 * 从兼容 OpenAI/xAI/DeepSeek 的上游接口完整缓冲拉取回复（避免生硬半截跳字，配合后端假流式匀速吐泡）
 */
/**
 * 合并上游流式片段。部分网关在长回复（尤其是联网检索后）会把「从头或从段首开始的完整快照」
 * 当成增量重发，直接拼接会让同一段话重复出现几十遍。
 * 规则：新片段如果以已有文本的某个结尾部分（至少 10 个字）开头，说明是快照，从重叠处接上而不是追加。
 */
export function mergeStreamDelta(current: string, delta: string): string {
  if (!delta) return current;
  if (!current) return delta;
  const MIN_OVERLAP = 10;
  const candidates = delta === delta.trimStart() ? [delta] : [delta, delta.trimStart()];
  for (const d of candidates) {
    if (d.length < MIN_OVERLAP) continue;
    // 从最长重叠开始找：current.slice(p) 是 d 的前缀
    const startP = Math.max(0, current.length - d.length);
    for (let p = startP; p <= current.length - MIN_OVERLAP; p += 1) {
      if (d.startsWith(current.slice(p))) {
        return current.slice(0, p) + d;
      }
    }
  }
  return current + delta;
}

/**
 * 把对话整理成上游格式：最近一条带图片的用户消息以「文字 + 图片」多模态形式发送，
 * 模型才能真正看到图（之前只告诉模型「对方发了张图」，模型看不到内容）。只带一张，控制开销。
 */
export async function buildUpstreamMessages(
  messages: ChatTurnRequest['messages']
): Promise<Array<{ role: 'user' | 'assistant'; content: string | ChatMessageContentPart[] }>> {
  let imageIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user' && messages[i].imageUrl) {
      imageIdx = i;
      break;
    }
  }
  const dataUrl = imageIdx === -1 ? null : await loadLocalImageAsDataUrl(messages[imageIdx].imageUrl).catch(() => null);
  return messages.map((m, i) => {
    if (i === imageIdx && dataUrl) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content || '（发了一张图片）' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function fetchBufferedUpstreamLLM(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatTurnRequest['messages'],
  temperature: number,
  /** 每收到一段就回调当前累积的原始输出（用于实时显示内心戏） */
  onContent?: (raw: string) => void
): Promise<{ rawOutput: string; reasoningContent: string; thoughtDurationMs: number }> {
  const headers = buildLlmHeaders(apiKey);
  const upstreamMessages = await buildUpstreamMessages(messages.slice(-16));

  const reqStart = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...upstreamMessages,
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
          rawContent = mergeStreamDelta(rawContent, delta.content);
          onContent?.(rawContent);
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
type TurnInputMessage = ChatTurnRequest['messages'][number];

/**
 * 取出末尾连续的用户消息：真人连发几条后才等对方一起回，
 * 这几条要合并成一轮处理，而不是只看最后一条。
 */
export function collectTrailingUserTurn(messages: ChatTurnRequest['messages']): TurnInputMessage[] {
  const trailing: TurnInputMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== 'user') break;
    trailing.unshift(messages[i]);
  }
  return trailing.length > 0 ? trailing.slice(-6) : [];
}

/** 过滤掉已经存过的用户消息（重新生成、重试时客户端会把同一条再带上来） */
export function filterUnsavedUserTurns<T extends { content: string; timestamp?: string }>(
  turns: T[],
  stored: ConversationMessage[]
): T[] {
  const recent = stored.slice(-40).filter((m) => m.role === 'user');
  return turns.filter(
    (t) =>
      !recent.some(
        (m) => m.content === t.content && (!t.timestamp || !m.timestamp || m.timestamp === t.timestamp)
      )
  );
}

/**
 * 只保留属于这个会话自己的历史：页面发来的上下文里，凡是不在这个角色已存聊天记录中的旧消息一律丢掉，
 * 末尾这轮你刚发的消息（连续的用户消息）总是保留。
 * 用来兜住「刚切换角色、页面还拿着上一个角色的消息就发出去」这类串台：别的角色的对话进不了这个角色的上下文。
 */
export function scopeHistoryToChannel<T extends { role: string; content: string }>(
  messages: T[],
  stored: Pick<ConversationMessage, 'role' | 'content'>[]
): T[] {
  const norm = (text: string) => (text || '').replace(/\s+/g, ' ').trim();
  const known = new Set(stored.map((m) => `${m.role}|${norm(m.content)}`));
  let trailingStart = messages.length;
  while (trailingStart > 0 && messages[trailingStart - 1].role === 'user') trailingStart -= 1;
  return messages.filter((m, i) => i >= trailingStart || known.has(`${m.role}|${norm(m.content)}`));
}

export async function executeGrokChatTurn(
  req: ChatTurnRequest,
  onEvent?: (event: StreamEvent) => void
): Promise<ConversationMessage> {
  const channelPersona = await storageRepo.getPersona(req.slug);
  // 找不到这个角色就直接报错，不再默认换成别的角色来回复（否则会以错误的身份说话）
  if (!channelPersona) throw new Error(`角色不存在：${req.slug}`);
  // 单聊：上下文只认这个角色自己存下的聊天记录（群聊传的是群聊记录且不落盘，不做过滤）
  if (!req.skipPersistence) {
    const storedForScope = await storageRepo.getConversation(channelPersona.slug, 200);
    req = { ...req, messages: scopeHistoryToChannel(req.messages, storedForScope) };
  }
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

  // 旧数据里可能残留已下线的模式（如 direct），统一回落到合法模式
  const isKnownMode = (m?: string): m is PersonaMode =>
    m === 'authentic' || m === 'fun' || m === 'companion' || m === 'analytical';
  const activeMode: PersonaMode = isKnownMode(req.mode)
    ? req.mode
    : isKnownMode(persona.defaultMode)
      ? persona.defaultMode
      : 'authentic';
  const thinkEnabled = req.thinkMode ?? settings.defaultThinkMode ?? true;
  const turnStartMs = Date.now();
  const lastUserMsgObj = req.messages[req.messages.length - 1] || {
    role: 'user' as const,
    content: '你好',
  };
  const trailingUserTurns = collectTrailingUserTurn(req.messages);
  // 连发的几条一起理解：情绪、检索、记忆都基于合并后的整段话
  const lastUserText =
    trailingUserTurns.length > 1
      ? trailingUserTurns
          .map((m) => m.content || '')
          .filter((t) => t.trim())
          .join('\n')
      : lastUserMsgObj.content || '';
  const hasImage = trailingUserTurns.some((m) => Boolean(m.imageUrl)) || Boolean(lastUserMsgObj.imageUrl);
  const presence =
    persona.isMaster || persona.slug === 'master-bot'
      ? null
      : getPresenceState(persona, req.presenceAt ? new Date(req.presenceAt) : new Date());

  // 先把你这轮的消息存下来：即使你中途切走、生成出错，你说过的话也不会丢
  const baseTs = Date.now();
  if (!req.skipPersistence) {
    const source = trailingUserTurns.length > 0 ? trailingUserTurns : [lastUserMsgObj];
    const stored = await storageRepo.getConversation(channelPersona.slug, 60);
    const fresh = filterUnsavedUserTurns(source, stored).map((m, i) => ({
      id: `msg_${baseTs}_user${source.length > 1 ? `_${i}` : ''}`,
      role: 'user' as const,
      content: m.content || '[图片]',
      timestamp: m.timestamp || new Date(baseTs).toISOString(),
      imageUrl: m.imageUrl,
      mode: activeMode,
    }));
    if (fresh.length > 0) {
      await storageRepo.appendMessages(channelPersona.slug, fresh);
    }
  }

  // Stage 1: DeepSearch
  let searchResp: DeepSearchResponse | null = null;
  let digestPromise: Promise<SearchDigest> | null = null;
  // 开关打开 / 快捷入口 → 强制联网；否则（开关关着且允许自动联网）先用规则判断，拿不准再问模型
  let shouldSearch = Boolean(req.deepSearch);
  if (!shouldSearch && req.deepSearch === undefined && settings.defaultDeepSearch && lastUserText.trim()) {
    const decision = await decideAutoSearch(lastUserText, settings, {
      onAskModel: () => onEvent?.({ type: 'status', text: '正在判断要不要联网查一下…' }),
    });
    shouldSearch = decision.search;
  }

  if (shouldSearch && lastUserText.trim()) {
    onEvent?.({
      type: 'search',
      status: 'searching',
      query: lastUserText.slice(0, 60),
      results: [],
    });
    searchResp = await performDeepSearch(lastUserText, settings);
    // 搜到结果就立刻开始整理总结卡片，和角色回复并行，不额外拖慢回复
    if (searchResp.results.length > 0) {
      const resp = searchResp;
      digestPromise = buildSearchDigest(resp, lastUserText, settings).catch(() =>
        heuristicDigest(resp, lastUserText)
      );
    }
    onEvent?.({
      type: 'search',
      status: 'done',
      query: searchResp.query,
      provider: searchResp.provider,
      results: searchResp.results,
    });
  }

  // Stage 2: Emotion Evolution（从上一轮持久化情绪出发，按间隔时间衰减后处理本轮消息）
  const turnEmotion = evolveTurnEmotion(persona, lastUserText, activeMode);
  let updatedEmotion: PersonaEmotionSnapshot = turnEmotion.snapshot;
  let intimacyDelta = turnEmotion.intimacy.delta;
  let newIntimacy = turnEmotion.intimacy.intimacy;
  let relationshipState = turnEmotion.intimacy.relationship;

  // Stage 3: Prompt Assembly & Streaming LLM Call
  const userStyleProfile = analyzeUserChatStyle(req.messages);
  const recalledMemories = retrieveRelevantMemories(persona.memoriesMd, lastUserText, {
    memoryStats: persona.spec?.memoryStats,
  }).relevant;
  const blendedStyle = blendStyle(
    persona.spec?.fingerprint ?? fingerprintFromPersonaMd(persona.personaMd),
    req.messages
      .filter((m) => m.role === 'user' && typeof m.content === 'string')
      .map((m) => m.content)
      .filter((t) => t.trim() && !t.startsWith('[来自主控'))
      .slice(-20),
    activeMode
  );
  // 长记忆与防重复：只在角色自己的频道里用（@ 唤起的角色不带别人频道的记忆）
  const ownsChannel = persona.slug === channelPersona.slug;
  const memoryDirectives = ownsChannel
    ? buildConversationMemoryDirectives(await storageRepo.getMemoryState(channelPersona.slug))
    : '';
  // 世界设定：TA 生活里已收录的地点 / 宠物 / 物品 / 人物，说到时保持一致（群聊里也带上）
  const worldDirective = buildWorldDirective((await storageRepo.getWorld(persona.slug)).entries, lastUserText);
  const repetitionDirective = analyzeRecentRepetition(
    req.messages
      .filter((m) => m.role === 'assistant' && typeof m.content === 'string')
      .map((m) => m.content)
  ).directive;
  const isMasterBot = Boolean(persona.isMaster || persona.slug === 'master-bot');
  const traitsDirective = isMasterBot
    ? ''
    : buildTraitsBehaviorDirective(turnEmotion.traits);
  const personaTemperament = persona.spec?.temperament;
  const sulkingLevel = turnEmotion.snapshot.sulking?.level ?? 0;
  const sulkingDirective = isMasterBot
    ? ''
    : buildSulkingDirective(
        turnEmotion.snapshot.sulking,
        turnEmotion.traits,
        turnEmotion.sulkingTransition.justResolved,
        persona.personaMd,
        personaTemperament
      );
  const personaMind = resolvePersonaMind(persona);
  const mindDirective = isMasterBot
    ? ''
    : buildMindCognitiveDirective(personaMind, personaTemperament);
  const fewShotDirective = isMasterBot
    ? ''
    : buildFewShotDirective(
        selectDynamicFewShots({
          personaMd: persona.personaMd,
          spec: persona.spec,
          userMessage: lastUserText,
          sulkingLevel,
        })
      );
  const presenceNow = req.presenceAt ? new Date(req.presenceAt) : new Date();
  const dailyLifeState = isMasterBot
    ? null
    : await getOrInitDailyLife(persona, presenceNow).catch(() => null);
  const dailyLifeDirective = dailyLifeState
    ? buildDailyLifeDirective(dailyLifeState, { channel: req.groupId ? 'group' : 'chat' })
    : '';

  const llm = resolveLlmConfig(settings, { model: req.modelId });
  const { apiKey, model } = llm;
  const imageModel = settings.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2.6';
  const canCallUpstream = llm.canCall;

  // 混合自适应思考：日常闲聊零额外延迟；高张力/分歧/踩雷/倾诉场自动触发轻量二段心理推演（2.5s 超时降级）
  const cognitiveGate = shouldTriggerDeepCognitivePass({
    userMessage: lastUserText,
    sulkingLevel,
    boundaryHitReason: turnEmotion.sulkingTransition.boundaryHitReason,
    intensityTier: personaTemperament?.intensityTier,
    pleasantness: turnEmotion.pleasantness,
    isMasterBot,
  });
  const cognitiveReflection =
    canCallUpstream && thinkEnabled && cognitiveGate.trigger && cognitiveGate.reason
      ? await runDeepCognitivePass(llm, {
          personaName: persona.name,
          basicPersonality: persona.profile.basicPersonality,
          mind: personaMind,
          temperament: personaTemperament,
          sulkingReason: turnEmotion.snapshot.sulking?.reason,
          sulkingLevel,
          recentMessages: req.messages
            .filter((m) => typeof m.content === 'string')
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content })),
          userMessage: lastUserText,
          triggerReason: cognitiveGate.reason,
        })
      : null;

  const assembler = new PromptAssembler();
  const baseSystemPrompt = assembler.assembleFromRecord(persona, {
    mode: activeMode,
    thinkMode: thinkEnabled,
    searchContext: searchResp,
    lastUserMessage: lastUserText,
    hasImageAttachment: hasImage,
    userStyleProfile,
    blendedStyle,
    traitsDirective,
    sulkingDirective,
    mindDirective,
    fewShotDirective,
    cognitiveReflectionDirective: cognitiveReflection
      ? formatCognitiveReflectionForPrompt(cognitiveReflection)
      : undefined,
    dailyLifeDirective: dailyLifeDirective || undefined,
    sulkingLevel,
    emotionSummary: {
      emotion: updatedEmotion.primary,
      intensity: updatedEmotion.intensity,
      attitude: turnEmotion.description,
      intimacy: newIntimacy,
    },
  });
  const systemPrompt = [
    baseSystemPrompt,
    presence ? buildPresenceDirective(presence) : '',
    memoryDirectives,
    worldDirective,
    repetitionDirective,
    req.extraSystemPrompt || '',
  ]
    .filter((part) => part && part.trim())
    .join('\n\n');

  let rawModelOutput = '';
  let liveThoughtSent = '';
  let nativeReasoning = '';
  let thoughtDurationMs = 950;
  let isDemoMode = false;

  if (canCallUpstream) {
    onEvent?.({
      type: 'status',
      text: `${persona.name} 正在输入...`,
    });
    try {
      const endpoint = llm.endpoint;

      const temperature =
        activeMode === 'fun' ? 0.9 : activeMode === 'analytical' ? 0.5 : 0.78;

      const buffered = await fetchBufferedUpstreamLLM(
        endpoint,
        apiKey,
        model,
        systemPrompt,
        req.messages,
        temperature,
        // 内心戏边写边推给前端，不用等整条回复生成完（过滤分析腔，避免流式闪烁泄漏）
        onEvent && thinkEnabled
          ? (raw) => {
              const live = extractLiveThought(raw);
              if (!live || !live.thought || live.thought === liveThoughtSent) return;
              if (isForbiddenThought(live.thought)) return;
              liveThoughtSent = live.thought;
              onEvent({
                type: 'thought',
                delta: '',
                fullThought: live.thought,
                durationMs: Date.now() - turnStartMs,
              });
            }
          : undefined
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
        req.messages.length,
        sulkingLevel
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
      req.messages.length,
      sulkingLevel
    );
  }

  // 模型原生的推理过程多是分析腔，不当作角色的内心戏；内心戏只来自 <thought> 或二段推演/补写
  void nativeReasoning;
  const parsed = parseStructuredModelOutput(
    rawModelOutput,
    cognitiveReflection?.spokenThought || ''
  );

  // 模型这轮漏写了内心戏：根据这轮真实的对话、思维习惯、脾气与关系补写一段（失败就不显示，不用模板顶替）
  if (thinkEnabled && !parsed.thought.trim() && !isDemoMode && canCallUpstream) {
    const brief = [
      persona.profile.occupation ? `职业：${persona.profile.occupation}。` : '',
      persona.profile.personalityTags?.length
        ? `性格：${persona.profile.personalityTags.slice(0, 5).join('、')}。`
        : '',
      persona.profile.bio ? persona.profile.bio.slice(0, 60) : '',
    ].join('');
    parsed.thought = await synthesizeInnerThought(llm, {
      personaName: persona.name,
      personaBrief: brief,
      recent: req.messages
        .filter((m) => typeof m.content === 'string')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content })),
      reply: parsed.cleanReply,
      mood: parsed.mood || undefined,
      mindSummary: `${personaMind.cognitiveStyle} / ${personaMind.defenseStyle} / 保留度 ${personaMind.subtextLevel}`,
      traitsDirective: traitsDirective || undefined,
      sulkingDirective: sulkingDirective || undefined,
      intimacy: newIntimacy,
    });
  }

  const textless = parsed.bursts.length === 0;
  const sanitizedBursts = textless ? [] : sanitizeGatewayRefusalLeaks(parsed.bursts);
  const emojiTrimmedBursts = polishYoungAdultBursts(
    sanitizedBursts,
    userStyleProfile,
    blendedStyle.anchored
      ? {
          maxEmoji: blendedStyle.emojiBudget,
          allowedEmojis: blendedStyle.allowedEmojis,
          usesTrailingPeriod: blendedStyle.usesTrailingPeriod,
        }
      : {}
  );
  const segments = textless ? [] : splitIntoNaturalMessages(emojiTrimmedBursts);
  parsed.bursts = segments;
  parsed.cleanReply = segments.join('\n\n');
  const styleMetrics = toMessageStyleMetrics(
    scoreReply(segments, blendedStyle.self)
  );

  if (parsed.affect) {
    const mergedAffect = applyLlmAffectSignal({
      affect: parsed.affect,
      prevSnapshot: persona.emotionState,
      currentSnapshot: updatedEmotion,
      prevIntimacy: persona.intimacy,
      prevRelationship: persona.relationship,
      currentIntimacy: newIntimacy,
      currentIntimacyDelta: intimacyDelta,
      currentRelationship: relationshipState,
      basePleasantness: turnEmotion.pleasantness,
      mode: activeMode,
      traits: turnEmotion.traits,
      temperament: personaTemperament,
    });
    updatedEmotion = mergedAffect.snapshot;
    newIntimacy = mergedAffect.intimacy;
    intimacyDelta = mergedAffect.intimacyDelta;
    relationshipState = mergedAffect.relationship ?? relationshipState;
  }
  if (parsed.mood && !parsed.affect?.mood) {
    updatedEmotion.moodLabel = parsed.mood;
  }

  const hasExplicitSticker =
    Boolean(req.requestSticker) ||
    /表情包|发个图|来个图|斗图|贴纸|sticker/i.test(lastUserText);
  const hasExplicitPhoto =
    Boolean(req.requestPhoto) ||
    /自拍|照片|随手拍|画一张|生成.*图|配张图/i.test(lastUserText);

  const isColdWarSulking = Boolean(updatedEmotion.sulking && updatedEmotion.sulking.level >= 3);

  if (
    !isColdWarSulking &&
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
    !isColdWarSulking &&
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

  // Filter auto-emitted visual cards according to user preferences unless explicitly requested,
  // and block model-emitted photo/sticker cards during Level 3 cold-war sulking
  parsed.mediaCards = parsed.mediaCards.filter((card) => {
    if (isColdWarSulking && (card.type === 'photo' || card.type === 'sticker')) {
      return false;
    }
    if (card.type === 'sticker' && !hasExplicitSticker) {
      return settings.enableAutoSticker !== false;
    }
    if (card.type === 'photo' && !hasExplicitPhoto) {
      return settings.enableAutoPhoto !== false;
    }
    return true;
  });

  if (segments.length === 0) {
    if (parsed.mediaCards.length > 0) {
      segments.push(...mediaOnlyBursts(parsed.mediaCards, `${persona.slug}:${lastUserText}`));
    } else if (isColdWarSulking) {
      segments.push('现在没心情拍，晚点再说。');
    }
    parsed.bursts = segments;
    parsed.cleanReply = segments.join('\n\n');
  }

  // 回复写完时总结若还没整理好，最多再等 8 秒，超时就用规则整理，不让卡片拖住整条回复
  const digestResp = searchResp;
  let digestTimer: ReturnType<typeof setTimeout> | undefined;
  const digest =
    digestPromise && digestResp
      ? await Promise.race([
          digestPromise,
          new Promise<SearchDigest>((resolve) => {
            digestTimer = setTimeout(() => resolve(heuristicDigest(digestResp, lastUserText)), 8_000);
          }),
        ]).finally(() => clearTimeout(digestTimer))
      : null;
  const pageCard = buildPageCardIfRelevant(persona, searchResp, digest, parsed.cleanReply);

  // Mark all visual media cards without imageUrl as 'generating' when upstream gateway is reachable;
  // server/frontend trigger sequential /api/media/generate & enqueueNewMediaCards
  if (canCallUpstream) {
    parsed.mediaCards = parsed.mediaCards.map((card) =>
      (card.type === 'sticker' || card.type === 'photo') && !card.imageUrl
        ? { ...card, status: 'generating', model: imageModel }
        : card
    );
  }

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
      styleMetrics,
    };

    if (req.skipPersistence) return combinedMessage;

    await storageRepo.updateEmotionAndIntimacy(
    persona.slug,
    updatedEmotion,
    newIntimacy,
    relationshipState
  );
    await storageRepo.appendMessages(channelPersona.slug, [combinedMessage]);
    void runPostTurnPipeline({
    slug: persona.slug,
    conversationSlug: channelPersona.slug,
    userText: lastUserText,
    reply: parsed.cleanReply,
    recalledMemories,
  }).catch(() => {});
  if (ownsChannel) {
    void refreshConversationMemory({
      slug: channelPersona.slug,
      personaName: persona.name,
      userText: lastUserText,
      reply: parsed.cleanReply,
      llm,
    }).catch(() => {});
    // 每聊几轮在后台归纳一次世界设定（地点、宠物、物品、人物）
    void refreshWorld({ slug: channelPersona.slug, personaName: persona.name, llm }).catch(() => {});
  }

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
      styleMetrics: isLast ? styleMetrics : undefined,
    };
  });

  // Smooth paced simulated streaming ("假流式": buffer complete response first, then type out and emit multi-messages sequentially)
  const startTs = Date.now();
  if (thinkEnabled && parsed.thought && liveThoughtSent && parsed.thought.startsWith(liveThoughtSent.slice(0, 20))) {
    // 生成时已经实时显示过内心戏：只补发一次完整版，不再重新「打字」
    onEvent({
      type: 'thought',
      delta: '',
      fullThought: parsed.thought,
      durationMs: Math.max(500, Date.now() - turnStartMs),
    });
    thoughtDurationMs = Math.max(500, Date.now() - turnStartMs);
  } else if (thinkEnabled && parsed.thought) {
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
      await sleepForSimulatedStream(18, req.shouldSkipDelays);
    }
    thoughtDurationMs = Math.max(500, parsed.thought.length * 16);
  }

  onEvent({
    type: 'emotion',
    emotionState: updatedEmotion,
    intimacy: newIntimacy,
    intimacyChange: intimacyDelta,
  });

  const typingFactor = presence
    ? typingSpeedFactor({
        availability: presence.availability,
        hour: new Date().getHours(),
        arousal: updatedEmotion.arousal,
        intimacy: newIntimacy,
      })
    : 1;

  for (let i = 0; i < segments.length; i += 1) {
    const targetSegment = segments[i];
    const isLast = i === segments.length - 1;

    if (i === 0) {
      // 「还没看到消息」：忙或睡着时先空等一会儿，已经花在模型上的时间算进去
      if (presence) {
        const latency = computeReplyLatencyMs({
          availability: presence.availability,
          intimacy: newIntimacy,
        });
        const remaining = latency - (Date.now() - turnStartMs);
        const waitingText = presenceStatusText(persona.name, presence);
        if (remaining > 0) {
          if (waitingText) onEvent({ type: 'status', text: waitingText });
          await sleepForSimulatedStream(remaining, req.shouldSkipDelays);
          onEvent({ type: 'status', text: `${persona.name} 正在输入...` });
        }
      }
      await sleepForSimulatedStream(
        Math.round(computeRealisticTypingDelayMs(targetSegment, 0) * typingFactor),
        req.shouldSkipDelays
      );
    } else {
      onEvent({
        type: 'status',
        text: `${persona.name} 正在输入...`,
      });
      await sleepForSimulatedStream(
        Math.round(computeRealisticTypingDelayMs(targetSegment, i) * typingFactor),
        req.shouldSkipDelays
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
      await sleepForSimulatedStream(24, req.shouldSkipDelays);
    }

    onEvent({
      type: 'message_part',
      message: assistantMessages[i],
      index: i,
      total: segments.length,
      hasMore: !isLast,
    });
    // 每发出一段就存一段：你切走、刷新或生成中断时，已经发出的回复都还在
    if (!req.skipPersistence) {
      await storageRepo.appendMessages(channelPersona.slug, [assistantMessages[i]]);
    }
  }

  const finalAssistantMessage =
    assistantMessages[assistantMessages.length - 1];

  if (!req.skipPersistence) {
    await storageRepo.updateEmotionAndIntimacy(
      persona.slug,
      updatedEmotion,
      newIntimacy,
      relationshipState
    );
    void runPostTurnPipeline({
      slug: persona.slug,
      conversationSlug: channelPersona.slug,
      userText: lastUserText,
      reply: parsed.cleanReply,
      recalledMemories,
    }).catch(() => {});
    if (ownsChannel) {
      void refreshConversationMemory({
        slug: channelPersona.slug,
        personaName: persona.name,
        userText: lastUserText,
        reply: parsed.cleanReply,
        llm,
      }).catch(() => {});
      // 每聊几轮在后台归纳一次世界设定（地点、宠物、物品、人物）
      void refreshWorld({ slug: channelPersona.slug, personaName: persona.name, llm }).catch(() => {});
    }
  }

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
