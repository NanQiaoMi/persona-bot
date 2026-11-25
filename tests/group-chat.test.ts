import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildGroupSystemDirective,
  buildGroupTranscriptForSpeaker,
  detectGroupIntent,
  findMentionedMembers,
  pickReactor,
  pickSpeakers,
  turnsSinceSpoke,
  type GroupMemberLite,
} from '@/lib/group/director';
import { UnifiedStorageRepository } from '@/lib/storage/repository';
import type { ConversationMessage } from '@/lib/storage/types';

const ella: GroupMemberLite = { slug: 'ella', name: 'Ella' };
const lin: GroupMemberLite = { slug: 'lin', name: '林晚' };
const su: GroupMemberLite = { slug: 'su', name: '苏念' };
const wang: GroupMemberLite = { slug: 'wang', name: '王芳' };
const zhao: GroupMemberLite = { slug: 'zhao', name: '赵明' };

const trio = [ella, lin, su];
const five = [ella, lin, su, wang, zhao];

const low = () => 0.1;
const high = () => 0.99;

let clock = 0;
function makeMsg(
  role: 'user' | 'assistant',
  content: string,
  fromBot?: { slug: string; name: string }
): ConversationMessage {
  clock += 1;
  return {
    id: `msg-${clock}`,
    role,
    content,
    timestamp: new Date(1_700_000_000_000 + clock * 1000).toISOString(),
    ...(fromBot ? { fromBot } : {}),
  };
}

describe('group director: findMentionedMembers', () => {
  it('returns members in the order they are mentioned, not the order of the member list', () => {
    const hits = findMentionedMembers('林晚先说，然后 ella 再接', trio);
    expect(hits.map((m) => m.slug)).toEqual(['lin', 'ella']);
  });

  it('matches @name with the display name', () => {
    expect(findMentionedMembers('@林晚 你怎么看', trio).map((m) => m.slug)).toEqual(['lin']);
  });

  it('matches by slug, case-insensitively', () => {
    const members = [{ slug: 'su-nian', name: '苏念' }];
    expect(findMentionedMembers('@SU-NIAN 来一下', members)).toHaveLength(1);
  });

  it('returns an empty list when nobody is named', () => {
    expect(findMentionedMembers('今天天气不错啊', trio)).toEqual([]);
  });
});

describe('group director: pickSpeakers', () => {
  const history: ConversationMessage[] = [];

  it('returns [] when there are no members', () => {
    expect(pickSpeakers({ text: '大家好', members: [], history })).toEqual([]);
  });

  it('puts the mentioned member first', () => {
    const result = pickSpeakers({ text: '@林晚 你觉得呢', members: trio, history, random: high });
    expect(result.map((m) => m.slug)[0]).toBe('lin');
  });

  it('keeps the mention order when several members are named', () => {
    const result = pickSpeakers({
      text: '林晚先说，然后 ella 再说',
      members: trio,
      history,
      random: high,
    });
    expect(result.map((m) => m.slug)).toEqual(['lin', 'ella']);
  });

  it('may add one interjector when a single member is named and random is low', () => {
    const lowResult = pickSpeakers({ text: '@林晚 你觉得呢', members: trio, history, random: low });
    const highResult = pickSpeakers({ text: '@林晚 你觉得呢', members: trio, history, random: high });
    expect(lowResult[0].slug).toBe('lin');
    expect(lowResult).toHaveLength(2);
    expect(highResult).toHaveLength(1);
  });

  it('lets up to 3 members reply when the text addresses everyone', () => {
    const result = pickSpeakers({ text: '大家今天聊点什么', members: five, history, random: high });
    expect(result).toHaveLength(3);
    expect(new Set(result.map((m) => m.slug)).size).toBe(3);
  });

  it('returns 1 or 2 members for plain text, depending on the random roll', () => {
    const text = '今天天气不错啊';
    const single = pickSpeakers({ text, members: trio, history, random: high });
    const pair = pickSpeakers({ text, members: trio, history, random: low });
    expect(single).toHaveLength(1);
    expect(pair).toHaveLength(2);
    expect(pair[0].slug).not.toBe(pair[1].slug);
  });

  it('respects maxSpeakers for everyone-addressed text', () => {
    const result = pickSpeakers({
      text: '大家',
      members: five,
      history,
      maxSpeakers: 1,
      random: high,
    });
    expect(result).toHaveLength(1);
  });

  it('respects maxSpeakers when several members are named', () => {
    const result = pickSpeakers({
      text: '林晚和 ella 都说说',
      members: trio,
      history,
      maxSpeakers: 1,
      random: high,
    });
    expect(result).toHaveLength(1);
  });

  it('is deterministic for an injected random function', () => {
    const args = { text: '今天天气不错啊', members: trio, history, random: low };
    const first = pickSpeakers(args).map((m) => m.slug);
    const second = pickSpeakers(args).map((m) => m.slug);
    expect(second).toEqual(first);
  });
});

