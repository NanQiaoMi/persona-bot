import { describe, expect, it } from 'vitest';
import {
  buildPresenceDirective,
  computeReplyLatencyMs,
  getPresenceState,
  pickRhythmArchetype,
  presenceStatusText,
  rhythmShiftMinutes,
  typingSpeedFactor,
} from '@/lib/persona/daily-rhythm';
import {
  collectTrailingUserTurn,
  executeGrokChatTurn,
  filterUnsavedUserTurns,
  parseStructuredModelOutput,
} from '@/lib/grok/stream-orchestrator';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage } from '@/lib/storage/types';

/** 构造本地时间某天某时刻（2026-11-25 是周三，2026-11-28 是周六） */
function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 10, day, hour, minute, 0);
}

describe('作息模板匹配', () => {
  it('按职业与标签匹配作息类型，匹配不上用上班族', () => {
    expect(pickRhythmArchetype({ occupation: '独立插画师' })).toBe('creative');
    expect(pickRhythmArchetype({ occupation: '科技媒体毒舌主笔 / 深夜冲浪选手' })).toBe('night_owl');
    expect(pickRhythmArchetype({ occupation: '大三学生' })).toBe('student');
    expect(pickRhythmArchetype({ occupation: '系统架构师' })).toBe('office');
    expect(pickRhythmArchetype({ occupation: '' })).toBe('office');
    expect(pickRhythmArchetype(undefined)).toBe('office');
  });

  it('每个角色的作息偏移固定在 ±30 分钟内', () => {
    for (const slug of ['lu-xi', 'xia-you', 'shen-zhi', 'chen-ye', 'a', 'b']) {
      const shift = rhythmShiftMinutes(slug);
      expect(shift).toBeGreaterThanOrEqual(-30);
      expect(shift).toBeLessThanOrEqual(30);
      expect(rhythmShiftMinutes(slug)).toBe(shift);
    }
  });
});

describe('此刻在场状态', () => {
  const office = { slug: 'tester', name: '测试', profile: { occupation: '产品经理' } };

  it('工作日凌晨在睡觉、上午在忙、晚上空闲', () => {
    expect(getPresenceState(office, at(25, 3)).availability).toBe('asleep');
    expect(getPresenceState(office, at(25, 10, 30)).availability).toBe('busy');
    expect(getPresenceState(office, at(25, 21)).availability).toBe('free');
  });

  it('周末和工作日用不同的时间表', () => {
    expect(getPresenceState(office, at(25, 10, 30)).isWeekend).toBe(false);
    expect(getPresenceState(office, at(28, 10, 30)).isWeekend).toBe(true);
  });

  it('同一天同一时段的活动保持稳定，且有下一时段信息', () => {
    const a = getPresenceState(office, at(25, 10, 30));
    const b = getPresenceState(office, at(25, 10, 45));
    expect(a.activity).toBeTruthy();
    expect(a.activity).toBe(b.activity);
    expect(a.minutesUntilChange).toBeGreaterThan(0);
    expect(a.nextActivity).toBeTruthy();
  });

  it('提示词说明按状态区分，并提醒不要每轮汇报行程', () => {
    const busy = buildPresenceDirective(getPresenceState(office, at(25, 10, 30)));
    expect(busy).toContain('在忙');
    expect(busy).toContain('FOLLOWUP');
    const asleep = buildPresenceDirective(getPresenceState(office, at(25, 3)));
    expect(asleep).toContain('睡觉');
    const free = buildPresenceDirective(getPresenceState(office, at(25, 21)));
    expect(free).toContain('比较闲');
    expect(free).toContain('不要每轮都汇报行程');
  });

  it('忙或睡着时等待期有状态文案，闲时没有', () => {
    expect(presenceStatusText('测试', getPresenceState(office, at(25, 10, 30)))).toContain('还没看到消息');
    expect(presenceStatusText('测试', getPresenceState(office, at(25, 3)))).toContain('睡觉');
    expect(presenceStatusText('测试', getPresenceState(office, at(25, 21)))).toBeNull();
  });
});

describe('回复延迟与打字速度', () => {
  it('闲时快、忙时慢、上限 10 秒；越亲密越快', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const free = computeReplyLatencyMs({ availability: 'free', intimacy: 60, seed });
      const busy = computeReplyLatencyMs({ availability: 'busy', intimacy: 60, seed });
      const asleep = computeReplyLatencyMs({ availability: 'asleep', intimacy: 60, seed });
      expect(free).toBeLessThanOrEqual(2500);
      expect(busy).toBeGreaterThanOrEqual(4000);
      expect(asleep).toBeLessThanOrEqual(10_000);
      expect(computeReplyLatencyMs({ availability: 'busy', intimacy: 90, seed })).toBeLessThan(busy);
    }
  });

  it('深夜、忙碌更慢，激动和很熟时更快，倍率有上下限', () => {
    const base = typingSpeedFactor({ availability: 'free', hour: 15 });
    expect(base).toBe(1);
    expect(typingSpeedFactor({ availability: 'busy', hour: 15 })).toBeGreaterThan(base);
    expect(typingSpeedFactor({ availability: 'asleep', hour: 3 })).toBeGreaterThan(1.3);
    expect(typingSpeedFactor({ availability: 'free', hour: 15, arousal: 0.8, intimacy: 90 })).toBeLessThan(base);
    expect(typingSpeedFactor({ availability: 'asleep', hour: 3, intimacy: 10 })).toBeLessThanOrEqual(1.8);
  });
});

