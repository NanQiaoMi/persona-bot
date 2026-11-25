/**
 * 群聊发言调度器（纯函数，无 IO）：
 * - 判断主 bot 频道里的一句话是不是「拉个群」
 * - 每轮决定谁开口、按什么顺序开口
 * - 决定角色之间要不要互相接话（限制连锁轮数，防止刷屏）
 * - 把群聊记录转换成某个角色视角下的对话上下文
 */
import type { ConversationMessage, PersonaMode, PersonaProfile } from '@/lib/storage/types';

export interface GroupMemberLite {
  slug: string;
  name: string;
  defaultMode?: PersonaMode;
  profile?: Partial<PersonaProfile>;
}

export type RandomFn = () => number;

export const GROUP_MAX_SPEAKERS = 3;
export const GROUP_MAX_BOT_CHAIN = 2;
const TRANSCRIPT_WINDOW = 30;

const EVERYONE_REGEX = /(大家|你们|各位|所有人|全体|都来|一起|每个人|谁)/;
const GROUP_INTENT_REGEX =
  /((拉|建|开|组|搞|发起|创建)\s*(个|一个|一下)?\s*(群|群聊))|(群聊一下)|(拉.{1,30}进群)/;
const ALL_MEMBERS_REGEX = /(所有|全部|大家|都拉|全拉|每个)/;

/** 角色名的可匹配写法：全名、去掉空格后的首段、slug */
function nameTokens(member: GroupMemberLite): string[] {
  const tokens = [member.name, member.name.split(/\s+/)[0], member.slug]
    .map((t) => (t || '').trim().toLowerCase())
    .filter((t) => t.length >= 2);
  return Array.from(new Set(tokens));
}

/** 按出现顺序找出被点名（含 @名字）的成员 */
export function findMentionedMembers<T extends GroupMemberLite>(
  text: string,
  members: T[]
): T[] {
  const lower = (text || '').toLowerCase();
  const hits: Array<{ member: T; pos: number }> = [];
  for (const member of members) {
    let best = -1;
    for (const tok of nameTokens(member)) {
      const pos = lower.indexOf(tok);
      if (pos !== -1 && (best === -1 || pos < best)) best = pos;
    }
    if (best !== -1) hits.push({ member, pos: best });
  }
  return hits.sort((a, b) => a.pos - b.pos).map((h) => h.member);
}

/** 话题与角色职业/性格标签的粗相关度 */
export function topicRelevance(text: string, member: GroupMemberLite): number {
  const lower = (text || '').toLowerCase();
  const keywords = [
    member.profile?.occupation || '',
    ...(member.profile?.personalityTags || []),
  ]
    .flatMap((k) => k.split(/[\s,，、/]+/))
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 2);
  let score = 0;
  for (const k of keywords) {
    if (lower.includes(k)) score += 1;
  }
  return score;
}

/** 距离该成员上次发言过去了多少条消息（没说过话视为很久） */
export function turnsSinceSpoke(history: ConversationMessage[], slug: string): number {
  for (let i = history.length - 1, n = 0; i >= 0; i -= 1, n += 1) {
    if (history[i].fromBot?.slug === slug) return n;
  }
  return 99;
}

export interface PickSpeakersInput<T extends GroupMemberLite> {
  text: string;
  members: T[];
  history: ConversationMessage[];
  maxSpeakers?: number;
  random?: RandomFn;
}

/**
 * 决定本轮谁开口：
 * 1. 被点名的人一定先说（按点名顺序）
 * 2. 叫「大家/你们」时，最多 maxSpeakers 人都回
 * 3. 否则挑 1 人主接，按概率再补 1 人插话——像真实群聊，不是每个人都回每句话
 */
