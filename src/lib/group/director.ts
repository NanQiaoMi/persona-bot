/**
 * 群聊发言调度器（纯函数，无 IO）：
 * - 判断主 bot 频道里的一句话是不是「拉个群」
 * - 每轮决定谁开口、按什么顺序开口
 * - 决定角色之间要不要互相接话（限制连锁轮数，防止刷屏）
 * - 把群聊记录转换成某个角色视角下的对话上下文
 */
import {
  extractOpener,
  findEchoedOpener,
  openerKey,
  WATCHED_PHRASES,
} from '@/lib/persona/repetition-guard';
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
/** 输入框里选了「@所有人」：群里每个 Bot 都要回 */
export const MENTION_ALL_TOKEN = '@所有人';
const MENTION_ALL_REGEX = /@(所有人|全体成员|全体|all)(?![A-Za-z])/i;

export function mentionsAll(text: string): boolean {
  return MENTION_ALL_REGEX.test(text || '');
}

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
  /** 每个成员此刻的状态；睡着的人不主动回，忙的人少回 */
  availabilityOf?: (slug: string) => 'free' | 'busy' | 'asleep';
  /** 闹别扭等级 (0~3)；>=2 降低发言意愿，>=3 不作为旁观闲聊插话者 */
  sulkingLevelOf?: (slug: string) => number;
}

/**
 * 决定本轮谁开口：
 * 1. 被点名的人一定先说（按点名顺序）
 * 2. 叫「大家/你们」时，最多 maxSpeakers 人都回
 * 3. 否则挑 1 人主接，按概率再补 1 人插话——像真实群聊，不是每个人都回每句话
 */
/** 被吵醒后算作醒着的时长：这段时间内在群里说过话的人不再按作息当成在睡 */
export const GROUP_RECENTLY_AWAKE_MINUTES = 15;

/** 最近一段时间内在群里说过话的成员（不含灰色提示） */
export function recentlyActiveSlugs(
  history: Array<{ fromBot?: { slug: string }; systemTip?: boolean; timestamp: string }>,
  now: Date,
  windowMinutes = GROUP_RECENTLY_AWAKE_MINUTES
): Set<string> {
  const since = now.getTime() - windowMinutes * 60_000;
  const out = new Set<string>();
  for (const m of history) {
    if (!m.fromBot || m.systemTip) continue;
    const t = new Date(m.timestamp).getTime();
    if (Number.isFinite(t) && t >= since && t <= now.getTime() + 60_000) out.add(m.fromBot.slug);
  }
  return out;
}

/** 这句话是不是在喊所有人（你们 / 大家 / 各位…） */
export function addressesEveryone(text: string): boolean {
  return EVERYONE_REGEX.test(text || '');
}

/** 喊了所有人、但有人睡着没回时的灰色提示 */
export function buildSleepingTip(names: string[]): string {
  if (names.length === 0) return '';
  return `${names.join('、')} 这个点已经睡了`;
}

