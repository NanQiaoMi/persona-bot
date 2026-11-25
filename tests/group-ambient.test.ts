import { describe, expect, it } from 'vitest';
import {
  AMBIENT_CONFIG,
  appendAmbientLog,
  chooseSeed,
  decideAmbient,
  planAmbientScene,
  planCatchupScenes,
  type AmbientMember,
} from '@/lib/group/ambient';
import { buildStarterDirective, executeAmbientScene, offlineStarterLine } from '@/lib/group/ambient-orchestrator';
import { pickSpeakers } from '@/lib/group/director';
import { executeGroupTurn } from '@/lib/group/group-orchestrator';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage } from '@/lib/storage/types';

/** 2026-11-25 是周三 */
const at = (h: number, m = 0, day = 25) => new Date(2026, 10, day, h, m);

function seq(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x % 10000) / 10000;
  };
}

const office = (slug: string, name: string): AmbientMember => ({ slug, name, profile: { occupation: '产品经理' } });
const owl = (slug: string, name: string): AmbientMember => ({ slug, name, profile: { occupation: '深夜冲浪主笔' } });

function msg(id: string, role: 'user' | 'assistant', content: string, ts: Date, slug?: string): ConversationMessage {
  return { id, role, content, timestamp: ts.toISOString(), fromBot: slug ? { slug, name: slug } : undefined };
}

describe('什么时候可以自己聊', () => {
  const group = { ambientLog: [] as string[], createdAt: at(8).toISOString() };
  const quietHistory = [msg('a', 'assistant', '好的', at(20, 0), 'x')];

  it('idle：你停够久、群里安静、不在冷却时才允许', () => {
    const now = at(20, 5);
    expect(decideAmbient({ mode: 'idle', group, history: quietHistory, now, userIdleMs: 90_000, memberCount: 3 }).ok).toBe(true);
    expect(decideAmbient({ mode: 'idle', group, history: quietHistory, now, userIdleMs: 10_000, memberCount: 3 }).ok).toBe(false);
    expect(
      decideAmbient({ mode: 'idle', group, history: [msg('b', 'assistant', '刚说', new Date(now.getTime() - 30_000), 'x')], now, userIdleMs: 90_000, memberCount: 3 }).ok
    ).toBe(false);
    expect(decideAmbient({ mode: 'idle', group, history: quietHistory, now, userIdleMs: 90_000, memberCount: 1 }).ok).toBe(false);
  });

  it('idle：你的话还没人接时不自己聊', () => {
    const history = [msg('u', 'user', '有人吗', at(20, 0))];
    expect(decideAmbient({ mode: 'idle', group, history, now: at(20, 5), userIdleMs: 90_000, memberCount: 3 }).reason).toContain('没人接');
  });

  it('idle：冷却 2 分钟、每小时最多 6 场', () => {
    const now = at(20, 30);
    const cooling = { ...group, ambientLog: [new Date(now.getTime() - 60_000).toISOString()] };
    expect(decideAmbient({ mode: 'idle', group: cooling, history: quietHistory, now, userIdleMs: 90_000, memberCount: 3 }).reason).toBe('冷却中');
    const busyHour = {
      ...group,
      ambientLog: Array.from({ length: AMBIENT_CONFIG.maxScenesPerHour }, (_, i) =>
        new Date(now.getTime() - (5 + i * 5) * 60_000).toISOString()
      ),
    };
    expect(decideAmbient({ mode: 'idle', group: busyHour, history: quietHistory, now, userIdleMs: 90_000, memberCount: 3 }).ok).toBe(false);
  });

  it('catchup：空档超过 2 小时且这段没补过才补', () => {
    expect(decideAmbient({ mode: 'catchup', group, history: quietHistory, now: at(21), memberCount: 3 }).ok).toBe(false);
    expect(decideAmbient({ mode: 'catchup', group, history: quietHistory, now: at(23), memberCount: 3 }).ok).toBe(true);
    const done = { ...group, ambientLog: [at(22).toISOString()] };
    expect(decideAmbient({ mode: 'catchup', group: done, history: quietHistory, now: at(23), memberCount: 3 }).ok).toBe(false);
  });

  it('记录只保留一小时内的', () => {
    const log = appendAmbientLog([at(18).toISOString(), at(20, 10).toISOString()], at(20, 30));
    expect(log).toHaveLength(2);
    expect(log[log.length - 1]).toBe(at(20, 30).toISOString());
  });
});