describe('group director: turnsSinceSpoke', () => {
  it('counts messages since the member last spoke', () => {
    const history = [
      makeMsg('assistant', 'hi', { slug: 'ella', name: 'Ella' }),
      makeMsg('user', '嗯'),
      makeMsg('assistant', '哈哈', { slug: 'lin', name: '林晚' }),
    ];
    expect(turnsSinceSpoke(history, 'lin')).toBe(0);
    expect(turnsSinceSpoke(history, 'ella')).toBe(2);
  });

  it('returns 99 for a member who has never spoken', () => {
    expect(turnsSinceSpoke([makeMsg('user', 'hello')], 'su')).toBe(99);
    expect(turnsSinceSpoke([], 'su')).toBe(99);
  });
});

describe('group director: pickReactor', () => {
  it('returns the mentioned other member', () => {
    const result = pickReactor({
      lastSpeakerSlug: 'ella',
      lastText: '林晚你怎么看',
      members: trio,
      spokenThisRound: ['ella'],
      chainDepth: 0,
      random: high,
    });
    expect(result?.slug).toBe('lin');
  });

  it('returns null when the chain depth reached the limit', () => {
    const result = pickReactor({
      lastSpeakerSlug: 'ella',
      lastText: '林晚你怎么看',
      members: trio,
      spokenThisRound: ['ella'],
      chainDepth: 2,
      maxChain: 2,
      random: low,
    });
    expect(result).toBeNull();
  });

  it('returns null when the random roll is above the chance', () => {
    const result = pickReactor({
      lastSpeakerSlug: 'ella',
      lastText: '今天天气不错啊',
      members: trio,
      spokenThisRound: ['ella'],
      chainDepth: 0,
      random: () => 0.5,
    });
    expect(result).toBeNull();
  });

  it('picks a quiet member when the random roll is under the chance', () => {
    const result = pickReactor({
      lastSpeakerSlug: 'ella',
      lastText: '今天天气不错啊',
      members: trio,
      spokenThisRound: ['ella', 'lin'],
      chainDepth: 0,
      random: low,
    });
    expect(result?.slug).toBe('su');
  });

  it('never returns the last speaker, even when the last speaker is named', () => {
    const rolls = [0, 0.1, 0.3, 0.6, 0.99];
    for (const r of rolls) {
      const result = pickReactor({
        lastSpeakerSlug: 'ella',
        lastText: 'ella 你说呢',
        members: trio,
        spokenThisRound: [],
        chainDepth: 0,
        random: () => r,
      });
      expect(result?.slug).not.toBe('ella');
    }
  });
});

describe('group director: detectGroupIntent', () => {
  it('returns null for text without a group-creation intent', () => {
    expect(detectGroupIntent('今天吃什么', trio)).toBeNull();
  });

  it('returns null when there are no candidates', () => {
    expect(detectGroupIntent('拉个群聊聊周末去哪玩', [])).toBeNull();
  });

  it('picks members and the topic from "拉个群聊聊..."', () => {
    const intent = detectGroupIntent('拉个群聊聊周末去哪玩', trio);
    expect(intent).not.toBeNull();
    expect(intent!.topic).toBe('周末去哪玩');
    expect(intent!.name).toBe('周末去哪玩');
    expect(intent!.members.length).toBeGreaterThanOrEqual(2);
    const candidateSlugs = trio.map((m) => m.slug);
    for (const m of intent!.members) {
      expect(candidateSlugs).toContain(m.slug);
    }
  });

  it('uses the two named members when two are named', () => {
    const intent = detectGroupIntent('拉 Ella 和 林晚 建个群', trio);
    expect(intent).not.toBeNull();
    expect(intent!.members.map((m) => m.slug)).toEqual(['ella', 'lin']);
    expect(intent!.topic).toBeUndefined();
  });

  it('includes everyone, up to 4 members, for "拉大家建个群"', () => {
    const intent = detectGroupIntent('拉大家建个群', five);
    expect(intent).not.toBeNull();
    expect(intent!.members).toHaveLength(4);
  });

  it('includes all candidates when there are fewer than 4', () => {
    const intent = detectGroupIntent('拉大家建个群', trio);
    expect(intent!.members).toHaveLength(3);
  });

  it('returns at least 2 members when there are 2 or more candidates', () => {
    const intent = detectGroupIntent('拉 Ella 建个群', trio);
    expect(intent).not.toBeNull();
    expect(intent!.members.length).toBeGreaterThanOrEqual(2);
    expect(intent!.members[0].slug).toBe('ella');
  });
});

