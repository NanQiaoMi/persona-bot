import { describe, expect, it } from 'vitest';
import { countUnreadAfter } from '@/lib/group/unread';

const m = (id: string, role: 'user' | 'assistant') => ({ id, role });

describe('群聊未读数', () => {
  const msgs = [m('1', 'assistant'), m('2', 'user'), m('3', 'assistant'), m('4', 'assistant'), m('5', 'user')];

  it('只数你看过的那条之后、群友发的消息', () => {
    expect(countUnreadAfter(msgs, '2')).toBe(2);
    expect(countUnreadAfter(msgs, '5')).toBe(0);
  });

  it('没看过这个群时不显示未读；看过的那条已被裁掉时按全部群友消息算', () => {
    expect(countUnreadAfter(msgs, undefined)).toBe(0);
    expect(countUnreadAfter(msgs, 'gone')).toBe(3);
  });

  it('最多显示 99', () => {
    const many = Array.from({ length: 150 }, (_, i) => m(`a${i}`, 'assistant'));
    expect(countUnreadAfter([m('s', 'user'), ...many], 's')).toBe(99);
  });
});