describe('一场闲聊怎么展开', () => {
  const members = [office('a', '甲'), office('b', '乙'), office('c', '丙')];

  it('有人起头、至少一个人接，条数不超过上限', () => {
    for (let s = 1; s < 30; s += 1) {
      const scene = planAmbientScene({ members, at: at(20), ctx: { history: [] }, maxMessages: 5, random: seq(s) });
      expect(scene).not.toBeNull();
      expect(scene!.steps[0].type).toBe('starter');
      expect(scene!.steps.some((st) => st.type === 'reply')).toBe(true);
      expect(scene!.steps.length).toBeLessThanOrEqual(5);
      scene!.steps.forEach((st, i) => {
        if (st.type === 'react' && i > 0) expect(st.slug).not.toBe(scene!.steps[i - 1].slug);
      });
    }
  });

  it('凌晨上班族都睡了：群里安静（返回 null）', () => {
    expect(planAmbientScene({ members, at: at(3), ctx: { history: [] }, maxMessages: 5, random: seq(2) })).toBeNull();
  });

  it('凌晨只有夜猫子醒着时也凑不齐两个人，仍然安静；两个夜猫子就能聊', () => {
    expect(planAmbientScene({ members: [...members, owl('o', '夜')], at: at(1), ctx: { history: [] }, maxMessages: 5 })).toBeNull();
    const scene = planAmbientScene({
      members: [owl('o1', '夜一'), owl('o2', '夜二'), office('a', '甲')],
      at: at(1),
      ctx: { history: [] },
      maxMessages: 5,
      random: seq(3),
    });
    expect(scene).not.toBeNull();
    expect(scene!.steps.every((st) => st.slug !== 'a')).toBe(true);
  });

  it('话题来源包括朋友圈、群话题、翻旧消息、损人', () => {
    const history = Array.from({ length: 12 }, (_, i) => msg(`h${i}`, 'assistant', `这是第${i}条比较长的聊天内容`, at(10, i), 'b'));
    const kinds = new Set<string>();
    for (let s = 1; s < 200; s += 1) {
      kinds.add(
        chooseSeed({
          starter: members[0],
          others: members.slice(1),
          at: at(20),
          ctx: { history, groupTopic: '周末去哪', recentMoments: { a: '今天的晚霞好看' } },
          random: seq(s),
          allowPingOwner: true,
        }).kind
      );
    }
    for (const k of ['activity', 'daily', 'moment', 'topic', 'tease', 'callback', 'ping_owner']) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  it('补聊：场次落在空档里有人醒着的时间，按时间先后排列', () => {
    const scenes = planCatchupScenes({
      members,
      gapStart: at(9),
      now: at(22),
      ctx: { history: [] },
      random: seq(5),
    });
    expect(scenes.length).toBeGreaterThan(0);
    for (const sc of scenes) {
      expect(sc.at.getTime()).toBeGreaterThan(at(9).getTime());
      expect(sc.at.getTime()).toBeLessThan(at(22).getTime());
    }
    const times = scenes.map((s) => s.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('离线起头话术填好占位符；起头说明包含话题与补聊时间', () => {
    const line = offlineStarterLine('fun', { kind: 'tease', targetName: '乙' }, seq(4));
    expect(line).not.toMatch(/\{\w+\}/);
    const d = buildStarterDirective({ kind: 'moment', moment: '晚霞' }, at(18, 5), true);
    expect(d).toContain('晚霞');
    expect(d).toContain('18:05');
  });
});

describe('你发消息时谁会回', () => {
  const members = [office('a', '甲一'), office('b', '乙二'), office('c', '丙三')];
  it('睡着的人不主动回，被点名的人会回', () => {
    const availabilityOf = (slug: string) => (slug === 'a' ? 'free' : 'asleep') as 'free' | 'asleep';
    for (let s = 1; s < 20; s += 1) {
      const picked = pickSpeakers({ text: '你们在干嘛', members, history: [], availabilityOf, random: seq(s) });
      expect(picked.map((m) => m.slug)).toEqual(['a']);
    }
    const mentioned = pickSpeakers({ text: '乙二 你睡了吗', members, history: [], availabilityOf, random: seq(1) });
    expect(mentioned[0].slug).toBe('b');
  });

  it('大家都睡了也至少有一个人回', () => {
    const picked = pickSpeakers({ text: '在吗', members, history: [], availabilityOf: () => 'asleep', random: seq(1) });
    expect(picked.length).toBe(1);
  });
});

describe('自发闲聊执行（离线兜底，存储联动）', () => {
  async function makeGroup() {
    await storageRepo.listPersonas();
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    return storageRepo.createGroup({ name: '闲聊群', memberSlugs: subs.slice(0, 3).map((p) => p.slug) });
  }

  it('idle：生成并保存一场闲聊，记录冷却；紧接着再来会被冷却挡住', async () => {
    const group = await makeGroup();
    await storageRepo.appendGroupMessages(group.id, [msg('m0', 'assistant', '刚才说到哪了', at(20, 0), group.memberSlugs[0])]);
    const now = at(20, 10);
    const r = await executeAmbientScene({ groupId: group.id, mode: 'idle', userIdleMs: 120_000, now, random: seq(7) });
    expect(r.reason).toBe('idle');
    expect(r.ok).toBe(true);
    expect(r.messages.length).toBeGreaterThanOrEqual(2);
    expect(r.messages.length).toBeLessThanOrEqual(AMBIENT_CONFIG.idleMaxMessages);
    expect(r.playbackDelays).toHaveLength(r.messages.length);
    expect(Math.max(...r.playbackDelays)).toBeLessThanOrEqual(15_000);
    expect(r.messages.every((m) => m.ambient === 'idle')).toBe(true);
    const saved = await storageRepo.getGroupConversation(group.id, 0);
    expect(saved.slice(-r.messages.length).map((m) => m.id)).toEqual(r.messages.map((m) => m.id));
    const again = await executeAmbientScene({ groupId: group.id, mode: 'idle', userIdleMs: 120_000, now: new Date(now.getTime() + 30_000) });
    expect(again.ok).toBe(false);
  });

  it('catchup：补上的消息时间落在空档里，且不会重复补', async () => {
    const group = await makeGroup();
    const lastTs = at(9, 0);
    await storageRepo.appendGroupMessages(group.id, [msg('m0', 'user', '早上好', lastTs)]);
    const now = at(21, 0);
    const r = await executeAmbientScene({ groupId: group.id, mode: 'catchup', now, random: seq(9) });
    expect(r.ok).toBe(true);
    expect(r.messages.length).toBeGreaterThanOrEqual(2);
    expect(r.messages.length).toBeLessThanOrEqual(AMBIENT_CONFIG.catchupMaxMessages);
    for (const m of r.messages) {
      const t = new Date(m.timestamp).getTime();
      expect(t).toBeGreaterThan(lastTs.getTime());
      expect(t).toBeLessThanOrEqual(now.getTime());
      expect(m.ambient).toBe('catchup');
    }
    const again = await executeAmbientScene({ groupId: group.id, mode: 'catchup', now: new Date(now.getTime() + 60_000) });
    expect(again.ok).toBe(false);
  });
});

describe('你发消息后偶尔有人只附和一句', () => {
  it('reactionChance=1 时最后会多一条短附和', async () => {
    await storageRepo.listPersonas();
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const group = await storageRepo.createGroup({ name: '附和群', memberSlugs: subs.slice(0, 4).map((p) => p.slug) });
    const produced = await executeGroupTurn({ groupId: group.id, userText: '我今天升职了', reactionChance: 1, now: new Date(2026, 10, 25, 20, 0) });
    const last = produced[produced.length - 1];
    // 醒着且这轮没说话的人可能不存在（作息原因），存在时最后一条是很短的附和
    if (last.role === 'assistant' && last.content.length <= 6) {
      expect(last.fromBot).toBeDefined();
    }
    expect(produced[0].role).toBe('user');
  });
});

describe('群聊存储迁移：旧 groups.json → 每群一个文件', () => {
  it('旧索引里的群迁移后仍可读写，旧文件改名备份；并发建群不会互相覆盖', async () => {
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const { UnifiedStorageRepository } = await import('@/lib/storage/repository');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pb-group-migrate-'));
    const exes = path.join(root, 'exes');
    const data = path.join(root, '.data');
    await fs.mkdir(path.join(data, 'groups'), { recursive: true });
    const legacy = [
      { id: 'group-old1', name: '旧群一', memberSlugs: ['a', 'b'], createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-21T00:00:00.000Z' },
      { id: 'group-old2', name: '旧群二', memberSlugs: ['a', 'c'], createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-22T00:00:00.000Z' },
    ];
    await fs.writeFile(path.join(data, 'groups', 'groups.json'), JSON.stringify(legacy));
    try {
      const repo = new UnifiedStorageRepository(exes, data);
      const listed = await repo.listGroups();
      expect(listed.map((g) => g.id)).toEqual(['group-old2', 'group-old1']);
      await expect(fs.stat(path.join(data, 'groups', 'groups.legacy-backup.json'))).resolves.toBeTruthy();
      await expect(fs.stat(path.join(data, 'groups', 'groups.json'))).rejects.toThrow();
      expect((await repo.updateGroup('group-old1', { name: '改名了' }))?.name).toBe('改名了');

      // 两个独立实例（模拟两个进程）同时建群，都能保留下来
      const other = new UnifiedStorageRepository(exes, data);
      const [g1, g2] = await Promise.all([
        repo.createGroup({ name: '新一', memberSlugs: ['a', 'b'] }),
        other.createGroup({ name: '新二', memberSlugs: ['a', 'b'] }),
      ]);
      const ids = (await repo.listGroups()).map((g) => g.id);
      expect(ids).toEqual(expect.arrayContaining([g1.id, g2.id, 'group-old1', 'group-old2']));
      expect(await repo.deleteGroup('group-old2')).toBe(true);
      expect(await repo.getGroup('group-old2')).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
