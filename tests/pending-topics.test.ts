import { describe, it, expect } from 'vitest';
import {
  buildPendingTopicDirective,
  extractPendingTopics,
  getDueTopics,
  markAskedTopics,
  mergePendingTopics,
  type PendingTopic,
} from '@/lib/persona/pending-topics';

// 2026-11-25 周三 15:00（本地时间）
const NOW = new Date(2026, 10, 25, 15, 0);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 2026 年本地时间某月某日某点的 ISO（month 默认 10 即 11 月） */
function localIso(day: number, hour: number, month = 10): string {
  return new Date(2026, month, day, hour, 0, 0, 0).toISOString();
}

function msAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function topic(overrides: Partial<PendingTopic> = {}): PendingTopic {
  return {
    id: 'topic_test_0',
    label: '面试',
    snippet: '明天要面试了好紧张',
    keywords: ['面试'],
    mentionedAt: NOW.toISOString(),
    dueAt: localIso(26, 20),
    status: 'open',
    ...overrides,
  };
}

function extractOne(text: string, now: Date = NOW) {
  const result = extractPendingTopics(text, now);
  expect(result).toHaveLength(1);
  return result[0];
}

describe('extractPendingTopics: 时间词解析', () => {
  it('明天 -> 次日 20:00', () => {
    const t = extractOne('明天要面试了好紧张');
    expect(t.label).toBe('面试');
    expect(t.dueAt).toBe(localIso(26, 20));
    expect(t.mentionedAt).toBe(NOW.toISOString());
    expect(t.snippet).toBe('明天要面试了好紧张');
    expect(t.keywords).toContain('面试');
  });

  it('明早 / 明晚 -> 次日 20:00', () => {
    expect(extractOne('明早体检').dueAt).toBe(localIso(26, 20));
    expect(extractOne('明晚约会').dueAt).toBe(localIso(26, 20));
  });

  it('待会 -> 当前时间 +2 小时', () => {
    const t = extractOne('待会去体检');
    expect(t.label).toBe('体检');
    expect(new Date(t.dueAt).getTime()).toBe(NOW.getTime() + 2 * HOUR_MS);
  });

  it('一会儿 / 马上 同样视为 +2 小时', () => {
    expect(new Date(extractOne('一会儿看病').dueAt).getTime()).toBe(NOW.getTime() + 2 * HOUR_MS);
    expect(new Date(extractOne('马上搬家').dueAt).getTime()).toBe(NOW.getTime() + 2 * HOUR_MS);
  });

  it('今晚 / 晚上 -> 当天 23:00', () => {
    expect(extractOne('今晚搬家').dueAt).toBe(localIso(25, 23));
    expect(extractOne('晚上和她第一次约会').dueAt).toBe(localIso(25, 23));
    expect(extractOne('晚上和她第一次约会').label).toBe('约会');
  });

  it('下午 -> 当天 23:00', () => {
    expect(extractOne('下午看病').dueAt).toBe(localIso(25, 23));
  });

  it('后天 -> +2 天 20:00', () => {
    expect(extractOne('后天去拔牙').dueAt).toBe(localIso(27, 20));
  });

  it('下个月 / 月底 -> +30 天 20:00', () => {
    const t = extractOne('下个月出差去上海');
    expect(t.label).toBe('出差去上海');
    expect(t.dueAt).toBe(localIso(25, 20, 11));
    expect(t.keywords).toEqual(expect.arrayContaining(['出差去上海', '出差', '上海']));
  });

  it('周末 / 这周末 -> 本周六 20:00', () => {
    expect(extractOne('周末要搬家').dueAt).toBe(localIso(28, 20));
    expect(extractOne('这周末搬家').dueAt).toBe(localIso(28, 20));
  });
});