export function pickSpeakers<T extends GroupMemberLite>({
  text,
  members,
  history,
  maxSpeakers = GROUP_MAX_SPEAKERS,
  random = Math.random,
  availabilityOf,
  sulkingLevelOf,
}: PickSpeakersInput<T>): T[] {
  if (members.length === 0) return [];

  // 被点名的人即使在睡觉也会（迷迷糊糊地）回；没被点名的睡着的人不出声
  const mentioned = findMentionedMembers(text, members);
  const awake = availabilityOf
    ? members.filter((m) => availabilityOf(m.slug) !== 'asleep')
    : members;
  // 大家都睡了也至少有一个人被吵醒回一句，不然群像坏了一样
  const pool = awake.length > 0 ? awake : [members[Math.floor(random() * members.length) % members.length]];
  const cap = Math.max(1, Math.min(maxSpeakers, pool.length + mentioned.length));

  const ranked = [...pool]
    .map((m) => {
      const sulkLevel = sulkingLevelOf?.(m.slug) ?? 0;
      const sulkWeight = sulkLevel >= 3 ? 0.25 : sulkLevel >= 2 ? 0.4 : 1;
      return {
        member: m,
        score:
          (topicRelevance(text, m) * 2 +
            Math.min(turnsSinceSpoke(history, m.slug), 8) * 0.35 +
            random() * 0.9) *
          (availabilityOf?.(m.slug) === 'busy' ? 0.5 : 1) *
          sulkWeight,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((r) => r.member);

  // @所有人：每个人都回（睡着的也被吵醒），被单独点名的先说，其余按相关度排，醒着的在前
  if (mentionsAll(text)) {
    const rest = ranked.filter((m) => !mentioned.some((x) => x.slug === m.slug));
    const sleepers = members.filter(
      (m) => !mentioned.some((x) => x.slug === m.slug) && !rest.some((x) => x.slug === m.slug)
    );
    return [...mentioned, ...rest, ...sleepers];
  }

  if (mentioned.length > 0) {
    const result = mentioned.slice(0, Math.max(1, Math.min(maxSpeakers, mentioned.length)));
    // 点名一个人时，偶尔有醒着且未冷战的人忍不住插一句
    if (result.length === 1 && maxSpeakers > 1 && random() < 0.3) {
      const extra = ranked.find(
        (m) => m.slug !== result[0].slug && (sulkingLevelOf?.(m.slug) ?? 0) < 3
      );
      if (extra) result.push(extra);
    }
    return result;
  }

  if (EVERYONE_REGEX.test(text)) {
    const picked = ranked.slice(0, cap);
    // 喊了「你们 / 大家」：睡着的人里有一个被吵醒，迷迷糊糊回一句
    const sleepers = availabilityOf
      ? members.filter((m) => availabilityOf(m.slug) === 'asleep' && !picked.includes(m))
      : [];
    if (awake.length > 0 && sleepers.length > 0 && picked.length < maxSpeakers) {
      picked.push(sleepers[Math.floor(random() * sleepers.length) % sleepers.length]);
    }
    return picked;
  }

  const result = [ranked[0]];
  const isLongOrQuestion = text.trim().length > 14 || /[?？吗呢么]$/.test(text.trim());
  const second = ranked[1];
  if (
    cap >= 2 &&
    second &&
    (sulkingLevelOf?.(second.slug) ?? 0) < 3 &&
    random() < (isLongOrQuestion ? 0.6 : 0.35)
  ) {
    result.push(second);
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
    // 图片在文字里标出来（最近一张会以真实图片一起发给模型）
    const withImage = msg.imageUrl ? `[发了一张图片] ${text === '[图片]' ? '' : text}`.trim() : text;
    const content = isSelf ? withImage : `${speaker}：${withImage}`;
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
    `- 回复时不要加自己的名字前缀（不要写「${params.speakerName}：」），直接说内容。`,
    '- 像真实群聊一样说话：一次只发 1~2 条短消息，比单聊更短更随意；可以接别人的话、吐槽、附和或唱反调，必要时用「@名字」点名某个人。',
    '- 不要复述别人刚说过的话，不要总结全场，不要当主持人挨个点名，也不要替别人说话。',
    '- 本轮不要输出 <thought>、[FOLLOWUP]、[EARLY] 标签；可以用 1 个 [STICKER: 表情包动作] 斗图；只有群主明确让你发照片 / 自拍时才用 1 个 [PHOTO: 画面描述]。',
  ];
  if (params.replyTo) {
    lines.push(`- 你这次主要是在接 ${params.replyTo.name} 刚说的「${params.replyTo.text.slice(0, 60)}」。`);
  }
  if (params.isKickoff) {
    lines.push('- 群刚建好，你被拉了进来：自然地打个招呼或直接就话题说第一句，别客套。');
  }
  return lines.filter(Boolean).join('\n');
}

/** 群里其他角色发过的一条气泡 */
export interface GroupPeerBubble {
  name: string;
  text: string;
  /** 是不是本轮（用户这次发言之后）刚发的 */
  thisRound: boolean;
}

const PEER_WINDOW = 8;

/**
 * 收集当前发言人「看得到、容易被带跑」的群友气泡：
 * 本轮已经发出的全部算上，再加最近约 8 条其他角色的消息（不含自己、不含用户）。
 */
export function collectGroupPeerBubbles(
  history: ConversationMessage[],
  speakerSlug: string,
  thisRoundIds: Iterable<string>,
  options: { window?: number } = {}
): GroupPeerBubble[] {
  const roundIds = new Set(thisRoundIds);
  const window = options.window ?? PEER_WINDOW;
  const peers = history.filter(
    (m) => m.role === 'assistant' && m.fromBot?.slug && m.fromBot.slug !== speakerSlug && (m.content || '').trim()
  );
  const recent = peers.slice(-window);
  const picked = peers.filter((m) => roundIds.has(m.id) || recent.includes(m));
  return picked.map((m) => ({
    name: m.fromBot?.name || '群友',
    text: m.content.trim(),
    thisRound: roundIds.has(m.id),
  }));
}

/** 本轮群友已经用过的短开头（用于兜底去重） */
export function collectRoundOpeners(peers: GroupPeerBubble[]): string[] {
  const seen = new Map<string, string>();
  for (const p of peers) {
    if (!p.thisRound) continue;
    const opener = extractOpener(p.text);
    const key = opener ? openerKey(opener) : null;
    if (opener && key && !seen.has(key)) seen.set(key, opener);
  }
  return [...seen.values()];
}

/**
 * 群聊防撞词：群友刚用过的开头、口头禅，提醒当前发言人别跟着复读。
 * 没有可撞的内容时返回空字符串（不往提示词里塞废话）。
 */
export function buildGroupAntiEchoDirective(params: { peers: GroupPeerBubble[] }): string {
  const peers = params.peers.filter((p) => p.text.trim());
  if (peers.length === 0) return '';

  // 1. 开头：本轮的排前面，同一个起手只记一次
  const openers: Array<{ text: string; key: string; names: Set<string>; thisRound: boolean }> = [];
  const ordered = [...peers.filter((p) => p.thisRound), ...peers.filter((p) => !p.thisRound)];
  for (const p of ordered) {
    const opener = extractOpener(p.text);
    const key = opener ? openerKey(opener) : null;
    if (!opener || !key) continue;
    const hit = openers.find((o) => o.key === key || findEchoedOpener(p.text, [o.text]));
    if (hit) {
      hit.names.add(p.name);
      continue;
    }
    openers.push({ text: opener, key, names: new Set([p.name]), thisRound: p.thisRound });
  }

  // 2. 口头禅：本轮出现过一次就算，最近消息里出现 ≥2 次才算
  const phrases: string[] = [];
  for (const phrase of WATCHED_PHRASES) {
    if (phrase.length < 2) continue;
    const inRound = peers.some((p) => p.thisRound && p.text.includes(phrase));
    const recentCount = peers.filter((p) => p.text.includes(phrase)).length;
    if (!inRound && recentCount < 2) continue;
    if (openers.some((o) => o.key.includes(phrase) || phrase.includes(o.key))) continue;
    if (phrases.some((x) => x.includes(phrase) || phrase.includes(x))) continue;
    phrases.push(phrase);
  }

  const roundOpeners = openers.filter((o) => o.thisRound).slice(0, 4);
  const recentOpeners = openers.filter((o) => !o.thisRound).slice(0, 3);
  if (roundOpeners.length === 0 && recentOpeners.length === 0 && phrases.length === 0) return '';

  const fmt = (list: typeof openers) =>
    list.map((o) => `「${o.text}」（${[...o.names].join('、')}）`).join('、');
  const lines = ['## 别跟群友撞词'];
  if (roundOpeners.length > 0) {
    lines.push(`- 群里刚才已经有人用 ${fmt(roundOpeners)} 开头了，你换个开头，别跟别人一个起手。`);
  }
  if (recentOpeners.length > 0) {
    lines.push(`- 前面几条群友也用过 ${fmt(recentOpeners)} 开头，尽量别再用。`);
  }
  if (phrases.length > 0) {
    lines.push(`- ${phrases.slice(0, 4).map((p) => `「${p}」`).join('')}这些词群里刚有人说过，你别跟着复读，用你自己的说法。`);
  }
  lines.push('- 真人群聊里每个人说话习惯不一样，不会一个接一个地用同一个词开场。');
  return lines.join('\n');
}

/**
 * 兜底：第一条气泡仍以本轮群友刚用过的短开头起手时，把这个开头去掉。
 * 保守处理——去掉后剩下的实质内容不足 4 个字就原样返回，绝不把整句删光。
 */
export function stripEchoedOpener(bubble: string, roundOpeners: string[]): string {
  if (!bubble || roundOpeners.length === 0) return bubble;
  const echoed = findEchoedOpener(bubble, roundOpeners);
  if (!echoed) return bubble;
  const opener = extractOpener(bubble);
  if (!opener || opener.length > 4) return bubble;
  const trimmed = bubble.trim();
  const start = trimmed.indexOf(opener);
  if (start < 0) return bubble;
  const rest = trimmed
    .slice(start + opener.length)
    .replace(/^[\s…。.，,！!？?~～、]+/, '');
  const substance = rest.replace(/[\s\p{P}\p{S}]/gu, '');
  if (substance.length < 4) return bubble;
  return rest;
}
