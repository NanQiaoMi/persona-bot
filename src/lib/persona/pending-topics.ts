/**
 * 待办事件记忆：从用户随口提到的「即将发生的事」（面试、体检、搬家……）里抽取话题，
 * 等事情的时间过去之后，人设可以顺口问一句「面试咋样了」。
 *
 * 全部为纯函数：不做 IO，不调用 Date.now()，所有“现在”都由 now 参数决定。
 */

export type PendingTopicStatus = 'open' | 'asked' | 'expired';

export interface PendingTopic {
  id: string;
  /** short label of the event, e.g. '面试', '科目二考试', '体检', '搬家', '约会', '出差去上海' (≤ 16 chars) */
  label: string;
  /** user's original clause (≤ 40 chars), for prompt context */
  snippet: string;
  /** words used to detect whether the persona already asked about it (include label and core nouns) */
  keywords: string[];
  mentionedAt: string; // ISO
  dueAt: string; // ISO estimate of when the event happens/finishes
  status: PendingTopicStatus;
  askedAt?: string;
}

type NewPendingTopic = Omit<PendingTopic, 'id' | 'status'>;

interface EventHit {
  index: number;
  end: number;
  label: string;
  keywords: string[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_EXTRACT = 3;
const MAX_STORED = 12;
const MAX_DUE = 2;
const LABEL_MAX = 16;
const SNIPPET_MAX = 40;
const EXPIRE_AFTER_DUE_MS = 7 * DAY_MS;
const DROP_AFTER_DUE_MS = 14 * DAY_MS;
const MIN_ASK_DELAY_MS = 2 * HOUR_MS;

const CLAUSE_SPLIT = /[，。！？,.!?\n]|然后/;
const PAST_MARKER = /昨天|昨晚|昨夜|前天|大前天|上周|上星期|上礼拜|上个|刚刚|刚才|刚(?!好)/;
const NEGATION = /取消|不去|不考|不面|不搬|没去|没考|没面|别去|别考|不再/;
const WEEKDAY_TO_JS_DAY: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};
const SIMPLE_EVENT_WORDS = [
  '考研',
  '考试',
  '面试',
  '答辩',
  '体检',
  '看病',
  '复查',
  '手术',
  '拔牙',
  '搬家',
  '约会',
  '见家长',
  '相亲',
  '比赛',
  '演出',
  '汇报',
  '述职',
  '交稿',
  '签约',
  '入职',
  '离职',
  '生日',
  '航班',
  '高铁',
];

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter((s) => s.length > 0)));
}

function hitOf(m: RegExpMatchArray, label: string, extra: string[] = []): EventHit {
  const index = m.index ?? 0;
  // 单字的额外关键词（如「飞」）容易误中回复，只保留 2 字及以上的
  const keywords = uniq([label, ...extra.filter((k) => k.length >= 2)]);
  return { index, end: index + m[0].length, label, keywords };
}

type EventMatcher = (clause: string) => EventHit | null;

const EVENT_MATCHERS: EventMatcher[] = [
  (c) => {
    const m = c.match(/科目([一二三四])/);
    return m ? hitOf(m, `科目${m[1]}考试`, [`科目${m[1]}`, '考试']) : null;
  },
  (c) => {
    const m = c.match(/(出差|旅游|旅行|飞(?![快速舞跃奔书行盘]))(?:(?:去|到)([一-龥]{1,4}))?/);
    if (!m) return null;
    const base = m[1];
    const dest = m[2] ? m[2].replace(/[吧啊呀了的吗呢嘛]+$/, '') : '';
    const label = dest ? `${base}去${dest}` : base;
    return hitOf(m, label, [base, dest]);
  },
  (c) => {
    const m = c.match(/截止|ddl/i);
    return m ? hitOf(m, m[0].toLowerCase()) : null;
  },
  (c) => {
    // 开会只在提到「重要/大」时才算事件
    if (!/重要|大会|大型|大场/.test(c)) return null;
    const m = c.match(/开.{0,6}?会/);
    return m ? hitOf(m, '开会') : null;
  },
  ...SIMPLE_EVENT_WORDS.map((word): EventMatcher => (c) => {
    const i = c.indexOf(word);
    return i < 0 ? null : { index: i, end: i + word.length, label: word, keywords: [word] };
  }),
];

