import { describe, expect, it } from 'vitest';
import { decideAmbient } from '@/lib/group/ambient';
import { mentionsAll, pickSpeakers } from '@/lib/group/director';
import { countUnreadAfter } from '@/lib/group/unread';
import type { ConversationMessage } from '@/lib/storage/types';

const five = ['a', 'b', 'c', 'd', 'e'].map((s) => ({ slug: s, name: `成员${s.toUpperCase()}` }));
const history: ConversationMessage[] = [];

describe('@所有人', () => {
  it('能识别 @所有人 / @全体成员 / @all，普通的「所有人」不算', () => {
    expect(mentionsAll('@所有人 晚上吃啥')).toBe(true);
    expect(mentionsAll('@全体成员 开会')).toBe(true);
    expect(mentionsAll('@all 起床')).toBe(true);
    expect(mentionsAll('所有人都在吗')).toBe(false);
    expect(mentionsAll('@allen 你好')).toBe(false);
  });

  it('群里每个 Bot 都回，不受一轮 3 人上限限制，也不重复', () => {
    const result = pickSpeakers({ text: '@所有人 晚上吃啥', members: five, history, random: () => 0.5 });
    expect(result).toHaveLength(5);
    expect(new Set(result.map((m) => m.slug)).size).toBe(5);
  });

  it('睡着的也会被叫醒，但排在醒着的后面；单独点名的人先说', () => {
    const result = pickSpeakers({
      text: '@所有人 @成员E 你先说',
      members: five,
      history,
      random: () => 0.5,
      availabilityOf: (slug) => (slug === 'a' ? 'asleep' : 'free'),
    });
    expect(result).toHaveLength(5);
    expect(result[0].slug).toBe('e');
    expect(result[result.length - 1].slug).toBe('a');
  });
});

describe('群聊未读：空群', () => {
  const msgs = [
    { id: '1', role: 'assistant' },
    { id: '2', role: 'assistant' },
  ];
  it("见到时还是空群（记成 ''）：之后群友发的都算未读", () => {
    expect(countUnreadAfter(msgs, '')).toBe(2);
  });
});

describe('群聊补聊：补过一次之后，下一段空档还能再补', () => {
  const at = (h: number, m = 0, day = 25) => new Date(2026, 10, day, h, m);
  const quietHistory = [
    { id: 'x', role: 'assistant', content: '好的', timestamp: at(20).toISOString() } as ConversationMessage,
  ];
  const done = { ambientLog: [at(22).toISOString()], createdAt: at(8).toISOString() };
  it('上次补聊后不到 2 小时不补，超过 2 小时再补', () => {
    expect(decideAmbient({ mode: 'catchup', group: done, history: quietHistory, now: at(23), memberCount: 3 }).ok).toBe(false);
    expect(
      decideAmbient({ mode: 'catchup', group: done, history: quietHistory, now: at(0, 30, 26), memberCount: 3 }).ok
    ).toBe(true);
  });
});
