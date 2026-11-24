import { describe, expect, it } from 'vitest';
import { executeGroupTurn } from '@/lib/group/group-orchestrator';
import { executeMasterBotTurn } from '@/lib/grok/master-orchestrator';
import type { StreamEvent } from '@/lib/grok/stream-orchestrator';
import { storageRepo } from '@/lib/storage/repository';

async function pickTwoMembers() {
  const personas = await storageRepo.listPersonas();
  const subs = personas.filter((p) => !p.isMaster && p.slug !== 'master-bot');
  expect(subs.length).toBeGreaterThanOrEqual(2);
  return subs.slice(0, 2);
}

describe('群聊一轮编排（离线兜底）', () => {
  it('kickoff：主 bot 开场后成员依次接话，并写入群聊记录', async () => {
    const members = await pickTwoMembers();
    const group = await storageRepo.createGroup({
      name: '周末小分队',
      memberSlugs: members.map((m) => m.slug),
      topic: '周末去哪玩',
    });

    const events: StreamEvent[] = [];
    const produced = await executeGroupTurn({ groupId: group.id, kickoff: true }, (e) =>
      events.push(e)
    );

    expect(produced[0].fromBot?.slug).toBe('master-bot');
    expect(produced[0].content).toContain('周末去哪玩');
    const memberMsgs = produced.filter((m) =>
      members.some((mem) => mem.slug === m.fromBot?.slug)
    );
    expect(memberMsgs.length).toBeGreaterThanOrEqual(2);
    expect(memberMsgs.every((m) => m.content.trim().length > 0)).toBe(true);

    expect(events.some((e) => e.type === 'message_part')).toBe(true);
    expect(events[events.length - 1].type).toBe('done');

    const saved = await storageRepo.getGroupConversation(group.id);
    expect(saved.map((m) => m.id)).toEqual(produced.map((m) => m.id));
    const after = await storageRepo.getGroup(group.id);
    expect(after?.pendingKickoff).toBe(false);
    expect(after?.lastMessage).toBeTruthy();
  });

  it('用户点名某个成员时，TA 第一个开口；单聊记录不受影响', async () => {
    const [a, b] = await pickTwoMembers();
    const group = await storageRepo.createGroup({
      name: '测试群',
      memberSlugs: [a.slug, b.slug],
    });
    const before = await storageRepo.getConversation(b.slug, 0);

    const produced = await executeGroupTurn({
      groupId: group.id,
      userText: `${b.name} 你觉得呢？`,
    });

    expect(produced[0].role).toBe('user');
    expect(produced[1].fromBot?.slug).toBe(b.slug);
    const after = await storageRepo.getConversation(b.slug, 0);
    expect(after.length).toBe(before.length);
  });

  it('群不存在时抛错，空消息被拒绝', async () => {
    await expect(executeGroupTurn({ groupId: 'group-nope', userText: 'hi' })).rejects.toThrow();
    const [a, b] = await pickTwoMembers();
    const group = await storageRepo.createGroup({ name: 'x', memberSlugs: [a.slug, b.slug] });
    await expect(executeGroupTurn({ groupId: group.id, userText: '  ' })).rejects.toThrow();
  });
});

describe('主 bot 识别「拉个群」', () => {
  it('建群并返回入群卡片，而不是派活汇总', async () => {
    const [a, b] = await pickTwoMembers();
    const reply = await executeMasterBotTurn({
      slug: 'master-bot',
      messages: [{ role: 'user', content: `拉${a.name}和${b.name}建个群聊聊周末去哪玩` }],
    });

    expect(reply.groupInvite).toBeDefined();
    expect(reply.interBotReports).toBeUndefined();
    const group = await storageRepo.getGroup(reply.groupInvite!.groupId);
    expect(group?.memberSlugs).toEqual(expect.arrayContaining([a.slug, b.slug]));
    expect(group?.topic).toBe('周末去哪玩');
    expect(group?.pendingKickoff).toBe(true);
  });
});

describe('分条标记容错', () => {
  it('带空格或全角括号的 BURST 也会被拆开，不会漏到气泡里', async () => {
    const { splitLiveBursts } = await import('@/lib/grok/stream-orchestrator');
    expect(splitLiveBursts('第一句[ BURST ]第二句【BURST】第三句')).toEqual([
      '第一句',
      '第二句',
      '第三句',
    ]);
  });
});

describe('旧数据残留的未知模式', () => {
  it('blendStyle 遇到已下线的模式（如 direct）不再崩溃', async () => {
    const { blendStyle } = await import('@/lib/persona/style-blend');
    const { fingerprintFromPersonaMd } = await import('@/lib/persona/fingerprint');
    const fp = fingerprintFromPersonaMd('');
    expect(() =>
      blendStyle(fp, ['周末去哪玩', '笑死'], 'direct' as unknown as 'authentic')
    ).not.toThrow();
  });
});

describe('群聊连发合并', () => {
  it('一轮里连发的几条都会存进群聊记录，按顺序在角色回复之前', async () => {
    const [a, b] = await pickTwoMembers();
    const group = await storageRepo.createGroup({ name: '连发群', memberSlugs: [a.slug, b.slug] });
    const produced = await executeGroupTurn({
      groupId: group.id,
      userTurns: [{ content: '我跟你们说' }, { content: '今天发生了件离谱的事' }],
    });
    expect(produced.slice(0, 2).map((m) => [m.role, m.content])).toEqual([
      ['user', '我跟你们说'],
      ['user', '今天发生了件离谱的事'],
    ]);
    expect(produced.slice(2).every((m) => m.role === 'assistant')).toBe(true);
  });
});
