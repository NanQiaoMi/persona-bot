import { describe, expect, it } from 'vitest';
import { analyzeRecentRepetition, extractOpener } from '@/lib/persona/repetition-guard';
import {
  buildExtractiveSummary,
  buildSummaryDirective,
  computeNextSummary,
  planSummaryRefresh,
  PROMPT_WINDOW,
} from '@/lib/persona/conversation-summary';
import {
  buildConversationMemoryDirectives,
  refreshConversationMemory,
} from '@/lib/persona/conversation-memory';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage } from '@/lib/storage/types';

function msg(i: number, role: 'user' | 'assistant', content: string): ConversationMessage {
  return { id: `m${i}`, role, content, timestamp: new Date(2026, 10, 25, 10, 0, i).toISOString() };
}

function chat(n: number): ConversationMessage[] {
  return Array.from({ length: n }, (_, i) =>
    i % 2 === 0
      ? msg(i, 'user', `我今天第${i}件事是去公司附近吃了一家新开的面馆`)
      : msg(i, 'assistant', `听起来不错，第${i}条回复`)
  );
}

describe('防重复', () => {
  it('提取气泡开头的短起手式', () => {
    expect(extractOpener('笑死，你也太惨了')).toBe('笑死');
    expect(extractOpener('……哈哈 真的假的')).toBe('哈哈');
    expect(extractOpener('今天公司楼下新开了一家店')).toBeNull();
  });

  it('少于 3 条时不提示', () => {
    expect(analyzeRecentRepetition(['笑死', '笑死']).directive).toBe('');
  });

  it('发现重复开头、口头禅与句尾习惯并生成提示', () => {
    const bubbles = [
      '笑死，你又熬夜了～',
      '笑死 这也太离谱了～',
      '确实离谱，老板脑子有坑吧～',
      '笑死，我先替你骂两句～',
      '确实，换我也顶不住～',
      '你先睡吧确实太晚了～',
    ];
    const report = analyzeRecentRepetition(bubbles);
    expect(report.openers[0]).toEqual({ text: '笑死', count: 3 });
    expect(report.phrases.map((p) => p.text)).toEqual(expect.arrayContaining(['笑死', '确实']));
    expect(report.trailingHabit?.text).toBe('～');
    expect(report.directive).toContain('别重复自己');
    expect(report.directive).toContain('「笑死」');
  });

  it('内容各不相同时不提示', () => {
    const report = analyzeRecentRepetition([
      '你说的那家店我上周去过',
      '面还行，汤一般',
      '下次带你去另一家',
      '在公司对面那条街',
    ]);
    expect(report.directive).toBe('');
  });
});

