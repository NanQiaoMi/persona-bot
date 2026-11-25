/**
 * 群聊「自己聊起来」的规划（纯函数，无 IO，random/now 可注入）：
 * - 什么时候可以自己聊：你停在群里一会儿没说话（idle），或隔了几小时再打开（catchup）
 * - 一场闲聊怎么展开：谁起头、聊什么、谁接、要不要附和一句或拍一拍
 * - 「你不在时」的消息落在这段空档里的什么时间、那时谁醒着
 * 热闹程度按「适中」档：冷却 2 分钟、每小时最多 6 场；隔 2 小时以上才补聊。
 */
import { getPresenceState, type PresenceSubject } from '@/lib/persona/daily-rhythm';
import type { Availability } from '@/lib/persona/rhythm-types';
import type { ConversationMessage, GroupChat } from '@/lib/storage/types';
import type { AmbientSeedKind } from './ambient-lines';

export type RandomFn = () => number;
export type AmbientMode = 'idle' | 'catchup';

export const AMBIENT_CONFIG = {
  /** 你停留且没说话多久后，可以有人起话题 */
  idleAfterMs: 75_000,
  /** 群里最后一条消息至少过去多久（避免刚聊完又自己接着刷） */
  quietAfterMs: 60_000,
  /** 两场自发闲聊之间的冷却 */
  cooldownMs: 120_000,
  /** 每小时最多几场 */
  maxScenesPerHour: 6,
  /** 隔多久再打开群会补上「你不在时」的聊天 */
  catchupGapMs: 2 * 3600_000,
  /** 一场 idle 闲聊最多几条消息（含附和与拍一拍） */
  idleMaxMessages: 5,
  /** 补聊最少 / 最多几条 */
  catchupMinMessages: 3,
  catchupMaxMessages: 8,
};

export interface AmbientDecision {
  ok: boolean;
  reason: string;
}

function lastMessageTime(history: ConversationMessage[]): number {
  const last = history[history.length - 1];
  return last ? new Date(last.timestamp).getTime() || 0 : 0;
}

/** 是否允许这一次自发闲聊 */
export function decideAmbient(params: {
  mode: AmbientMode;
  group: Pick<GroupChat, 'ambientLog' | 'createdAt'>;
  history: ConversationMessage[];
  now: Date;
  /** idle：前端测得你多久没说话、没打字 */
  userIdleMs?: number;
  memberCount: number;
}): AmbientDecision {
  const { mode, group, history, now } = params;
  const t = now.getTime();
  if (params.memberCount < 2) return { ok: false, reason: '群里少于 2 个角色' };

  const log = (group.ambientLog || []).map((s) => new Date(s).getTime()).filter((n) => n > 0);
  const lastAmbient = log.length ? Math.max(...log) : 0;
  const lastMsg = lastMessageTime(history);

  if (mode === 'catchup') {
    const sinceLast = t - (lastMsg || new Date(group.createdAt).getTime() || t);
    if (sinceLast < AMBIENT_CONFIG.catchupGapMs) return { ok: false, reason: '离上次聊天还不到 2 小时' };
    if (lastAmbient && lastAmbient > lastMsg) return { ok: false, reason: '这段空档已经补过了' };
    return { ok: true, reason: 'catchup' };
  }

  if ((params.userIdleMs ?? 0) < AMBIENT_CONFIG.idleAfterMs) return { ok: false, reason: '你刚刚还在说话或打字' };
  if (t - lastMsg < AMBIENT_CONFIG.quietAfterMs) return { ok: false, reason: '群里刚有人说过话' };
  const last = history[history.length - 1];
  if (last && last.role === 'user') return { ok: false, reason: '你的话还没人接，先不自己聊' };
  if (lastAmbient && t - lastAmbient < AMBIENT_CONFIG.cooldownMs) return { ok: false, reason: '冷却中' };
  const lastHour = log.filter((n) => t - n < 3600_000).length;
  if (lastHour >= AMBIENT_CONFIG.maxScenesPerHour) return { ok: false, reason: '这一小时聊得够多了' };
  return { ok: true, reason: 'idle' };
}

/** 记录一次自发闲聊（只保留最近一小时内的） */
export function appendAmbientLog(log: string[] | undefined, now: Date): string[] {
  const t = now.getTime();
  return [...(log || []).filter((s) => t - new Date(s).getTime() < 3600_000), now.toISOString()].slice(-12);
}

export interface AmbientMember extends PresenceSubject {
  slug: string;
  name: string;
}

export interface SeedContext {
  groupTopic?: string;
  /** 每个角色最近一条朋友圈（可选） */
  recentMoments?: Record<string, string | undefined>;
  history: ConversationMessage[];
}

export interface AmbientSeed {
  kind: AmbientSeedKind;
  /** 用于填进话术 / 提示词的具体内容 */
  activity?: string;
  moment?: string;
  topic?: string;
  /** tease 的对象（成员名） */
  targetName?: string;
  /** callback 引用的旧消息 */
  quote?: { id: string; name: string; text: string };
}