describe('group director: buildGroupTranscriptForSpeaker', () => {
  it('turns own messages into assistant turns without a name prefix', () => {
    const history = [
      makeMsg('user', '大家好'),
      makeMsg('assistant', '嗨', { slug: 'ella', name: 'Ella' }),
      makeMsg('user', '周末去哪'),
    ];
    const turns = buildGroupTranscriptForSpeaker(history, 'ella');
    const own = turns.find((t) => t.role === 'assistant');
    expect(own).toEqual({ role: 'assistant', content: '嗨' });
  });

  it('prefixes other speakers and the user with their names', () => {
    const history = [
      makeMsg('user', '大家好'),
      makeMsg('assistant', '哈哈', { slug: 'lin', name: '林晚' }),
    ];
    const turns = buildGroupTranscriptForSpeaker(history, 'ella', { userName: '群主' });
    const joined = turns.map((t) => t.content).join('\n');
    expect(joined).toContain('群主：大家好');
    expect(joined).toContain('林晚：哈哈');
    expect(turns.every((t) => t.role === 'user' || t.role === 'assistant')).toBe(true);
  });

  it('merges consecutive turns with the same role and never repeats a role back to back', () => {
    const history = [
      makeMsg('assistant', '哈哈', { slug: 'lin', name: '林晚' }),
      makeMsg('assistant', '我也这么觉得', { slug: 'su', name: '苏念' }),
      makeMsg('user', '周末去哪'),
      makeMsg('assistant', '我去海边', { slug: 'ella', name: 'Ella' }),
      makeMsg('assistant', '也可以去山里', { slug: 'ella', name: 'Ella' }),
    ];
    const turns = buildGroupTranscriptForSpeaker(history, 'su');
    for (let i = 1; i < turns.length; i += 1) {
      expect(turns[i].role).not.toBe(turns[i - 1].role);
    }
    // 林晚的两条合并成一个 user 轮；苏念自己的两条（这里只有一条）是 assistant 轮，无前缀
    expect(turns[0]).toEqual({ role: 'user', content: '林晚：哈哈' });
    expect(turns[1]).toEqual({ role: 'assistant', content: '我也这么觉得' });
    expect(turns[2].role).toBe('user');
    expect(turns[2].content).toContain('我（群主）：周末去哪');
    expect(turns[2].content).toContain('Ella：我去海边');
    expect(turns[2].content).toContain('Ella：也可以去山里');
  });

  it('ends with a user turn, adding a filler turn when the speaker spoke last', () => {
    const history = [
      makeMsg('user', '大家好'),
      makeMsg('assistant', '嗨', { slug: 'ella', name: 'Ella' }),
    ];
    const turns = buildGroupTranscriptForSpeaker(history, 'ella');
    expect(turns[turns.length - 1].role).toBe('user');
    expect(turns[turns.length - 1].content).toContain('轮到你接话');
  });

  it('returns a single user filler turn for an empty history', () => {
    const turns = buildGroupTranscriptForSpeaker([], 'ella');
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe('user');
  });

  it('skips messages with empty content', () => {
    const history = [makeMsg('user', '   '), makeMsg('user', '真实内容')];
    const turns = buildGroupTranscriptForSpeaker(history, 'ella');
    expect(turns.map((t) => t.content).join('')).not.toContain('   ');
    expect(turns[0].content).toContain('真实内容');
  });

  it('only uses the last `window` messages', () => {
    const history = [
      makeMsg('user', '第一句旧话'),
      makeMsg('user', '第二句旧话'),
      makeMsg('user', '最新的话'),
    ];
    const turns = buildGroupTranscriptForSpeaker(history, 'ella', { window: 1 });
    const joined = turns.map((t) => t.content).join('\n');
    expect(joined).toContain('最新的话');
    expect(joined).not.toContain('第一句旧话');
  });
});

describe('group director: buildGroupSystemDirective', () => {
  it('includes the group name and the other member names', () => {
    const text = buildGroupSystemDirective({
      groupName: '周末局',
      speakerName: 'Ella',
      otherMemberNames: ['林晚', '苏念'],
    });
    expect(text).toContain('周末局');
    expect(text).toContain('林晚');
    expect(text).toContain('苏念');
    expect(text).toContain('Ella');
  });

  it('adds topic, reply and kickoff hints when provided', () => {
    const text = buildGroupSystemDirective({
      groupName: '周末局',
      topic: '周末去哪玩',
      speakerName: 'Ella',
      otherMemberNames: ['林晚'],
      replyTo: { name: '林晚', text: '去海边' },
      isKickoff: true,
    });
    expect(text).toContain('周末去哪玩');
    expect(text).toContain('林晚');
    expect(text).toContain('去海边');
    expect(text).toContain('群刚建好');
  });
});