export function pickSpeakers<T extends GroupMemberLite>({
  text,
  members,
  history,
  maxSpeakers = GROUP_MAX_SPEAKERS,
  random = Math.random,
}: PickSpeakersInput<T>): T[] {
  if (members.length === 0) return [];
  const cap = Math.max(1, Math.min(maxSpeakers, members.length));

  const mentioned = findMentionedMembers(text, members);
  const ranked = [...members]
    .map((m) => ({
      member: m,
      score:
        topicRelevance(text, m) * 2 +
        Math.min(turnsSinceSpoke(history, m.slug), 8) * 0.35 +
        random() * 0.9,
    }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.member);

  if (mentioned.length > 0) {
    const result = mentioned.slice(0, cap);
    // 点名一个人时，偶尔有旁人忍不住插一句
    if (result.length === 1 && cap > 1 && random() < 0.3) {
      const extra = ranked.find((m) => m.slug !== result[0].slug);
      if (extra) result.push(extra);
    }
    return result;
  }

  if (EVERYONE_REGEX.test(text)) {
    return ranked.slice(0, cap);
  }

  const result = [ranked[0]];
  const isLongOrQuestion = text.trim().length > 14 || /[?？吗呢么]$/.test(text.trim());
  if (cap >= 2 && random() < (isLongOrQuestion ? 0.6 : 0.35)) {
    result.push(ranked[1]);
  }
  return result;
}

export interface PickReactorInput<T extends GroupMemberLite> {
  lastSpeakerSlug: string;
  lastText: string;
  members: T[];
  spokenThisRound: string[];
  chainDepth: number;
  maxChain?: number;
  random?: RandomFn;
}

/**
 * 某个角色说完后，是否有另一个角色顺势接话：
 * - 被 TA 点名的人一定接（但不超过连锁上限）
 * - 否则小概率有一个这轮还没说话的人插一句，越往后概率越低
 */
export function pickReactor<T extends GroupMemberLite>({
  lastSpeakerSlug,
  lastText,
  members,
  spokenThisRound,
  chainDepth,
  maxChain = GROUP_MAX_BOT_CHAIN,
  random = Math.random,
}: PickReactorInput<T>): T | null {
  if (chainDepth >= maxChain) return null;
  const others = members.filter((m) => m.slug !== lastSpeakerSlug);
  if (others.length === 0) return null;

  const mentioned = findMentionedMembers(lastText, others);
  if (mentioned.length > 0) return mentioned[0];

  const quiet = others.filter((m) => !spokenThisRound.includes(m.slug));
  if (quiet.length === 0) return null;
  const chance = chainDepth === 0 ? 0.25 : 0.1;
  if (random() >= chance) return null;
  return quiet[Math.floor(random() * quiet.length) % quiet.length];
}

export interface GroupIntent<T extends GroupMemberLite> {
  members: T[];
  topic?: string;
  name: string;
}

/** 识别主 bot 频道里的「拉个群 / 建个群聊」并解析成员与话题；不是建群意图时返回 null */
export function detectGroupIntent<T extends GroupMemberLite>(
  text: string,
  candidates: T[]
): GroupIntent<T> | null {
  const trimmed = (text || '').trim();
  if (!trimmed || !GROUP_INTENT_REGEX.test(trimmed)) return null;
  if (candidates.length === 0) return null;

  let members = findMentionedMembers(trimmed, candidates);
  if (members.length === 0 || ALL_MEMBERS_REGEX.test(trimmed)) {
    const rest = candidates.filter((c) => !members.some((m) => m.slug === c.slug));
    members = [...members, ...rest].slice(0, 4);
  }
  if (members.length < 2 && candidates.length >= 2) {
    const extra = candidates.find((c) => c.slug !== members[0]?.slug);
    if (extra) members = [...members, extra];
  }

  const topicMatch = trimmed.match(/(?:聊聊|聊一聊|聊下|聊|讨论|说说|商量|关于|话题[是:：]?)\s*[:：]?\s*(.+)$/);
  let topic = topicMatch?.[1]?.trim().replace(/[。！!～~]+$/, '') || undefined;
  if (topic && findMentionedMembers(topic, candidates).length === members.length && topic.length < 12) {
    // 「聊」后面只跟了人名，不算话题
    topic = undefined;
  }
  if (topic && topic.length < 2) topic = undefined;

  const name = topic
    ? topic.slice(0, 12)
    : `${members.map((m) => m.name.split(/\s+/)[0]).slice(0, 3).join('、')}的群`;

  return { members, topic, name };
}

/**
 * 把群聊记录转换成某个角色视角下的多轮上下文：
 * - 自己说过的话是 assistant
 * - 用户和其他角色的话是 user，并带「名字：」前缀，让模型分得清谁在说
 * - 合并相邻同角色消息，避免上游接口拒绝连续同角色
 */
export function buildGroupTranscriptForSpeaker(
  history: ConversationMessage[],
  speakerSlug: string,
  options: { userName?: string; window?: number } = {}
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const userName = options.userName || '我（群主）';
  const recent = history.slice(-(options.window ?? TRANSCRIPT_WINDOW));
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of recent) {
    const text = (msg.content || '').trim();
    if (!text) continue;
    const isSelf = msg.role === 'assistant' && msg.fromBot?.slug === speakerSlug;
    const role: 'user' | 'assistant' = isSelf ? 'assistant' : 'user';
    const speaker = msg.role === 'user' ? userName : msg.fromBot?.name || '群友';
    const content = isSelf ? text : `${speaker}：${text}`;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n${content}`;
    } else {
      turns.push({ role, content });
    }
  }

  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    turns.push({ role: 'user', content: '（群里安静了一会儿，轮到你接话）' });
  }
  return turns;
}

/** 群聊场景追加到系统提示词的规则 */
export function buildGroupSystemDirective(params: {
  groupName: string;
  topic?: string;
  speakerName: string;
  otherMemberNames: string[];
  replyTo?: { name: string; text: string };
  isKickoff?: boolean;
}): string {
  const others = params.otherMemberNames.join('、') || '其他人';
  const lines = [
    '## 群聊模式（本轮你在微信群里说话）',
    `- 群名「${params.groupName}」，群里有：我（群主，也就是和你单聊的那个人）、${others}，以及你自己（${params.speakerName}）。`,
    params.topic ? `- 这个群的话题：${params.topic}` : '',
    '- 上下文里「名字：内容」是别人说的话，不带前缀的是你自己之前说的。',
    '- 像真实群聊一样说话：一次只发 1~2 条短消息，比单聊更短更随意；可以接别人的话、吐槽、附和或唱反调，必要时用「@名字」点名某个人。',
    '- 不要复述别人刚说过的话，不要总结全场，不要当主持人挨个点名，也不要替别人说话。',
    '- 本轮不要输出 <thought>、[FOLLOWUP]、[EARLY]、[PHOTO] 标签；最多 1 个 [STICKER]。',
  ];
  if (params.replyTo) {
    lines.push(`- 你这次主要是在接 ${params.replyTo.name} 刚说的「${params.replyTo.text.slice(0, 60)}」。`);
  }
  if (params.isKickoff) {
    lines.push('- 群刚建好，你被拉了进来：自然地打个招呼或直接就话题说第一句，别客套。');
  }
  return lines.filter(Boolean).join('\n');
}