export type AmbientStep =
  | { type: 'starter'; slug: string; seed: AmbientSeed }
  | { type: 'reply'; slug: string; replyToSlug: string }
  | { type: 'react'; slug: string }
  | { type: 'pat'; slug: string; targetSlug: string };

export interface AmbientScene {
  /** 这场闲聊发生的时刻（idle 为现在，catchup 为空档里的某个时间） */
  at: Date;
  steps: AmbientStep[];
}

function pick<T>(items: T[], random: RandomFn): T {
  return items[Math.floor(random() * items.length) % items.length];
}

function availabilityWeight(a: Availability): number {
  return a === 'free' ? 1 : a === 'busy' ? 0.35 : 0;
}

function shortName(name: string): string {
  return name.split(/\s+/)[0];
}

/** 找一条值得翻出来再聊的旧消息：不是最近 6 条、有一定长度、不是系统提示 */
function pickCallbackMessage(history: ConversationMessage[], random: RandomFn): ConversationMessage | null {
  const older = history.slice(0, -6).filter((m) => !m.systemTip && (m.content || '').trim().length >= 8);
  if (older.length === 0) return null;
  return pick(older.slice(-20), random);
}

/** 起头的人聊什么 */
export function chooseSeed(params: {
  starter: AmbientMember;
  others: AmbientMember[];
  at: Date;
  ctx: SeedContext;
  random: RandomFn;
  allowPingOwner?: boolean;
}): AmbientSeed {
  const { starter, others, at, ctx, random } = params;
  const presence = getPresenceState(starter, at);
  const options: Array<{ w: number; seed: () => AmbientSeed }> = [
    { w: 3, seed: () => ({ kind: 'activity', activity: presence.activity }) },
    { w: 2, seed: () => ({ kind: 'daily' }) },
  ];
  const moment = ctx.recentMoments?.[starter.slug];
  if (moment) options.push({ w: 2, seed: () => ({ kind: 'moment', moment: moment.slice(0, 40) }) });
  if (ctx.groupTopic) options.push({ w: 1.5, seed: () => ({ kind: 'topic', topic: ctx.groupTopic }) });
  if (others.length > 0) {
    options.push({ w: 1.5, seed: () => ({ kind: 'tease', targetName: shortName(pick(others, random).name) }) });
  }
  const callback = pickCallbackMessage(ctx.history, random);
  if (callback) {
    options.push({
      w: 1,
      seed: () => ({
        kind: 'callback',
        quote: {
          id: callback.id,
          name: callback.role === 'user' ? '群主' : callback.fromBot?.name || '群友',
          text: callback.content.slice(0, 40),
        },
      }),
    });
  }
  if (params.allowPingOwner) options.push({ w: 1, seed: () => ({ kind: 'ping_owner' }) });

  const total = options.reduce((acc, o) => acc + o.w, 0);
  let r = random() * total;
  for (const o of options) {
    r -= o.w;
    if (r <= 0) return o.seed();
  }
  return options[0].seed();
}

/**
 * 规划一场闲聊：按此刻作息挑一个醒着的人起头（闲的人更可能），
 * 再让 1~3 个人接话（忙的人少接），偶尔有人附和一句或拍一拍。
 * 醒着的人不足 2 个时返回 null（大家都睡了，群就安静着）。
 */