describe('连发合并', () => {
  it('只取末尾连续的用户消息，最多 6 条', () => {
    const msgs = [
      { role: 'user' as const, content: '早' },
      { role: 'assistant' as const, content: '早啊' },
      { role: 'user' as const, content: '我跟你说' },
      { role: 'user' as const, content: '今天好离谱' },
      { role: 'user' as const, content: '老板又改需求了' },
    ];
    expect(collectTrailingUserTurn(msgs).map((m) => m.content)).toEqual([
      '我跟你说',
      '今天好离谱',
      '老板又改需求了',
    ]);
    expect(collectTrailingUserTurn([{ role: 'assistant', content: 'x' }])).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ role: 'user' as const, content: `${i}` }));
    expect(collectTrailingUserTurn(many)).toHaveLength(6);
  });

  it('已经存过的用户消息不会再存一遍', () => {
    const stored: ConversationMessage[] = [
      { id: '1', role: 'user', content: '我跟你说', timestamp: 't1' },
    ];
    const turns = [
      { content: '我跟你说', timestamp: 't1' },
      { content: '今天好离谱', timestamp: 't2' },
    ];
    expect(filterUnsavedUserTurns(turns, stored).map((t) => t.content)).toEqual(['今天好离谱']);
  });

  it('一轮里连发的三条都写进聊天记录，重试时不会重复写', async () => {
    const slug = 'lin-wan';
    await storageRepo.saveConversation(slug, []);
    const ts = (n: number) => new Date(Date.UTC(2026, 10, 25, 12, 0, n)).toISOString();
    const messages = [
      { role: 'user' as const, content: '我跟你说', timestamp: ts(1) },
      { role: 'user' as const, content: '今天好离谱', timestamp: ts(2) },
      { role: 'user' as const, content: '老板又改需求了', timestamp: ts(3) },
    ];

    await executeGrokChatTurn({ slug, messages, thinkMode: false, deepSearch: false });
    let saved = await storageRepo.getConversation(slug, 0);
    expect(saved.filter((m) => m.role === 'user').map((m) => m.content)).toEqual([
      '我跟你说',
      '今天好离谱',
      '老板又改需求了',
    ]);

    // 重新生成：客户端把同样三条再带上来
    await executeGrokChatTurn({ slug, messages, thinkMode: false, deepSearch: false });
    saved = await storageRepo.getConversation(slug, 0);
    expect(saved.filter((m) => m.role === 'user')).toHaveLength(3);
  });
});

describe('忙完再补一句', () => {
  it('FOLLOWUP 允许最长 120 秒', () => {
    const parsed = parseStructuredModelOutput('在开会 晚点说[FOLLOWUP: 90 | 开完了，刚才你说的那个事咋了]');
    expect(parsed.followup?.delaySec).toBe(90);
    expect(parseStructuredModelOutput('好[FOLLOWUP: 999 | 嗯]').followup?.delaySec).toBe(120);
  });
});

describe('上游快照式重发去重', () => {
  it('整段快照、段首快照都不会重复拼接；普通增量照常追加', async () => {
    const { mergeStreamDelta } = await import('@/lib/grok/stream-orchestrator');
    const chunks = [
      '……不是吧哥们',
      '\n\n凌晨两点刷到这个，专挑人',
      '\n\n……不是吧哥们\n\n凌晨两点刷到这个，专挑人睡不着的话题是吧',
      '\n\n我刚扒了一圈，最近还真有几个值得',
      '我刚扒了一圈，最近还真有几个值得',
      '关注的案例',
    ];
    const merged = chunks.reduce((acc, c) => mergeStreamDelta(acc, c), '');
    expect(merged).toBe(
      '……不是吧哥们\n\n凌晨两点刷到这个，专挑人睡不着的话题是吧\n\n我刚扒了一圈，最近还真有几个值得关注的案例'
    );

    const normal = ['猫是一种', '可爱又聪明的小动物', '，属于哺乳动物中的猫科动物', '。'];
    expect(normal.reduce((acc, c) => mergeStreamDelta(acc, c), '')).toBe(
      '猫是一种可爱又聪明的小动物，属于哺乳动物中的猫科动物。'
    );
  });
});