describe('UnifiedStorageRepository group chat storage', () => {
  let tmpRoot: string;
  let repo: UnifiedStorageRepository;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'personabot-group-'));
    repo = new UnifiedStorageRepository(
      path.join(tmpRoot, 'exes'),
      path.join(tmpRoot, 'data')
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('creates a group that can be listed and fetched by id', async () => {
    const created = await repo.createGroup({ name: '  周末局  ', memberSlugs: ['ella', 'lin'], topic: '去哪玩' });
    expect(created.id).toMatch(/^group-/);
    expect(created.name).toBe('周末局');
    expect(created.topic).toBe('去哪玩');

    const listed = await repo.listGroups();
    expect(listed.map((g) => g.id)).toContain(created.id);

    const fetched = await repo.getGroup(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.name).toBe('周末局');
  });

  it('dedupes member slugs on create', async () => {
    const created = await repo.createGroup({
      name: '去重群',
      memberSlugs: ['ella', 'lin', 'ella', 'lin'],
    });
    expect(created.memberSlugs).toEqual(['ella', 'lin']);
  });

  it('marks a new group as pending kickoff', async () => {
    const created = await repo.createGroup({ name: '开场群', memberSlugs: ['ella', 'lin'] });
    expect(created.pendingKickoff).toBe(true);
    const fetched = await repo.getGroup(created.id);
    expect(fetched?.pendingKickoff).toBe(true);
  });

  it('returns null for an unknown group id', async () => {
    expect(await repo.getGroup('group-does-not-exist')).toBeNull();
  });

  it('applies a partial patch in updateGroup', async () => {
    const created = await repo.createGroup({ name: '旧名字', memberSlugs: ['ella', 'lin'] });
    const updated = await repo.updateGroup(created.id, {
      name: '新名字',
      topic: '旅行',
      pendingKickoff: false,
      lastMessage: '好的',
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('新名字');
    expect(updated!.topic).toBe('旅行');
    expect(updated!.pendingKickoff).toBe(false);
    expect(updated!.lastMessage).toBe('好的');
    expect(updated!.memberSlugs).toEqual(['ella', 'lin']);

    const fetched = await repo.getGroup(created.id);
    expect(fetched?.name).toBe('新名字');
  });

  it('returns null when updating an unknown group', async () => {
    expect(await repo.updateGroup('group-missing', { name: 'x' })).toBeNull();
  });

  it('appends messages in order and reads them back', async () => {
    const created = await repo.createGroup({ name: '聊天群', memberSlugs: ['ella', 'lin'] });
    await repo.appendGroupMessages(created.id, [makeMsg('user', '第一句')]);
    const merged = await repo.appendGroupMessages(created.id, [
      makeMsg('assistant', '第二句', { slug: 'ella', name: 'Ella' }),
      makeMsg('assistant', '第三句', { slug: 'lin', name: '林晚' }),
    ]);
    expect(merged.map((m) => m.content)).toEqual(['第一句', '第二句', '第三句']);

    const read = await repo.getGroupConversation(created.id);
    expect(read.map((m) => m.content)).toEqual(['第一句', '第二句', '第三句']);
    expect(read[1].fromBot?.slug).toBe('ella');
  });

  it('honors the limit when reading the conversation', async () => {
    const created = await repo.createGroup({ name: '限制群', memberSlugs: ['ella', 'lin'] });
    await repo.appendGroupMessages(created.id, [
      makeMsg('user', 'a'),
      makeMsg('user', 'b'),
      makeMsg('user', 'c'),
    ]);
    const last2 = await repo.getGroupConversation(created.id, 2);
    expect(last2.map((m) => m.content)).toEqual(['b', 'c']);
  });

  it('deletes the group and its messages', async () => {
    const created = await repo.createGroup({ name: '待删群', memberSlugs: ['ella', 'lin'] });
    await repo.appendGroupMessages(created.id, [makeMsg('user', '要被删掉的话')]);

    expect(await repo.deleteGroup(created.id)).toBe(true);
    expect(await repo.getGroup(created.id)).toBeNull();
    expect((await repo.listGroups()).map((g) => g.id)).not.toContain(created.id);
    expect(await repo.getGroupConversation(created.id, 0)).toEqual([]);
  });

  it('returns false when deleting an unknown group', async () => {
    expect(await repo.deleteGroup('group-missing')).toBe(false);
  });
});
