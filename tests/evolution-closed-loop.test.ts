import { afterAll, describe, expect, it } from 'vitest';
import { detectFeedback, evaluateLastTurn } from '@/lib/persona/feedback-signals';
import { admitCandidates, applyTurnQuality, checkAnchorGuard, TRIAL_TURNS } from '@/lib/persona/trial';
import {
  addMemoryWithRetention,
  ARCHIVE_HEADING,
  archiveExpiredSchedules,
  AUTO_MEMORY_HEADING,
  getAutoMemoryLines,
  memoryKey,
  recordRecall,
} from '@/lib/persona/memory-lifecycle';
import { buildFingerprintFromLines } from '@/lib/persona/fingerprint';
import { PersonaSpec, renderPersonaMarkdown } from '@/lib/persona/spec';
import { isEvolutionDue, runPostTurnLearning } from '@/lib/persona/evolution';
import { storageRepo } from '@/lib/storage/repository';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { ConversationMessage } from '@/lib/storage/types';

const emptySpec = (over: Partial<PersonaSpec> = {}): PersonaSpec => ({ specVersion: 1, learned: [], ...over });
const emojiLover = buildFingerprintFromLines(['好耶😆', '冲😆😆', '开心😆', '晚安🌙', '哈哈😆']);

describe('feedback signals', () => {
  it('detects explicit complaints with their dimension', () => {
    expect(detectFeedback('你说话太像AI了').dimension).toBe('tone');
    expect(detectFeedback('别发表情了').dimension).toBe('emoji');
    expect(detectFeedback('太长了吧').dimension).toBe('length');
    const neg = detectFeedback('你好怪');
    expect(neg.explicit).toBe(true);
    expect(neg.polarity).toBe('negative');
  });

  it('scores positive, cold and shrinking replies', () => {
    expect(detectFeedback('哈哈哈笑死').polarity).toBe('positive');
    expect(detectFeedback('嗯').reactionScore).toBeLessThan(50);
    expect(detectFeedback('好', { previousUserAvgLen: 30 }).reasons).toContain('冷淡短回复');
    expect(detectFeedback('今天还行').polarity).toBe('neutral');
  });

  it('evaluates the previous assistant turn using its style metrics and the new user reaction', () => {
    const msgs: ConversationMessage[] = [
      { id: 'u1', role: 'user', content: '在干嘛', timestamp: '' },
      {
        id: 'a1',
        role: 'assistant',
        content: '刚下班',
        timestamp: '',
        styleMetrics: { likeness: 80, deAI: 100, emojiCount: 0, avgBubbleLen: 4, aiClicheHits: 0, oocHits: 0, hostQuestion: false },
      },
      { id: 'u2', role: 'user', content: '哈哈哈 辛苦了', timestamp: '' },
    ];
    const q = evaluateLastTurn(msgs)!;
    expect(q.assistantMsgId).toBe('a1');
    expect(q.styleScore).toBe(90);
    expect(q.quality).toBe(Math.round(90 * 0.6 + q.reactionScore * 0.4));
    expect(evaluateLastTurn(msgs.slice(0, 2))).toBeNull();
  });
});

