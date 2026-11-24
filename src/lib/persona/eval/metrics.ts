import { getEmojiRegex } from '@/lib/persona/fingerprint';

/** 单轮回复的风格度量（纯 TS，确定性，不进入 Prompt） */
export interface ReplyMetrics {
  bubbleCount: number;
  avgBubbleLen: number;
  emojiCount: number;
  emojiPerBubble: number;
  trailingPeriodRate: number;
  exclamationPerBubble: number;
  catchphraseHits: string[];
  aiClicheHits: string[];
  oocHits: string[];
  /** 结尾是否是主持人式反问（你呢/今天怎么样） */
  hostQuestion: boolean;
  /** 舞台剧式括号动作数量，如（轻轻笑） */
  stageDirectionCount: number;
  /** Markdown 列表/加粗/标题数量 */
  markdownCount: number;
}

export const AI_CLICHE_PATTERNS: string[] = [
  '希望这能帮到你',
  '希望对你有帮助',
  '这就安排',
  '给你安排',
  '拿捏住了',
  '氛围感拉满',
  '作为一个',
  '总的来说',
  '综上所述',
  '首先',
  '值得一提的是',
  '不过话说回来',
  '顺便一提',
  '如果你还有其他问题',
  '随时告诉我',
  '我理解你的感受',
  '非常抱歉',
  '我很乐意',
];

export const OOC_PATTERNS: RegExp[] = [
  /我是(?:一个)?\s*(?:AI|人工智能|语言模型|机器人|助手)/i,
  /作为(?:一个)?\s*(?:AI|人工智能|语言模型)/i,
  /临时聊天/,
  /切换到普通聊天/,
  /当前模式不支持/,
  /我没有(?:实体|手机|身体)/,
  /不能假装实拍/,
  /OpenAI|ChatGPT|大模型/i,
];

const HOST_QUESTION_RE = /(?:你呢|你怎么样|今天怎么样|今天过得怎么样|你觉得呢|还有什么想聊的)[？?]?\s*$/;
const STAGE_DIRECTION_RE = /[（(][^（）()]{1,16}[）)]/g;
const MARKDOWN_RE = /(?:^|\n)\s*(?:#{1,4}\s|[-*+]\s|\d+\.\s)|\*\*[^*]+\*\*/g;

export function measureReply(
  reply: string | string[],
  options: { catchphrases?: string[] } = {}
): ReplyMetrics {
  const bubbles = (Array.isArray(reply) ? reply : reply.split(/\n{2,}|\[BURST\]/))
    .map((b) => b.trim())
    .filter(Boolean);
  const all = bubbles.join('\n');
  const n = Math.max(1, bubbles.length);

  const emojiCount = (all.match(getEmojiRegex()) || []).length;
  const exclCount = (all.match(/[！!]/g) || []).length;
  const periodBubbles = bubbles.filter((b) => /。\s*$/.test(b)).length;
  const lower = all.toLowerCase();

  const catchphraseHits = (options.catchphrases || []).filter(
    (c) => c && lower.includes(c.toLowerCase())
  );
  const aiClicheHits = AI_CLICHE_PATTERNS.filter((p) => all.includes(p));
  const oocHits = OOC_PATTERNS.filter((re) => re.test(all)).map((re) => re.source);
  const lastBubble = bubbles[bubbles.length - 1] || '';

  return {
    bubbleCount: bubbles.length,
    avgBubbleLen: bubbles.length
      ? Math.round(bubbles.reduce((s, b) => s + b.length, 0) / bubbles.length)
      : 0,
    emojiCount,
    emojiPerBubble: Number((emojiCount / n).toFixed(2)),
    trailingPeriodRate: Number((periodBubbles / n).toFixed(2)),
    exclamationPerBubble: Number((exclCount / n).toFixed(2)),
    catchphraseHits,
    aiClicheHits,
    oocHits,
    hostQuestion: HOST_QUESTION_RE.test(lastBubble),
    stageDirectionCount: (all.match(STAGE_DIRECTION_RE) || []).length,
    markdownCount: (all.match(MARKDOWN_RE) || []).length,
  };
}
