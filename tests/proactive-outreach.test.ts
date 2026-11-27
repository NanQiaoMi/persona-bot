import { describe, expect, it } from 'vitest';
import {
  blockReason,
  dailyCapFor,
  decideOutreachCatchup,
  decideOutreachTick,
  OUTREACH_CONFIG,
  type OutreachCandidate,
} from '@/lib/proactive/scheduler';

const at = (h: number, m = 0, day = 26) => new Date(2026, 10, day, h, m);
const iso = (d: Date) => d.toISOString();
const always = () => 0; // random()=0：一定出手，且不加随机分

function cand(slug: string, over: Partial<OutreachCandidate> = {}): OutreachCandidate {
  return {
    slug,
    name: slug,
    intimacy: 60,
    availability: 'free',
    lastMessageAt: iso(at(9)),
    awaitingReplyToProactive: false,
    hasDueTopic: false,
    ...over,
  };
}

describe('主动消息：谁有资格', () => {
  const now = at(15);
  it('睡着、刚聊过、正在聊、没回上条、关掉了的都不来', () => {
    expect(blockReason(cand('a', { availability: 'asleep' }), { now, log: [] })).toBe('TA 在睡觉');
    expect(blockReason(cand('a', { lastMessageAt: iso(at(14)) }), { now, log: [] })).toBe('刚聊过');
    expect(blockReason(cand('a'), { now, log: [], activeSlug: 'a' })).toBe('你正在和 TA 聊');
    expect(blockReason(cand('a', { awaitingReplyToProactive: true }), { now, log: [] })).toBe('上一条主动消息你还没回');
    expect(blockReason(cand('a', { optedOut: true }), { now, log: [] })).toBe('你关掉了 TA 的主动消息');
    expect(blockReason(cand('master-bot'), { now, log: [] })).not.toBeNull();
  });
  it('有该问结果的事时，1 小时后就可以来', () => {
    expect(blockReason(cand('a', { lastMessageAt: iso(at(13, 30)), hasDueTopic: true }), { now, log: [] })).toBeNull();
  });
  it('每天次数按亲密度封顶', () => {
    expect(dailyCapFor(90)).toBe(3);
    expect(dailyCapFor(50)).toBe(2);
    expect(dailyCapFor(20)).toBe(1);
    const log = [{ slug: 'a', at: iso(at(10)) }, { slug: 'a', at: iso(at(12)) }];
    expect(blockReason(cand('a', { intimacy: 50 }), { now, log })).toBe('今天已经找过你几次了');
    expect(blockReason(cand('a', { intimacy: 90 }), { now, log })).toBeNull();
  });
});

describe('主动消息：例行检查', () => {
  it('安静时段（2–7 点）不发', () => {
    expect(decideOutreachTick({ candidates: [cand('a')], state: { log: [] }, now: at(3), random: always })).toBeNull();
  });
  it('20 分钟内已经有人找过你，就不再有人来（不刷屏）', () => {
    const state = { log: [{ slug: 'b', at: iso(at(14, 50)) }] };
    expect(decideOutreachTick({ candidates: [cand('a')], state, now: at(15), random: always })).toBeNull();
  });
  it('一次最多一个人；更亲密、有事要问的优先', () => {
    const pick = decideOutreachTick({
      candidates: [cand('a', { intimacy: 30 }), cand('b', { intimacy: 85, hasDueTopic: true })],
      state: { log: [] },
      now: at(15),
      random: always,
    });
    expect(pick?.slug).toBe('b');
  });
  it('按概率出手，不是每次检查都来', () => {
    const never = () => 0.99;
    expect(decideOutreachTick({ candidates: [cand('a')], state: { log: [] }, now: at(15), random: never })).toBeNull();
  });
});

describe('主动消息：离开几小时后补发', () => {
  it('最多两条，时间落在空档里、互相错开、不在安静时段', () => {
    let x = 7;
    const rnd = () => {
      x = (x * 16807) % 2147483647;
      return (x % 1000) / 1000;
    };
    const picks = decideOutreachCatchup({
      candidates: [cand('a', { lastMessageAt: iso(at(8)) }), cand('b', { lastMessageAt: iso(at(8)) }), cand('c', { lastMessageAt: iso(at(8)) })],
      state: { log: [], lastSeenAt: iso(at(9)) },
      now: at(18),
      random: rnd,
    });
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.length).toBeLessThanOrEqual(OUTREACH_CONFIG.catchupMax);
    for (const p of picks) {
      expect(p.at.getTime()).toBeGreaterThan(at(10).getTime() - 1);
      expect(p.at.getTime()).toBeLessThan(at(18).getTime());
      expect(p.at.getHours() >= 2 && p.at.getHours() < 7).toBe(false);
    }
    if (picks.length === 2) {
      expect(Math.abs(picks[1].at.getTime() - picks[0].at.getTime())).toBeGreaterThanOrEqual(OUTREACH_CONFIG.globalGapMs);
    }
  });
  it('离开不到 3 小时不补；没记录过上次在线也不补', () => {
    expect(decideOutreachCatchup({ candidates: [cand('a')], state: { log: [], lastSeenAt: iso(at(16)) }, now: at(18) })).toEqual([]);
    expect(decideOutreachCatchup({ candidates: [cand('a')], state: { log: [] }, now: at(18) })).toEqual([]);
  });
});

describe('主动消息服务（离线，隔离数据目录）', () => {
  it('例行检查发出一条、写进单聊并记日志；20 分钟内再查不会有第二个人来', { timeout: 30_000 }, async () => {
    const { runOutreach } = await import('@/lib/proactive/outreach-service');
    const { storageRepo } = await import('@/lib/storage/repository');
    await storageRepo.updateOutreachState(() => ({ log: [] }));
    const now = new Date(2026, 10, 25, 15, 0);
    const first = await runOutreach({ mode: 'tick', now, random: () => 0 });
    expect(first).toHaveLength(1);
    expect(first[0].message.proactive).toBe('tick');
    const convo = await storageRepo.getConversation(first[0].slug, 0);
    expect(convo.some((m) => m.id === first[0].message.id)).toBe(true);
    const second = await runOutreach({ mode: 'tick', now: new Date(now.getTime() + 5 * 60_000), random: () => 0 });
    expect(second).toHaveLength(0);
    const state = await storageRepo.getOutreachState();
    expect(state.log.some((e) => e.slug === first[0].slug)).toBe(true);
  });

  it('关掉「允许 TA 主动找我」的角色不会来', { timeout: 30_000 }, async () => {
    const { runOutreach } = await import('@/lib/proactive/outreach-service');
    const { storageRepo } = await import('@/lib/storage/repository');
    const personas = (await storageRepo.listPersonas()).filter((p) => p.slug !== 'master-bot' && !p.isMaster);
    for (const p of personas) {
      await storageRepo.updatePersona(p.slug, (cur) => ({ ...cur, profile: { ...cur.profile, allowProactive: false } }));
    }
    await storageRepo.updateOutreachState(() => ({ log: [] }));
    const sent = await runOutreach({ mode: 'tick', now: new Date(2026, 10, 24, 16, 0), random: () => 0 });
    // 只断言「关掉的这些角色」都没来：其它测试文件会并行往共享的临时数据目录里新建角色，不能要求总数为 0
    const disabled = new Set(personas.map((p) => p.slug));
    expect(sent.filter((s) => disabled.has(s.slug))).toHaveLength(0);
    for (const p of personas) {
      await storageRepo.updatePersona(p.slug, (cur) => ({ ...cur, profile: { ...cur.profile, allowProactive: undefined } }));
    }
  });
});