describe('anti-drift guard and conflict resolution', () => {
  it('rejects rules that contradict the persona’s own fingerprint or rewrite core identity', () => {
    expect(checkAnchorGuard({ kind: 'style', text: '保持纯文字口语回复（0 个 emoji）', source: 'heuristic' }, emojiLover)).toContain('爱用表情');
    expect(checkAnchorGuard({ kind: 'habit', text: '必要时承认自己是AI', source: 'llm' })).toBeTruthy();
    expect(checkAnchorGuard({ kind: 'style', text: '保持纯文字口语回复（0 个 emoji）', source: 'heuristic' })).toBeNull();
  });

  it('new rules enter trial; locked rules in the same dimension cannot be overridden', () => {
    const now = '2026-11-24T00:00:00.000Z';
    const spec = emptySpec({
      recentQuality: [70, 72],
      learned: [
        { id: 'lock', kind: 'style', text: '最多 1 个表情', dimension: 'emoji', source: 'user-edit', evidenceMsgIds: [], confidence: 1, status: 'locked', hitCount: 1, createdAt: now, updatedAt: now },
      ],
    });
    const r = admitCandidates(spec, [
      { kind: 'style', text: '这轮完全不发 emoji', source: 'llm' },
      { kind: 'style', text: '回复别每轮都反问', source: 'llm' },
      { kind: 'habit', text: '对方加班时先问吃饭没', source: 'llm' },
    ]);
    expect(r.rejected.map((x) => x.text)).toEqual(['这轮完全不发 emoji']);
    expect(r.trialed).toHaveLength(2);
    expect(r.trialed.every((it) => it.status === 'trial' && it.trialBaseline === 71)).toBe(true);
  });

  it('a trial rule supersedes the active rule of the same dimension only after passing', () => {
    const now = '2026-11-24T00:00:00.000Z';
    const spec = emptySpec({
      recentQuality: [70],
      learned: [
        { id: 'old', kind: 'style', text: '单条控制在 10 字以内', dimension: 'length', source: 'llm', evidenceMsgIds: [], confidence: 0.5, status: 'active', hitCount: 1, createdAt: now, updatedAt: now },
      ],
    });
    let { spec: s } = admitCandidates(spec, [{ kind: 'style', text: '分两三条短句聊透，别写作文', source: 'llm', confidence: 0.7 }]);
    const trial = s.learned.find((it) => it.status === 'trial')!;
    expect(trial.supersedes).toBe('old');
    const md = renderPersonaMarkdown('# Layer 0\nx', s.learned);
    expect(md).toContain('别写作文（试用中）');
    expect(md).not.toContain('10 字以内');

    const transitions = [];
    for (let i = 0; i < TRIAL_TURNS; i += 1) {
      const r = applyTurnQuality(s, { quality: 75, signal: { explicit: false, reasons: [] } });
      s = r.spec;
      transitions.push(...r.transitions);
    }
    expect(s.learned.find((it) => it.id === trial.id)?.status).toBe('active');
    expect(s.learned.find((it) => it.id === 'old')?.status).toBe('retired');
    expect(transitions.map((t) => t.to)).toEqual(['active', 'retired']);
  });

  it('retires a trial rule whose average quality drops below baseline', () => {
    let { spec: s } = admitCandidates(emptySpec({ recentQuality: [80, 80] }), [
      { kind: 'habit', text: '每次都先讲个冷笑话', source: 'llm' },
    ]);
    for (let i = 0; i < TRIAL_TURNS; i += 1) {
      s = applyTurnQuality(s, { quality: 60, signal: { explicit: false, reasons: [] } }).spec;
    }
    const item = s.learned[0];
    expect(item.status).toBe('retired');
    expect(item.retiredReason).toContain('低于基线');
    expect(s.recentQuality!.length).toBeLessThanOrEqual(12);
  });

  it('retires a trial style rule immediately when the user complains about that dimension', () => {
    let { spec: s } = admitCandidates(emptySpec(), [{ kind: 'style', text: '每轮带 2 个表情活跃气氛', source: 'llm' }]);
    s = applyTurnQuality(s, { quality: 40, signal: { explicit: true, dimension: 'emoji', reasons: ['吐槽表情太多'] } }).spec;
    expect(s.learned[0].status).toBe('retired');
  });
});

