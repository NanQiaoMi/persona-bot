/**
 * 角色的「内心戏」（Think）：
 * - extractLiveThought：在模型边生成边返回的文本里，实时取出 <thought> 里的内容（还没写完也取），让前端边写边看
 * - synthesizeInnerThought：模型这轮漏写了内心戏时，根据这轮真实的对话与回复，补写一段第一人称内心活动
 * - sanitizeInnerThought：统一净化主模型与补写产出的内心戏，严防 AI 分析腔泄漏
 */
import { chatCompletion, type LlmConfig } from '@/lib/llm/client';

export interface LiveThought {
  thought: string;
  /** </thought> 是否已经出现（内心戏写完了） */
  closed: boolean;
}

export const FORBIDDEN_THOUGHT_RE =
  /(用户|回复策略|人设|意图|模式|根据指令|分析如下|作为AI|作为一个|Layer|系统提示|提示词|prompt|OOC)/i;

export function isForbiddenThought(text: string): boolean {
  return FORBIDDEN_THOUGHT_RE.test(text || '');
}

/**
 * 从流式累积的原始输出里取内心戏。<thought> 需要出现在开头附近
 * （允许前面出现 [MOOD: …]、[AFFECT: …] 或 [EARLY: …]），
 * 避免把正文里偶然出现的文字当成内心戏。
 */
export function extractLiveThought(raw: string): LiveThought | null {
  const text = raw || '';
  const open = text.search(/<thought>/i);
  if (open === -1) return null;
  const before = text
    .slice(0, open)
    .replace(/\[MOOD:[^\]]*\]/gi, '')
    .replace(/[\[【]\s*AFFECT\s*[:：][^\]】]*[\]】]/gi, '')
    .replace(/\[EARLY:[^\]]*\]/gi, '')
    .trim();
  if (before.length > 0) return null;
  const start = open + '<thought>'.length;
  const closeIdx = text.slice(start).search(/<\/thought>/i);
  const body = closeIdx === -1 ? text.slice(start) : text.slice(start, start + closeIdx);
  // 半截的结束标签（如「</tho」）不显示出来
  const cleaned = body.replace(/<\/?t?h?o?u?g?h?t?$/i, '').trim();
  return { thought: cleaned, closed: closeIdx !== -1 };
}

export interface InnerThoughtInput {
  personaName: string;
  /** 简短人设：职业、性格标签、一句简介 */
  personaBrief: string;
  /** 最近几条对话（时间顺序） */
  recent: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 角色这轮刚回的话 */
  reply: string;
  mood?: string;
  /** 思维风格与防御方式摘要 */
  mindSummary?: string;
  /** 大五性格指令摘要 */
  traitsDirective?: string;
  /** 当前闹别扭/脾气状态指令 */
  sulkingDirective?: string;
  /** 当前关系亲密度 0~100 */
  intimacy?: number;
}

/** 清理模型输出：去掉标签、引号、括号包裹和多余换行，限制长度 */
export function cleanInnerThought(raw: string): string {
  let t = (raw || '')
    .replace(/<\/?thought>/gi, '')
    .replace(/\[MOOD:[^\]]*\]/gi, '')
    .replace(/[\[【]\s*AFFECT\s*[:：][^\]】]*[\]】]/gi, '')
    .replace(/^\s*(内心(戏|活动|独白)?|心声)\s*[:：]\s*/u, '')
    .trim();
  t = t.replace(/^[「“"'（(]+|[」”"'）)]+$/g, '').trim();
  // 引号里面也可能带着「内心戏：」前缀
  t = t.replace(/^\s*(内心(戏|活动|独白)?|心声)\s*[:：]\s*/u, '').trim();
  t = t.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 3).join('\n');
  if (t.length > 140) t = `${t.slice(0, 138)}…`;
  return t;
}

/** 统一净化主输出和补写输出的内心戏：清理包裹并拦截任何 AI 分析腔 */
export function sanitizeInnerThought(
  raw: string,
  opts: { minLength?: number } = {}
): string {
  const cleaned = cleanInnerThought(raw);
  if (!cleaned || isForbiddenThought(cleaned)) return '';
  if (typeof opts.minLength === 'number' && cleaned.length < opts.minLength) {
    return '';
  }
  return cleaned;
}

export function buildInnerThoughtPrompt(input: InnerThoughtInput): string {
  const transcript = input.recent
    .slice(-6)
    .filter((m) => (m.content || '').trim())
    .map((m) => `${m.role === 'user' ? '对方' : input.personaName}：${m.content.trim().slice(0, 160)}`)
    .join('\n');
  return [
    `你是「${input.personaName}」。${input.personaBrief}`,
    input.mindSummary ? `【你的思考习惯】${input.mindSummary}` : '',
    input.traitsDirective ? `【你的性格底色】${input.traitsDirective.replace(/\n+/g, ' ')}` : '',
    input.sulkingDirective ? `【你此刻的脾气/心结】${input.sulkingDirective.replace(/\n+/g, ' ')}` : '',
    typeof input.intimacy === 'number' ? `【你们的熟络度】${input.intimacy}/100` : '',
    '',
    '下面是你和对方刚才的聊天，以及你刚刚回给对方的话。',
    '请用第一人称写出：你打出这条回复之前，脑子里一闪而过的真实内心活动（先怎么想/在意什么 → 决定嘴上怎么收着说或直说）。',
    '要求：',
    '- 1~3 句，30~90 字，紧扣这次聊的具体内容和你此刻的真实情绪',
    '- 可以是嘴硬心软、暗暗吐槽、纠结要不要说、偷偷开心、真有点火大……按你的性格和这次的语境来',
    '- 不要复述回复原话，不要分析腔，不要出现「用户、回复、人设、意图、模式、Layer」这类词',
    '- 直接输出内心活动本身，不要标题、引号或解释',
    input.mood ? `- 你此刻的心情：${input.mood}` : '',
    '',
    '【刚才的聊天】',
    transcript || '（刚开始聊）',
    '',
    `【你刚回的话】`,
    input.reply.slice(0, 300),
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** 补写内心戏；失败、超时或写出分析腔时返回空字符串（前端就不显示，不用模板顶替） */
export async function synthesizeInnerThought(
  llm: LlmConfig,
  input: InnerThoughtInput,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  if (!llm.canCall) return '';
  try {
    const raw = await chatCompletion(llm, [{ role: 'user', content: buildInnerThoughtPrompt(input) }], {
      temperature: 0.85,
      timeoutMs: options.timeoutMs ?? 12_000,
    });
    return sanitizeInnerThought(raw, { minLength: 6 });
  } catch {
    return '';
  }
}
