/**
 * 所有 Bot 主动找你：决定「现在该不该有人来找你、该是谁」。纯函数，方便测试。
 *
 * 像真人的几条原则：
 * - 睡觉时间不来（按角色自己的作息，夜猫子例外）；全局 2:00–7:00 一律不发
 * - 刚聊过的不马上又来；上一条主动消息你还没回，就不再追发
 * - 越亲密、越久没聊、心情越高涨、有「该问结果的事」的，越可能来找你
 * - 每个角色每天有上限（亲密度低的更少），所有角色之间至少隔 20 分钟，不会同时刷屏
 * - 每次检查只按一定概率出手，避免像闹钟一样准点
 */

export type Availability = 'free' | 'busy' | 'asleep';

export interface OutreachCandidate {
  slug: string;
  name: string;
  /** 0–100 */
  intimacy: number;
  /** PAD 的激活度 0–1，越高越想说话 */
  arousal?: number;
  /** PAD 的愉悦度 0–1 */
  pleasure?: number;
  availability: Availability;
  /** 补发时按那个时刻的作息判断（不传就用 availability） */
  availabilityAt?: (d: Date) => Availability;
  /** 你和 TA 最后一条消息（不论谁发的）的时间 */
  lastMessageAt?: string;
  /** 最后一条是 TA 发的主动消息、你还没回 */
  awaitingReplyToProactive: boolean;
  /** 有你之前提过、现在该有结果的事 */
  hasDueTopic: boolean;
  /** 你在资料库里关掉了「允许 TA 主动找我」 */
  optedOut?: boolean;
}

export interface OutreachLogEntry {
  slug: string;
  at: string;
}

export interface OutreachState {
  log: OutreachLogEntry[];
  /** 上次工作台开着、检查过主动消息的时间（用来判断你离开了多久） */
  lastSeenAt?: string;
}

export const OUTREACH_CONFIG = {
  /** 所有角色之间两条主动消息的最小间隔 */
  globalGapMs: 20 * 60_000,
  /** 和某个角色刚聊过多久内不主动（有该问结果的事时缩短） */
  recentChatGapMs: 3 * 3600_000,
  dueTopicGapMs: 1 * 3600_000,
  /** 每次检查真正出手的概率 */
  fireProbability: 0.4,
  /** 离开多久算「你不在时」，打开时补发 */
  catchupAfterMs: 3 * 3600_000,
  catchupMax: 2,
  /** 日志保留多久 */
  logKeepMs: 3 * 24 * 3600_000,
  quietStartHour: 2,
  quietEndHour: 7,
};

