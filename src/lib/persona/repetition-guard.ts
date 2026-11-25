/**
 * 防重复：统计角色最近几轮自己说过的开头、口头禅和高频短语，
 * 生成「这轮换个说法」的提示。真人也有口头禅，但不会每轮都用同一句开场。
 * 纯函数，只看客户端带上来的历史，不读存储。
 */

const WATCHED_PHRASES = [
  '笑死', '哈哈哈', '哈哈', '确实', '真的假的', '救命', '绝了', '离谱', '好家伙', '抱抱',
  '乖', '啧', '行吧', '懂了', '我看看', '不是吧', '害', '哎呀', '嘿嘿', '呜呜', '好啦',
  '算了', '捏', '宝', '亲爱的', '说真的', '讲真', '有一说一', '绷不住', '麻了', '你呀',
  '傻瓜', '笨蛋', '小傻瓜', '收到', '没问题', '当然', '其实',
];

/** 自动 n-gram 统计时忽略的高频无意义片段 */
const STOP_GRAMS = new Set([
  '一下', '什么', '怎么', '就是', '然后', '还是', '不是', '没有', '可以', '这个', '那个',
  '我们', '你们', '他们', '自己', '知道', '觉得', '时候', '现在', '今天', '真的', '有点',
]);

const OPENER_REGEX = /^[\s…。.，,！!？?~～]*([^\s，。！？,.!?~～…]+)/;

export interface RepetitionItem {
  text: string;
  count: number;
}

export interface RepetitionReport {
  openers: RepetitionItem[];
  phrases: RepetitionItem[];
  /** 句尾总用同一个符号/语气词（如「～」「捏」） */
  trailingHabit?: RepetitionItem;
  directive: string;
}

function countBy(items: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) map.set(it, (map.get(it) || 0) + 1);
  return map;
}

/** 每个气泡开头的「起手式」：取第一个停顿前的 1~4 个字 */
export function extractOpener(bubble: string): string | null {
  const m = bubble.trim().match(OPENER_REGEX);
  if (!m) return null;
  const opener = m[1];
  // 只关心短的起手（语气词、口头禅），完整的句子开头不算重复
  return opener.length <= 4 ? opener : null;
}

function cjkGrams(text: string, n: number): string[] {
  const grams: string[] = [];
  for (const run of text.match(/[一-龥]+/g) || []) {
    for (let i = 0; i + n <= run.length; i += 1) grams.push(run.slice(i, i + n));
  }
  return grams;
}

export function analyzeRecentRepetition(
  recentAssistantBubbles: string[],
  options: { window?: number } = {}
): RepetitionReport {
  const bubbles = recentAssistantBubbles
    .map((b) => (b || '').trim())
    .filter(Boolean)
    .slice(-(options.window ?? 12));

  if (bubbles.length < 3) {
    return { openers: [], phrases: [], directive: '' };
  }

  // 1. 开头起手式
  const openerCounts = countBy(bubbles.map(extractOpener).filter((o): o is string => Boolean(o)));
  const openers = [...openerCounts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // 2. 口头禅：常见口头禅出现在 ≥3 个气泡里，或自动发现的 3~4 字短语出现在 ≥3 个气泡里
  const phraseCounts = new Map<string, number>();
  for (const p of WATCHED_PHRASES) {
    const n = bubbles.filter((b) => b.includes(p)).length;
    if (n >= 3) phraseCounts.set(p, n);
  }
  for (const n of [4, 3]) {
    const perBubble = bubbles.map((b) => new Set(cjkGrams(b, n)));
    const df = new Map<string, number>();
    for (const set of perBubble) for (const g of set) df.set(g, (df.get(g) || 0) + 1);
    for (const [g, c] of df) {
      if (c < 3 || STOP_GRAMS.has(g.slice(0, 2)) || STOP_GRAMS.has(g.slice(-2))) continue;
      // 已被更长的短语覆盖时跳过
      if ([...phraseCounts.keys()].some((k) => k.includes(g) || g.includes(k))) continue;
      phraseCounts.set(g, c);
    }
  }
  // 「哈哈」被「哈哈哈」覆盖时只留长的
  for (const k of [...phraseCounts.keys()]) {
    if ([...phraseCounts.keys()].some((o) => o !== k && o.includes(k))) phraseCounts.delete(k);
  }
  const phrases = [...phraseCounts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  // 3. 句尾习惯
  const tails = bubbles.map((b) => b.slice(-1)).filter((t) => /[～~！!…捏呀啦嘛哦呢]/.test(t));
  const tailCounts = [...countBy(tails).entries()].sort((a, b) => b[1] - a[1]);
  const trailingHabit =
    tailCounts.length > 0 && tailCounts[0][1] / bubbles.length >= 0.6 && tailCounts[0][1] >= 4
      ? { text: tailCounts[0][0], count: tailCounts[0][1] }
      : undefined;

  const lines: string[] = [];
  if (openers.length > 0) {
    lines.push(`- 开头：${openers.map((o) => `「${o.text}」×${o.count}`).join('、')}`);
  }
  if (phrases.length > 0) {
    lines.push(`- 口头禅 / 高频词：${phrases.map((p) => `「${p.text}」×${p.count}`).join('、')}`);
  }
  if (trailingHabit) {
    lines.push(`- 句尾总是带「${trailingHabit.text}」（${trailingHabit.count} 条）`);
  }

  const directive =
    lines.length === 0
      ? ''
      : [
          `## 别重复自己（你最近 ${bubbles.length} 条消息里已经用过）`,
          ...lines,
          '- 这一轮换个开头、换种说法，或者干脆不用；口头禅偶尔冒一次才像真人，每轮都带就像复读机。',
        ].join('\n');

  return { openers, phrases, trailingHabit, directive };
}