export function planAmbientScene(params: {
  members: AmbientMember[];
  at: Date;
  ctx: SeedContext;
  maxMessages: number;
  random?: RandomFn;
  allowPingOwner?: boolean;
}): AmbientScene | null {
  const random = params.random ?? Math.random;
  const awake = params.members
    .map((m) => ({ m, a: getPresenceState(m, params.at).availability }))
    .filter((x) => x.a !== 'asleep');
  if (awake.length < 2) return null;

  // 起头：按忙闲加权，尽量不是群里最后说话的那个人
  const lastSpeaker = [...params.ctx.history].reverse().find((m) => m.fromBot?.slug)?.fromBot?.slug;
  const weighted = awake.map((x) => ({ ...x, w: availabilityWeight(x.a) * (x.m.slug === lastSpeaker ? 0.4 : 1) }));
  const total = weighted.reduce((acc, x) => acc + x.w, 0);
  let r = random() * total;
  let starter = weighted[0];
  for (const x of weighted) {
    r -= x.w;
    if (r <= 0) {
      starter = x;
      break;
    }
  }

  const others = awake.filter((x) => x.m.slug !== starter.m.slug);
  const seed = chooseSeed({
    starter: starter.m,
    others: others.map((x) => x.m),
    at: params.at,
    ctx: params.ctx,
    random,
    allowPingOwner: params.allowPingOwner,
  });

  const steps: AmbientStep[] = [{ type: 'starter', slug: starter.m.slug, seed }];
  const budget = Math.max(2, params.maxMessages);

  // tease 时被点名的人优先接
  const target = seed.kind === 'tease' ? others.find((x) => shortName(x.m.name) === seed.targetName) : undefined;
  const replyOrder = [
    ...(target ? [target] : []),
    ...others.filter((x) => x !== target).sort(() => random() - 0.5),
  ];

  let lastSlug = starter.m.slug;
  for (const x of replyOrder) {
    if (steps.length >= budget) break;
    const chance = x === target ? 1 : x.a === 'busy' ? 0.35 : 0.75;
    if (steps.length > 1 && random() >= chance) continue;
    steps.push({ type: 'reply', slug: x.m.slug, replyToSlug: lastSlug });
    lastSlug = x.m.slug;
  }
  // 起头的人有时会回一句接住话题
  if (steps.length >= 2 && steps.length < budget && random() < 0.45) {
    steps.push({ type: 'reply', slug: starter.m.slug, replyToSlug: lastSlug });
  }
  // 偶尔附和一句（不需要模型）
  if (steps.length < budget && random() < 0.3) {
    // 附和的人不能是刚说完话的那个人（不会自己附和自己）
    const lastSlugInScene = steps[steps.length - 1].slug;
    const candidates = awake.filter((x) => x.m.slug !== lastSlugInScene);
    if (candidates.length > 0) steps.push({ type: 'react', slug: pick(candidates, random).m.slug });
  }
  // 少见的拍一拍
  if (steps.length < budget && random() < 0.12) {
    const from = pick(awake, random).m;
    const to = pick(awake.filter((x) => x.m.slug !== from.slug), random)?.m;
    if (to) steps.push({ type: 'pat', slug: from.slug, targetSlug: to.slug });
  }

  // 保证至少有一个人接了话（否则就不是闲聊，只是自言自语）
  if (!steps.some((s) => s.type === 'reply') && others.length > 0) {
    steps.splice(1, 0, { type: 'reply', slug: others[0].m.slug, replyToSlug: starter.m.slug });
  }
  return { at: params.at, steps: steps.slice(0, budget) };
}

/**
 * 「你不在时」的场次：在空档里找 1~2 个至少两人醒着的时间点，
 * 每场分到一部分消息配额；时间点按先后排列。
 */
export function planCatchupScenes(params: {
  members: AmbientMember[];
  gapStart: Date;
  now: Date;
  ctx: SeedContext;
  random?: RandomFn;
}): AmbientScene[] {
  const random = params.random ?? Math.random;
  const start = params.gapStart.getTime();
  const end = params.now.getTime() - 5 * 60_000;
  if (end - start < 30 * 60_000) return [];

  const total = AMBIENT_CONFIG.catchupMinMessages +
    Math.floor(random() * (AMBIENT_CONFIG.catchupMaxMessages - AMBIENT_CONFIG.catchupMinMessages + 1));
  const sceneCount = total >= 6 && end - start > 3 * 3600_000 ? 2 : 1;

  // 在空档里采样，找有至少两人醒着的时间点
  const candidates: Date[] = [];
  for (let i = 0; i < 24; i += 1) {
    const at = new Date(start + (end - start) * ((i + random()) / 24));
    const awake = params.members.filter((m) => getPresenceState(m, at).availability !== 'asleep');
    if (awake.length >= 2) candidates.push(at);
  }
  if (candidates.length === 0) return [];

  const chosen: Date[] = [];
  for (let i = 0; i < sceneCount; i += 1) {
    const segment = candidates.filter((d) => {
      const frac = (d.getTime() - start) / (end - start);
      return frac >= i / sceneCount && frac < (i + 1) / sceneCount;
    });
    const pool = segment.length > 0 ? segment : candidates;
    chosen.push(pick(pool, random));
  }
  chosen.sort((a, b) => a.getTime() - b.getTime());

  const scenes: AmbientScene[] = [];
  let remaining = total;
  chosen.forEach((at, idx) => {
    const quota = idx === chosen.length - 1 ? remaining : Math.ceil(total / chosen.length);
    remaining -= quota;
    const scene = planAmbientScene({
      members: params.members,
      at,
      ctx: params.ctx,
      maxMessages: Math.max(2, quota),
      random,
      allowPingOwner: idx === chosen.length - 1,
    });
    if (scene) scenes.push(scene);
  });
  return scenes;
}

/** 一场闲聊里每条消息之间隔多久（catchup 用来生成时间戳，idle 用于前端播放节奏） */
export function stepGapMs(
  step: AmbientStep,
  random: RandomFn = Math.random,
  mode: AmbientMode = 'catchup'
): number {
  if (step.type === 'react') return 2_000 + random() * (mode === 'idle' ? 4_000 : 10_000);
  if (step.type === 'pat') return 2_000 + random() * 5_000;
  // 你在看着的时候节奏快一些（4~15 秒），补聊的历史消息间隔更自然（8~58 秒）
  return mode === 'idle' ? 4_000 + random() * 11_000 : 8_000 + random() * 50_000;
}