describe('memory lifecycle', () => {
  const header = `# 共同记忆\n\n${AUTO_MEMORY_HEADING}\n`;

  it('merges paraphrased memories into the newest wording', () => {
    const md = `${header}- [2026/11/1] 偏好习惯：最喜欢喝杨枝甘露`;
    const r = addMemoryWithRetention(md, '偏好习惯：最喜欢喝杨枝甘露少冰', {}, { dateLabel: '2026/11/20' });
    const lines = getAutoMemoryLines(r.memoriesMd);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('少冰');
    expect(r.stats[memoryKey(lines[0])].importance).toBeGreaterThan(0.7);
  });

  it('evicts by retention score instead of FIFO: old but important memories survive', () => {
    const now = new Date('2026-11-24').getTime();
    const filler = Array.from({ length: 4 }, (_, i) => `- [2026/11/2${i}] 近期日程：周末要去第${i}家店`).join('\n');
    const md = `${header}- [2026/9/1] 个人近况：我对芒果过敏\n${filler}`;
    const r = addMemoryWithRetention(md, '近期日程：下周要去北京', {}, { dateLabel: '2026/11/24', now, cap: 5 });
    expect(r.memoriesMd).toContain('芒果过敏');
    expect(r.evicted).toHaveLength(1);
    expect(r.evicted[0]).toContain('近期日程');
  });

  it('recalled memories gain retention', () => {
    const stats = recordRecall({}, ['- [2026/9/1] 偏好习惯：爱吃辣'], '2026-11-24T00:00:00.000Z');
    expect(Object.values(stats)[0].recallCount).toBe(1);
  });

  it('archives expired one-off schedules instead of deleting them', () => {
    const md = `${header}- [2026/11/1] 近期日程：明天要早起赶地铁\n- [2026/11/2] 偏好习惯：爱喝冰美式`;
    const r = archiveExpiredSchedules(md, new Date(2026, 10, 24));
    expect(r.archivedCount).toBe(1);
    expect(getAutoMemoryLines(r.memoriesMd).join()).not.toContain('赶地铁');
    expect(r.memoriesMd).toContain(ARCHIVE_HEADING);
    expect(r.memoriesMd).toContain('过往日程：明天要早起赶地铁');
  });
});

describe('signal-driven trigger and post-turn learning', () => {
  const SLUG = 'test-closed-loop-bot';
  afterAll(async () => {
    await storageRepo.deletePersona(SLUG);
  });

  it('runs every 8 quiet turns, or after 3 turns once feedback signals pile up', () => {
    expect(isEvolutionDue(4, 0)).toBe(false);
    expect(isEvolutionDue(8, 0)).toBe(true);
    expect(isEvolutionDue(3, 1)).toBe(true);
    expect(isEvolutionDue(2, 5)).toBe(false);
  });

  it('advances trial rules and counts negative feedback after each turn', async () => {
    const base = BUILTIN_PRESETS[1];
    const admitted = admitCandidates(emptySpec({ recentQuality: [70] }), [
      { kind: 'style', text: '每轮带 2 个表情活跃气氛', source: 'llm' },
    ]);
    await storageRepo.savePersona({ ...base, slug: SLUG, isPreset: false, spec: admitted.spec, evolution: undefined });
    await storageRepo.saveConversation(SLUG, [
      { id: 'u1', role: 'user', content: '在吗', timestamp: new Date().toISOString() },
      {
        id: 'a1',
        role: 'assistant',
        content: '在呢😆😆',
        timestamp: new Date().toISOString(),
        styleMetrics: { likeness: 60, deAI: 100, emojiCount: 2, avgBubbleLen: 4, aiClicheHits: 0, oocHits: 0, hostQuestion: false },
      },
      { id: 'u2', role: 'user', content: '别发表情了', timestamp: new Date().toISOString() },
    ]);
    const res = await runPostTurnLearning(SLUG, { recalledMemories: ['- [2026/11/1] 偏好习惯：爱吃辣'] });
    expect(res.signalCounted).toBe(true);
    expect(res.transitions[0]?.to).toBe('retired');
    const p = await storageRepo.getPersona(SLUG);
    expect(p?.evolution?.pendingSignals).toBe(1);
    expect(p?.spec?.learned[0].status).toBe('retired');
    expect(p?.personaMd).not.toContain('活跃气氛');
    expect(Object.keys(p?.spec?.memoryStats || {})).toHaveLength(1);
  });
});