/** 取子句里最靠前的事件词 */
function findEvent(clause: string): EventHit | null {
  let best: EventHit | null = null;
  for (const matcher of EVENT_MATCHERS) {
    const hit = matcher(clause);
    if (hit && (best === null || hit.index < best.index)) best = hit;
  }
  return best;
}

/** 已经发生或被否定的事件不记录 */
function isSkipped(clause: string, hit: EventHit): boolean {
  if (PAST_MARKER.test(clause) || NEGATION.test(clause)) return true;
  const after = clause.slice(hit.end);
  if (/^(完了|完啦|完成了|结束了|过了|完毕)/.test(after)) return true;
  if (/已经/.test(clause) && /^[了完过]/.test(after)) return true;
  return false;
}

/** 在 now 所在日期上加 dayOffset 天，设为本地 hour 点整（用 Date 构造器处理跨月） */
function atDay(now: Date, dayOffset: number, hour: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0, 0);
}

/** 距离本周一过了几天（周一为 0，周日为 6） */
function daysSinceMonday(now: Date): number {
  return (now.getDay() + 6) % 7;
}

/** 从 now 起，下一个周 target（JS 星期序号）的日期偏移，周一为一周起点 */
function nextWeekDayOffset(now: Date, jsDay: number): number {
  const monFirstIndex = (jsDay + 6) % 7;
  return 7 - daysSinceMonday(now) + monFirstIndex;
}

/** 从 now 起，严格晚于今天的下一个星期 jsDay 的偏移（今天就是该星期几则取下周） */
function nextOccurrenceOffset(now: Date, jsDay: number): number {
  return (jsDay - now.getDay() + 7) % 7 || 7;
}

/** 解析子句中的时间词，返回预计事件发生/结束时间；无时间词返回 null */
function resolveDueAt(clause: string, now: Date): Date | null {
  if (/待会|一会儿|马上/.test(clause)) return new Date(now.getTime() + 2 * HOUR_MS);

  let m = clause.match(/下(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (m) return atDay(now, nextWeekDayOffset(now, WEEKDAY_TO_JS_DAY[m[1]]), 20);
  if (/下(?:个)?(?:周|星期|礼拜)末/.test(clause)) return atDay(now, nextWeekDayOffset(now, 6), 20);
  if (/下(?:个)?(?:周|星期|礼拜)/.test(clause)) return atDay(now, 7, 20);
  if (/下个月|下月|月底/.test(clause)) return atDay(now, 30, 20);
  if (/后天/.test(clause)) return atDay(now, 2, 20);
  if (/明天|明早|明晚/.test(clause)) return atDay(now, 1, 20);

  m = clause.match(/(?:这|本)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (m) return atDay(now, nextOccurrenceOffset(now, WEEKDAY_TO_JS_DAY[m[1]]), 20);
  if (/周末/.test(clause)) return atDay(now, (6 - now.getDay() + 7) % 7, 20);
  if (/今天|今晚|今早|今儿|晚上|下午/.test(clause)) return atDay(now, 0, 23);
  return null;
}

/**
 * 从一段用户原话中抽取即将发生的事件。
 * 需要同时有事件词与时间词；每条消息最多 3 个；同一消息内相同 label 只保留一个。
 */
export function extractPendingTopics(userText: string, now: Date): NewPendingTopic[] {
  const mentionedAt = now.toISOString();
  const out: NewPendingTopic[] = [];
  const seenLabels = new Set<string>();

  for (const raw of userText.split(CLAUSE_SPLIT)) {
    if (out.length >= MAX_EXTRACT) break;
    const clause = raw.trim();
    if (!clause) continue;

    const hit = findEvent(clause);
    if (!hit || isSkipped(clause, hit)) continue;

    const dueAt = resolveDueAt(clause, now);
    if (!dueAt) continue;

    const label = hit.label.slice(0, LABEL_MAX);
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);

    out.push({
      label,
      snippet: clause.slice(0, SNIPPET_MAX),
      keywords: hit.keywords,
      mentionedAt,
      dueAt: dueAt.toISOString(),
    });
  }

  return out;
}

/** 按时间规则更新已有话题的状态：超过 7 天未处理的变为 expired，超过 14 天的丢弃 */
function refreshExisting(topics: PendingTopic[], nowMs: number): PendingTopic[] {
  const kept: PendingTopic[] = [];
  for (const topic of topics) {
    const dueMs = Date.parse(topic.dueAt);
    if (dueMs < nowMs - DROP_AFTER_DUE_MS) continue;
    if (topic.status !== 'expired' && dueMs < nowMs - EXPIRE_AFTER_DUE_MS) {
      kept.push({ ...topic, status: 'expired' });
    } else {
      kept.push({ ...topic });
    }
  }
  return kept;
}

/**
 * 把新抽取的话题合并进已有列表。
 * 与已有 open 话题同 label 或有重叠关键词的，只更新 dueAt / snippet（并合并关键词），不重复新增。
 * 结果最多 12 条，优先保留 open，其次保留更新的。
 */
export function mergePendingTopics(
  existing: PendingTopic[],
  incoming: NewPendingTopic[],
  now: Date,
): PendingTopic[] {
  const nowMs = now.getTime();
  // 新加入的放在数组前面，时间相同的情况下优先保留新话题
  const pool: PendingTopic[] = refreshExisting(existing, nowMs);

  incoming.forEach((item, i) => {
    const match = pool.find(
      (t) =>
        t.status === 'open' &&
        (t.label === item.label || t.keywords.some((k) => item.keywords.includes(k))),
    );
    if (match) {
      match.dueAt = item.dueAt;
      match.snippet = item.snippet;
      match.keywords = uniq([...match.keywords, ...item.keywords]);
      return;
    }
    pool.unshift({
      id: `topic_${nowMs.toString(36)}_${i}`,
      label: item.label,
      snippet: item.snippet,
      keywords: uniq(item.keywords),
      mentionedAt: item.mentionedAt,
      dueAt: item.dueAt,
      status: 'open',
    });
  });

  const rank = (t: PendingTopic): number => (t.status === 'open' ? 0 : 1);
  return pool
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.mentionedAt) - Date.parse(a.mentionedAt))
    .slice(0, MAX_STORED);
}