describe('滚动摘要', () => {
  it('还没滑出窗口时不需要摘要', () => {
    expect(planSummaryRefresh(chat(PROMPT_WINDOW), null).shouldRefresh).toBe(false);
  });

  it('首次有 4 条滑出窗口就生成；之后每 12 条更新一次', () => {
    const all = chat(PROMPT_WINDOW + 4);
    const first = planSummaryRefresh(all, null);
    expect(first.shouldRefresh).toBe(true);
    expect(first.toSummarize).toHaveLength(4);

    const state = { text: '- 旧', coveredUntilId: 'm3', updatedAt: '', source: 'extractive' as const };
    expect(planSummaryRefresh(chat(PROMPT_WINDOW + 10), state).shouldRefresh).toBe(false);
    const later = planSummaryRefresh(chat(PROMPT_WINDOW + 16), state);
    expect(later.shouldRefresh).toBe(true);
    expect(later.toSummarize[0].id).toBe('m4');
  });

  it('覆盖点在记录里找不到时从头重新摘要', () => {
    const state = { text: '- 旧', coveredUntilId: 'gone', updatedAt: '', source: 'extractive' as const };
    const plan = planSummaryRefresh(chat(PROMPT_WINDOW + 12), state);
    expect(plan.toSummarize[0].id).toBe('m0');
  });

  it('规则兜底只保留对方有信息量的话，并限制长度', () => {
    const text = buildExtractiveSummary('', [
      msg(1, 'user', '哈哈哈'),
      msg(2, 'user', '下周三我要去面试一家游戏公司'),
      msg(3, 'assistant', '加油'),
      msg(4, 'user', 'ok'),
    ]);
    expect(text).toBe('- 对方说过：下周三我要去面试一家游戏公司');
    const long = buildExtractiveSummary(
      '',
      Array.from({ length: 40 }, (_, i) => msg(i, 'user', `这是第${i}条很长很长很长很长很长很长的近况描述`))
    );
    expect(long.split('\n').length).toBeLessThanOrEqual(14);
    expect(long.length).toBeLessThanOrEqual(900);
  });

  it('没有模型时用规则兜底生成摘要状态', async () => {
    const next = await computeNextSummary({
      all: chat(PROMPT_WINDOW + 6),
      state: null,
      personaName: '林晚',
      llm: null,
    });
    expect(next?.source).toBe('extractive');
    expect(next?.text).toContain('面馆');
    expect(next?.coveredUntilId).toBe('m5');
  });

  it('摘要提示词提醒不要背诵', () => {
    expect(buildSummaryDirective(null)).toBe('');
    const d = buildSummaryDirective({ text: '- 对方在准备面试', updatedAt: '', source: 'llm' });
    expect(d).toContain('更早之前');
    expect(d).toContain('不要突然复述');
  });
});

describe('长记忆维护（存储联动）', () => {
  it('提取待关心的事、到点后出现在提示词里、问过之后不再出现', async () => {
    const slug = 'lin-wan';
    await storageRepo.saveConversation(slug, []);
    await storageRepo.updateMemoryState(slug, () => ({}));

    const wed = new Date(2026, 10, 25, 15, 0);
    await refreshConversationMemory({
      slug,
      personaName: '林晚',
      userText: '明天要面试了好紧张',
      reply: '你肯定行',
      now: wed,
    });
    let state = await storageRepo.getMemoryState(slug);
    expect(state.pendingTopics?.some((t) => t.label.includes('面试'))).toBe(true);

    // 第二天晚上 22 点：面试已经结束，可以顺口问
    const thuNight = new Date(2026, 10, 26, 22, 0);
    expect(buildConversationMemoryDirectives(state, thuNight)).toContain('面试');
    expect(buildConversationMemoryDirectives(state, wed)).not.toContain('面试');

    await refreshConversationMemory({
      slug,
      personaName: '林晚',
      userText: '在吗',
      reply: '面试咋样了，顺利吗',
      now: thuNight,
    });
    state = await storageRepo.getMemoryState(slug);
    expect(buildConversationMemoryDirectives(state, thuNight)).not.toContain('面试');
  });

  it('清空聊天记录时一并清空摘要和待关心的事', async () => {
    const slug = 'lin-wan';
    await storageRepo.updateMemoryState(slug, () => ({
      summary: { text: '- 旧摘要', updatedAt: '', source: 'extractive' },
      pendingTopics: [],
    }));
    const { POST } = await import('@/app/api/conversations/route');
    const res = await POST(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ slug, messages: [] }),
      })
    );
    expect((await res.json()).success).toBe(true);
    expect((await storageRepo.getMemoryState(slug)).summary).toBeUndefined();
  });
});

describe('提示词去掉可抄的范例', () => {
  it('内心戏说明里不再有固定范例，并要求闲聊不用列表', () => {
    const prompt = new PromptAssembler().assembleSystemPrompt(
      { persona_md: '', memories_md: '', ai_profile: '', meta: { name: '测试' } },
      undefined,
      '你好',
      { thinkMode: true }
    );
    expect(prompt).not.toContain('勿照抄');
    expect(prompt).not.toContain('尾巴都快翘天上去了');
    expect(prompt).toContain('不要每轮都用同一种反应');
    expect(prompt).toContain('聊天不是写文章');
  });
});
