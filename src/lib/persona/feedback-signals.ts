import { StyleDimension } from '@/lib/persona/spec';
import { ConversationMessage } from '@/lib/storage/types';

/**
 * 从用户的下一句话里读出对上一轮回复的反馈（显式抱怨 / 正向反应 / 困惑 / 冷淡），
 * 作为自进化闭环的观察信号。纯规则、确定性。
 */
export type FeedbackPolarity = 'positive' | 'negative' | 'neutral';

export interface FeedbackSignal {
  polarity: FeedbackPolarity;
  /** 用户明确吐槽了说话方式（如「太像 AI 了」「别发表情」） */
  explicit: boolean;
  /** 抱怨针对的风格维度 */
  dimension?: StyleDimension;
  reasons: string[];
  /** 对上一轮回复的反应分 (0~100)，50 为中性 */
  reactionScore: number;
}

const COMPLAINTS: Array<{ re: RegExp; dimension?: StyleDimension; reason: string }> = [
  { re: /(?:太|好|很)?像\s*(?:AI|ai|机器人|客服|人机)|说人话|不像(?:你|本人|TA)|你好怪|ooc|出戏/i, dimension: 'tone', reason: '吐槽像 AI / 不像本人' },
  { re: /(?:好|太|真)油腻|别这么油|土味/, dimension: 'tone', reason: '吐槽油腻' },
  { re: /别(?:发|老发|再发)?(?:表情|emoji)|表情(?:太多|好多)/i, dimension: 'emoji', reason: '吐槽表情太多' },
  { re: /太长了|好长|啰嗦|话好多|说重点|长篇大论/, dimension: 'length', reason: '吐槽太长' },
  { re: /别(?:老|总)?问(?:我)?|别反问|一直问/, dimension: 'question', reason: '吐槽一直反问' },
  { re: /别这样|不要这样|好烦|无语了|你在说啥|答非所问/, reason: '明确不满' },
];

const POSITIVE = /哈哈|笑死|hh|绝了|可以啊|好可爱|喜欢|爱了|懂我|太对了|么么|嘿嘿|好耶|谢谢/i;
const CONFUSED = /^[？?]{1,}$|啥意思|什么意思|没看懂|你在说什么/;
const COLD = /^(?:嗯|哦|噢|行|好|ok|。|…+|\.+)$/i;

export function detectFeedback(
  userText: string,
  context: { previousUserAvgLen?: number } = {}
): FeedbackSignal {
  const text = (userText || '').trim();
  const reasons: string[] = [];
  let score = 50;
  let explicit = false;
  let dimension: StyleDimension | undefined;

  for (const c of COMPLAINTS) {
    if (c.re.test(text)) {
      explicit = true;
      dimension = dimension ?? c.dimension;
      reasons.push(c.reason);
      score -= 30;
    }
  }
  if (CONFUSED.test(text)) {
    reasons.push('表示困惑');
    score -= 15;
  }
  if (COLD.test(text)) {
    reasons.push('冷淡短回复');
    score -= 10;
  } else if (
    context.previousUserAvgLen &&
    context.previousUserAvgLen >= 12 &&
    text.length > 0 &&
    text.length <= context.previousUserAvgLen * 0.25
  ) {
    reasons.push('回复明显变短');
    score -= 6;
  }
  if (!explicit && POSITIVE.test(text)) {
    reasons.push('正向反应');
    score += 20;
  }

  const reactionScore = Math.max(0, Math.min(100, score));
  return {
    polarity: reactionScore >= 60 ? 'positive' : reactionScore <= 40 ? 'negative' : 'neutral',
    explicit,
    dimension,
    reasons,
    reactionScore,
  };
}

export interface TurnQuality {
  /** 被评价的那一轮回复的最后一条消息 id */
  assistantMsgId: string;
  styleScore: number;
  reactionScore: number;
  /** 综合质量 = 0.6 × 风格分 + 0.4 × 用户反应分 */
  quality: number;
  signal: FeedbackSignal;
}

/**
 * 评价「上一轮回复」：取最新一条用户消息之前最近的 assistant 消息的 styleMetrics，
 * 结合最新用户消息的反应计算质量分。没有可评价的回复时返回 null。
 */
export function evaluateLastTurn(messages: ConversationMessage[]): TurnQuality | null {
  if (!messages.length) return null;
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx <= 0) return null;

  let assistant: ConversationMessage | undefined;
  for (let i = lastUserIdx - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant' && messages[i].styleMetrics) {
      assistant = messages[i];
      break;
    }
    if (messages[i].role === 'user') break;
  }
  if (!assistant?.styleMetrics) return null;

  const prevUsers = messages
    .slice(0, lastUserIdx)
    .filter((m) => m.role === 'user')
    .slice(-6);
  const prevAvg = prevUsers.length
    ? prevUsers.reduce((n, m) => n + (m.content || '').length, 0) / prevUsers.length
    : undefined;

  const signal = detectFeedback(messages[lastUserIdx].content, { previousUserAvgLen: prevAvg });
  const m = assistant.styleMetrics;
  const styleScore = Math.round(m.likeness * 0.5 + m.deAI * 0.5);
  return {
    assistantMsgId: assistant.id,
    styleScore,
    reactionScore: signal.reactionScore,
    quality: Math.round(styleScore * 0.6 + signal.reactionScore * 0.4),
    signal,
  };
}