describe('extractPendingTopics: 星期 next-occurrence 计算（now 为周三）', () => {
  it('周五 -> 本周五 20:00', () => {
    expect(extractOne('周五面试').dueAt).toBe(localIso(27, 20));
  });

  it('这周五 -> 本周五 20:00', () => {
    expect(extractOne('这周五面试').dueAt).toBe(localIso(27, 20));
  });

  it('同一个星期（周三）-> 下一个周三（严格晚于今天）', () => {
    expect(extractOne('周三面试').dueAt).toBe(localIso(2, 20, 11));
  });

  it('周日 / 星期六 / 礼拜天 写法都可以', () => {
    expect(extractOne('周日体检').dueAt).toBe(localIso(29, 20));
    expect(extractOne('星期六面试').dueAt).toBe(localIso(28, 20));
    expect(extractOne('礼拜天体检').dueAt).toBe(localIso(29, 20));
  });

  it('下周三考科目二 -> 下周三 20:00，label 为 科目二考试', () => {
    const t = extractOne('下周三考科目二');
    expect(t.label).toBe('科目二考试');
    expect(t.dueAt).toBe(localIso(2, 20, 11));
    expect(t.keywords).toEqual(expect.arrayContaining(['科目二考试', '科目二', '考试']));
  });

  it('下周一 -> 下一周的周一（11/30）', () => {
    expect(extractOne('下周一面试').dueAt).toBe(localIso(30, 20));
  });

  it('下个星期五 -> 下一周的周五（12/4）', () => {
    expect(extractOne('下个星期五面试').dueAt).toBe(localIso(4, 20, 11));
  });

  it('下周日 -> 下一周的周日（12/6）', () => {
    expect(extractOne('下周日体检').dueAt).toBe(localIso(6, 20, 11));
  });

  it('下周末 -> 下一周的周六（12/5）', () => {
    expect(extractOne('下周末搬家').dueAt).toBe(localIso(5, 20, 11));
  });

  it('下周（无星期）-> +7 天 20:00', () => {
    expect(extractOne('下周搬家').dueAt).toBe(localIso(2, 20, 11));
  });
});

describe('extractPendingTopics: 事件词与 label', () => {
  it('科目一~四 都能识别', () => {
    expect(extractOne('明天考科目一').label).toBe('科目一考试');
    expect(extractOne('明天考科目四').label).toBe('科目四考试');
  });

  it('出差去上海 带上目的地，去掉句末语气词', () => {
    expect(extractOne('下个月出差去上海吧').label).toBe('出差去上海');
  });

  it('出差没有去X时 label 只用事件词', () => {
    expect(extractOne('明天去上海出差').label).toBe('出差');
  });

  it('飞去北京 带上目的地', () => {
    expect(extractOne('明天飞去北京').label).toBe('飞去北京');
  });

  it('飞快 之类的词不算航班事件', () => {
    expect(extractPendingTopics('明天飞快地跑步', NOW)).toEqual([]);
  });

  it('ddl 与 截止 都识别，ddl 统一小写', () => {
    expect(extractOne('周五ddl').label).toBe('ddl');
    expect(extractOne('周五DDL').label).toBe('ddl');
    expect(extractOne('周五截止交稿').label).toBe('截止');
  });

  it('开会 只有提到 重要/大 时才算事件', () => {
    expect(extractOne('明天开一个重要的会').label).toBe('开会');
    expect(extractPendingTopics('明天开会', NOW)).toEqual([]);
  });

  it('同一子句有多个事件词时取最靠前的', () => {
    const result = extractPendingTopics('明天要面试和体检', NOW);
    expect(result.map((t) => t.label)).toEqual(['面试']);
  });

  it('label 不超过 16 字，snippet 不超过 40 字', () => {
    const longText = '明天出差去上海浦东机场附近的一个很长很长的地方' + '啊'.repeat(40);
    const t = extractOne(longText);
    expect(t.label.length).toBeLessThanOrEqual(16);
    expect(t.snippet.length).toBeLessThanOrEqual(40);
  });
});

describe('extractPendingTopics: 过去式与否定跳过', () => {
  it('昨天面试完了 -> 不记录', () => {
    expect(extractPendingTopics('昨天面试完了', NOW)).toEqual([]);
  });

  it('已经考试了 -> 不记录', () => {
    expect(extractPendingTopics('已经考试了，明天没事', NOW)).toEqual([]);
  });

  it('刚面试完了 + 明天体检 -> 只记录体检', () => {
    const result = extractPendingTopics('刚面试完了，明天体检', NOW);
    expect(result.map((t) => t.label)).toEqual(['体检']);
  });

  it('面试完了 这一子句跳过，后面的子句照常记录', () => {
    const result = extractPendingTopics('面试完了，明天体检', NOW);
    expect(result.map((t) => t.label)).toEqual(['体检']);
  });

  it('上周三面试 -> 过去的事，不记录', () => {
    expect(extractPendingTopics('上周三面试', NOW)).toEqual([]);
  });

  it('明天不去面试 -> 否定，不记录', () => {
    expect(extractPendingTopics('明天不去面试', NOW)).toEqual([]);
  });

  it('明天面试了好紧张（了 在事件词后面但没有过去标记）-> 照常记录', () => {
    expect(extractOne('明天要面试了好紧张').label).toBe('面试');
  });

  it('已经约好明天去体检（已经 但不是完成语义）-> 照常记录', () => {
    expect(extractOne('已经约好明天去体检').label).toBe('体检');
  });
});