/**
 * 取出当前应该去问的话题：open、已到期（不超过 7 天）、且提及时间已超过 2 小时（不立刻追问）。
 * 按到期时间从早到晚排序，最多返回 2 条。
 */
export function getDueTopics(topics: PendingTopic[], now: Date): PendingTopic[] {
  const nowMs = now.getTime();
  return topics
    .filter((t) => {
      if (t.status !== 'open') return false;
      const dueMs = Date.parse(t.dueAt);
      const mentionedMs = Date.parse(t.mentionedAt);
      return (
        dueMs <= nowMs &&
        dueMs >= nowMs - EXPIRE_AFTER_DUE_MS &&
        mentionedMs <= nowMs - MIN_ASK_DELAY_MS
      );
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, MAX_DUE);
}

/** 人设回复里提到了话题的任一关键词，则标记为 asked（不区分大小写） */
export function markAskedTopics(
  topics: PendingTopic[],
  assistantReply: string,
  now: Date,
): PendingTopic[] {
  const reply = assistantReply.toLowerCase();
  const askedAt = now.toISOString();
  return topics.map((t) => {
    if (t.status !== 'open') return { ...t };
    const hit = t.keywords.some((k) => k.length > 0 && reply.includes(k.toLowerCase()));
    return hit ? { ...t, status: 'asked', askedAt } : { ...t };
  });
}

/** 生成注入提示词的 Markdown 段落；没有可问的话题时返回空字符串 */
export function buildPendingTopicDirective(due: PendingTopic[]): string {
  if (due.length === 0) return '';
  return [
    '## 可以顺口关心的事',
    ...due.map((t) => `- 对方之前说过「${t.snippet}」（${t.label}），现在应该已经有结果了`),
    '- 只在聊天自然的时候顺口问一句，像朋友惦记着那样；别一上来就连环追问，问过一次就不要再问。',
  ].join('\n');
}