export function dailyCapFor(intimacy: number): number {
  if (intimacy >= 80) return 3;
  if (intimacy >= 40) return 2;
  return 1;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isQuietHour(d: Date): boolean {
  const h = d.getHours();
  return h >= OUTREACH_CONFIG.quietStartHour && h < OUTREACH_CONFIG.quietEndHour;
}

export function pruneLog(log: OutreachLogEntry[], now: Date): OutreachLogEntry[] {
  return log.filter((e) => now.getTime() - new Date(e.at).getTime() < OUTREACH_CONFIG.logKeepMs);
}

/** 这个角色此刻是否「有资格」来找你；返回 null 表示可以，否则是原因 */
export function blockReason(
  c: OutreachCandidate,
  ctx: { now: Date; log: OutreachLogEntry[]; activeSlug?: string }
): string | null {
  const { now, log } = ctx;
  if (c.optedOut) return '你关掉了 TA 的主动消息';
  if (c.slug === 'master-bot') return '主控 bot 不主动闲聊';
  if (c.slug === ctx.activeSlug) return '你正在和 TA 聊';
  const availability = c.availabilityAt ? c.availabilityAt(now) : c.availability;
  if (availability === 'asleep') return 'TA 在睡觉';
  if (c.awaitingReplyToProactive) return '上一条主动消息你还没回';
  if (c.lastMessageAt) {
    const since = now.getTime() - new Date(c.lastMessageAt).getTime();
    const gap = c.hasDueTopic ? OUTREACH_CONFIG.dueTopicGapMs : OUTREACH_CONFIG.recentChatGapMs;
    if (since < gap) return '刚聊过';
  }
  const today = log.filter((e) => e.slug === c.slug && sameLocalDay(new Date(e.at), now)).length;
  if (today >= dailyCapFor(c.intimacy)) return '今天已经找过你几次了';
  return null;
}

/** 谁更想来找你（越大越优先） */
export function outreachScore(c: OutreachCandidate, now: Date, random: () => number): number {
  const hours = c.lastMessageAt ? (now.getTime() - new Date(c.lastMessageAt).getTime()) / 3600_000 : 24;
  return (
    (c.intimacy / 100) * 1.0 +
    (Math.min(hours, 36) / 36) * 0.7 +
    (c.hasDueTopic ? 0.8 : 0) +
    (c.arousal ?? 0.5) * 0.3 +
    (c.pleasure ?? 0.5) * 0.15 +
    (c.availability === 'busy' ? -0.35 : 0) +
    random() * 0.6
  );
}

export interface OutreachPick {
  slug: string;
  /** 这条消息的时间（catchup 时落在你离开的空档里） */
  at: Date;
}

/**
 * 应用开着时的一次例行检查：最多选一个角色来找你。
 */
export function decideOutreachTick(params: {
  candidates: OutreachCandidate[];
  state: OutreachState;
  now: Date;
  activeSlug?: string;
  random?: () => number;
}): OutreachPick | null {
  const { candidates, state, now, activeSlug } = params;
  const random = params.random ?? Math.random;
  if (isQuietHour(now)) return null;
  const log = pruneLog(state.log, now);
  const lastAny = log.reduce((m, e) => Math.max(m, new Date(e.at).getTime()), 0);
  if (lastAny && now.getTime() - lastAny < OUTREACH_CONFIG.globalGapMs) return null;
  if (random() > OUTREACH_CONFIG.fireProbability) return null;

  const eligible = candidates.filter((c) => blockReason(c, { now, log, activeSlug }) === null);
  if (eligible.length === 0) return null;
  const best = eligible
    .map((c) => ({ c, s: outreachScore(c, now, random) }))
    .sort((a, b) => b.s - a.s)[0];
  return { slug: best.c.slug, at: now };
}

/**
 * 你离开好几个小时后打开工作台：补上「你不在时」最多两条主动消息，
 * 时间落在空档里、避开安静时段、彼此至少隔 20 分钟。
 */
export function decideOutreachCatchup(params: {
  candidates: OutreachCandidate[];
  state: OutreachState;
  now: Date;
  activeSlug?: string;
  random?: () => number;
}): OutreachPick[] {
  const { candidates, state, now, activeSlug } = params;
  const random = params.random ?? Math.random;
  if (!state.lastSeenAt) return [];
  const gapStart = new Date(state.lastSeenAt).getTime();
  const gapMs = now.getTime() - gapStart;
  if (gapMs < OUTREACH_CONFIG.catchupAfterMs) return [];

  const log = pruneLog(state.log, now);
  const picks: OutreachPick[] = [];
  const usedTimes: number[] = [];
  const ranked = candidates
    .map((c) => ({ c, s: outreachScore(c, now, random) }))
    .sort((a, b) => b.s - a.s)
    .map((r) => r.c);

  for (const c of ranked) {
    if (picks.length >= OUTREACH_CONFIG.catchupMax) break;
    // 在空档里找一个合适的时刻：离开后至少 1 小时、离现在至少 10 分钟、不在安静时段、和别的错开
    let at: Date | null = null;
    for (let attempt = 0; attempt < 8 && !at; attempt += 1) {
      const lo = gapStart + 3600_000;
      const hi = now.getTime() - 10 * 60_000;
      if (hi <= lo) break;
      const t = lo + random() * (hi - lo);
      const d = new Date(t);
      if (isQuietHour(d)) continue;
      if (usedTimes.some((u) => Math.abs(u - t) < OUTREACH_CONFIG.globalGapMs)) continue;
      at = d;
    }
    if (!at) continue;
    // 按那个时刻判断资格（那时 TA 可能在睡觉、那天的次数等）
    if (blockReason(c, { now: at, log, activeSlug }) !== null) continue;
    picks.push({ slug: c.slug, at });
    usedTimes.push(at.getTime());
  }
  return picks.sort((a, b) => a.at.getTime() - b.at.getTime());
}