describe('extractPendingTopics: 无时间词 / 无事件词 / 上限', () => {
  it('没有时间词 -> 空数组', () => {
    expect(extractPendingTopics('面试很难', NOW)).toEqual([]);
    expect(extractPendingTopics('去体检吧', NOW)).toEqual([]);
  });

  it('没有事件词 -> 空数组', () => {
    expect(extractPendingTopics('明天天气不错', NOW)).toEqual([]);
    expect(extractPendingTopics('明天', NOW)).toEqual([]);
  });

  it('空字符串 -> 空数组', () => {
    expect(extractPendingTopics('', NOW)).toEqual([]);
  });

  it('同一条消息最多 3 个话题', () => {
    const result = extractPendingTopics('明天面试，后天体检，周五搬家，下周考研', NOW);
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.label)).toEqual(['面试', '体检', '搬家']);
  });

  it('同一条消息里相同 label 只保留一个', () => {
    const result = extractPendingTopics('明天面试，后天面试', NOW);
    expect(result).toHaveLength(1);
    expect(result[0].dueAt).toBe(localIso(26, 20));
  });

  it('以 , . ! ? 换行 和 然后 切分子句', () => {
    const result = extractPendingTopics('明天面试!然后后天体检\n周五搬家?', NOW);
    expect(result.map((t) => t.label)).toEqual(['面试', '体检', '搬家']);
  });
});

describe('mergePendingTopics', () => {
  const incomingFace = {
    label: '面试',
    snippet: '明天要面试',
    keywords: ['面试'],
    mentionedAt: NOW.toISOString(),
    dueAt: localIso(26, 20),
  };

  it('空列表合并新话题：生成 id、状态为 open', () => {
    const result = mergePendingTopics([], [incomingFace], NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: `topic_${NOW.getTime().toString(36)}_0`,
      label: '面试',
      status: 'open',
      dueAt: localIso(26, 20),
    });
  });

  it('多个新话题的 id 各不相同', () => {
    const second = { ...incomingFace, label: '体检', keywords: ['体检'] };
    const result = mergePendingTopics([], [incomingFace, second], NOW);
    expect(result.map((t) => t.id).sort()).toEqual([
      `topic_${NOW.getTime().toString(36)}_0`,
      `topic_${NOW.getTime().toString(36)}_1`,
    ]);
  });

  it('同 label 的 open 话题只更新 dueAt / snippet，不重复新增', () => {
    const existing = [topic({ id: 'old', dueAt: localIso(26, 20), snippet: '明天要面试' })];
    const result = mergePendingTopics(
      existing,
      [{ ...incomingFace, snippet: '后天面试', dueAt: localIso(27, 20) }],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('old');
    expect(result[0].dueAt).toBe(localIso(27, 20));
    expect(result[0].snippet).toBe('后天面试');
  });

  it('关键词有重叠的 open 话题也视为同一件事（label 不同）', () => {
    const existing = [
      topic({ id: 'trip', label: '出差去上海', keywords: ['出差去上海', '出差', '上海'] }),
    ];
    const result = mergePendingTopics(
      existing,
      [{ label: '出差', snippet: '出差', keywords: ['出差'], mentionedAt: NOW.toISOString(), dueAt: localIso(30, 20) }],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('trip');
    expect(result[0].dueAt).toBe(localIso(30, 20));
  });

  it('已经 asked 的同名话题不会被合并覆盖，而是新增一条 open', () => {
    const existing = [topic({ id: 'done', status: 'asked', askedAt: NOW.toISOString() })];
    const result = mergePendingTopics(existing, [incomingFace], NOW);
    expect(result).toHaveLength(2);
    expect(result.find((t) => t.id === 'done')?.status).toBe('asked');
    expect(result.filter((t) => t.status === 'open')).toHaveLength(1);
  });

  it('上限 12 条：优先保留 open，超出时保留更新的', () => {
    const asked = Array.from({ length: 5 }, (_, i) =>
      topic({
        id: `asked_${i}`,
        label: `旧事件${i}`,
        keywords: [`旧事件${i}`],
        status: 'asked',
        mentionedAt: msAgo((10 - i) * HOUR_MS),
        dueAt: localIso(26, 20),
      }),
    );
    const incoming = Array.from({ length: 10 }, (_, i) => ({
      label: `事件${i}`,
      snippet: `事件${i}`,
      keywords: [`事件${i}`],
      mentionedAt: NOW.toISOString(),
      dueAt: localIso(26, 20),
    }));
    const result = mergePendingTopics(asked, incoming, NOW);
    expect(result).toHaveLength(12);
    expect(result.filter((t) => t.status === 'open')).toHaveLength(10);
    expect(result.filter((t) => t.status === 'asked')).toHaveLength(2);
  });

  it('上限 12 条：全部是 open 时丢弃最旧的', () => {
    const existing = Array.from({ length: 13 }, (_, i) =>
      topic({
        id: `e_${i}`,
        label: `e${i}`,
        keywords: [`e${i}`],
        mentionedAt: msAgo((13 - i) * HOUR_MS),
        dueAt: localIso(26, 20),
      }),
    );
    const result = mergePendingTopics(existing, [], NOW);
    expect(result).toHaveLength(12);
    expect(result.map((t) => t.id)).not.toContain('e_0');
    expect(result.map((t) => t.id)).toContain('e_12');
  });

  it('dueAt 超过 7 天前的变为 expired；超过 14 天的丢弃', () => {
    const existing = [
      topic({ id: 'stale_open', label: 'A', keywords: ['A'], dueAt: msAgo(8 * DAY_MS) }),
      topic({ id: 'very_old', label: 'B', keywords: ['B'], dueAt: msAgo(15 * DAY_MS) }),
      topic({ id: 'expired_recent', label: 'C', keywords: ['C'], status: 'expired', dueAt: msAgo(10 * DAY_MS) }),
      topic({ id: 'asked_recent', label: 'D', keywords: ['D'], status: 'asked', dueAt: msAgo(3 * DAY_MS) }),
      topic({ id: 'open_recent', label: 'E', keywords: ['E'], dueAt: msAgo(3 * DAY_MS) }),
    ];
    const result = mergePendingTopics(existing, [], NOW);
    const byId = Object.fromEntries(result.map((t) => [t.id, t.status]));
    expect(byId.stale_open).toBe('expired');
    expect(byId.very_old).toBeUndefined();
    expect(byId.expired_recent).toBe('expired');
    expect(byId.asked_recent).toBe('asked');
    expect(byId.open_recent).toBe('open');
  });

  it('不修改传入的数组', () => {
    const existing = [topic({ id: 'keep' })];
    const snapshot = JSON.stringify(existing);
    mergePendingTopics(existing, [incomingFace], NOW);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });
});

describe('getDueTopics', () => {
  it('已到期、提及超过 2 小时、open -> 返回', () => {
    const t = topic({ mentionedAt: msAgo(3 * HOUR_MS), dueAt: msAgo(1 * HOUR_MS) });
    expect(getDueTopics([t], NOW)).toEqual([t]);
  });

  it('提及不足 2 小时 -> 不立刻追问', () => {
    const t = topic({ mentionedAt: msAgo(1 * HOUR_MS), dueAt: msAgo(30 * 60 * 1000) });
    expect(getDueTopics([t], NOW)).toEqual([]);
  });

  it('提及恰好 2 小时前 -> 可以问（边界包含）', () => {
    const t = topic({ mentionedAt: msAgo(2 * HOUR_MS), dueAt: NOW.toISOString() });
    expect(getDueTopics([t], NOW)).toHaveLength(1);
  });

  it('还没到期 -> 不返回', () => {
    const t = topic({ mentionedAt: msAgo(5 * HOUR_MS), dueAt: new Date(NOW.getTime() + HOUR_MS).toISOString() });
    expect(getDueTopics([t], NOW)).toEqual([]);
  });

  it('到期超过 7 天 -> 不返回，恰好 7 天内 -> 返回', () => {
    const tooOld = topic({ id: 'a', mentionedAt: msAgo(9 * DAY_MS), dueAt: msAgo(8 * DAY_MS) });
    const edge = topic({ id: 'b', mentionedAt: msAgo(9 * DAY_MS), dueAt: msAgo(7 * DAY_MS) });
    expect(getDueTopics([tooOld], NOW)).toEqual([]);
    expect(getDueTopics([edge], NOW)).toHaveLength(1);
  });

  it('非 open 状态不返回', () => {
    const asked = topic({ status: 'asked', mentionedAt: msAgo(5 * HOUR_MS), dueAt: msAgo(HOUR_MS) });
    const expired = topic({ status: 'expired', mentionedAt: msAgo(5 * HOUR_MS), dueAt: msAgo(HOUR_MS) });
    expect(getDueTopics([asked, expired], NOW)).toEqual([]);
  });

  it('最多返回 2 条，并按到期时间从早到晚', () => {
    const a = topic({ id: 'a', label: 'a', keywords: ['a'], mentionedAt: msAgo(5 * HOUR_MS), dueAt: msAgo(1 * HOUR_MS) });
    const b = topic({ id: 'b', label: 'b', keywords: ['b'], mentionedAt: msAgo(5 * HOUR_MS), dueAt: msAgo(3 * HOUR_MS) });
    const c = topic({ id: 'c', label: 'c', keywords: ['c'], mentionedAt: msAgo(5 * HOUR_MS), dueAt: msAgo(2 * HOUR_MS) });
    expect(getDueTopics([a, b, c], NOW).map((t) => t.id)).toEqual(['b', 'c']);
  });
});

describe('markAskedTopics', () => {
  it('回复里出现关键词 -> 标记为 asked 并写入 askedAt', () => {
    const [marked] = markAskedTopics([topic()], '面试咋样了？我还挺惦记的', NOW);
    expect(marked.status).toBe('asked');
    expect(marked.askedAt).toBe(NOW.toISOString());
  });

  it('回复里没有任何关键词 -> 保持 open 不变', () => {
    const [unchanged] = markAskedTopics([topic()], '今天天气真好', NOW);
    expect(unchanged.status).toBe('open');
    expect(unchanged.askedAt).toBeUndefined();
  });

  it('关键词匹配不区分大小写', () => {
    const [marked] = markAskedTopics(
      [topic({ label: 'ddl', keywords: ['ddl'] })],
      'DDL 那个弄完了吗',
      NOW,
    );
    expect(marked.status).toBe('asked');
  });

  it('非 open 的话题即使关键词出现也不改动', () => {
    const [expired] = markAskedTopics([topic({ status: 'expired' })], '面试怎么样', NOW);
    expect(expired.status).toBe('expired');
    expect(expired.askedAt).toBeUndefined();
  });

  it('只标记命中的话题，且不修改传入对象', () => {
    const input = [topic({ id: 'x', keywords: ['面试'] }), topic({ id: 'y', label: '体检', keywords: ['体检'] })];
    const result = markAskedTopics(input, '体检报告出来了吗', NOW);
    expect(result.find((t) => t.id === 'x')?.status).toBe('open');
    expect(result.find((t) => t.id === 'y')?.status).toBe('asked');
    expect(input[1].status).toBe('open');
  });
});

describe('buildPendingTopicDirective', () => {
  it('没有可问的话题 -> 空字符串', () => {
    expect(buildPendingTopicDirective([])).toBe('');
  });

  it('有话题 -> 包含标题、每条话题与收尾规则', () => {
    const directive = buildPendingTopicDirective([
      topic({ snippet: '明天要面试了好紧张', label: '面试' }),
    ]);
    const lines = directive.split('\n');
    expect(lines[0]).toBe('## 可以顺口关心的事');
    expect(lines[1]).toBe('- 对方之前说过「明天要面试了好紧张」（面试），现在应该已经有结果了');
    expect(lines[2]).toBe('- 只在聊天自然的时候顺口问一句，像朋友惦记着那样；别一上来就连环追问，问过一次就不要再问。');
    expect(lines).toHaveLength(3);
  });

  it('多条话题 -> 每条一行，规则行只出现一次', () => {
    const directive = buildPendingTopicDirective([
      topic({ id: 'a', snippet: '明天面试', label: '面试' }),
      topic({ id: 'b', snippet: '待会体检', label: '体检' }),
    ]);
    expect(directive).toContain('- 对方之前说过「明天面试」（面试），现在应该已经有结果了');
    expect(directive).toContain('- 对方之前说过「待会体检」（体检），现在应该已经有结果了');
    expect(directive.match(/连环追问/g)).toHaveLength(1);
  });
});
