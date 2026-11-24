import { afterAll, describe, expect, it } from 'vitest';
import {
  computeIntimacyUpdate,
  DAILY_INTIMACY_GAIN_CAP,
  evolveTurnEmotion,
  localDateKey,
} from '@/lib/emotion/turn';
import { retrieveRelevantMemories, tokenizeForRecall } from '@/lib/persona/memory-retrieval';
import { runAutoEvolutionIfDue } from '@/lib/persona/evolution';
import { inferSnapshotKind, SNAPSHOT_QUOTA, storageRepo } from '@/lib/storage/repository';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { PersonaRecord } from '@/lib/storage/types';

const TEST_SLUG = 'test-core-state-bot';

async function seedTestPersona(): Promise<PersonaRecord> {
  const base = BUILTIN_PRESETS[1];
  return storageRepo.savePersona({
    ...base,
    slug: TEST_SLUG,
    name: '核心状态测试',
    isPreset: false,
    intimacy: 60,
    evolution: undefined,
    relationship: undefined,
  });
}

describe('B1 emotion continuity across turns', () => {
  it('starts from the persisted emotion instead of the default vector', () => {
    const now = new Date('2026-11-24T12:00:00');
    const angry = {
      personaMd: '',
      intimacy: 60,
      relationship: undefined,
      emotionState: {
        primary: '生气',
        pleasure: -0.8,
        arousal: 0.8,
        dominance: 0.7,
        intensity: 0.9,
        lastUpdated: now.toISOString(),
        decayRate: 0.1,
      },
    };
    const calm = {
      ...angry,
      emotionState: { ...angry.emotionState, primary: '平静', pleasure: 0.3, arousal: 0.3, intensity: 0.5 },
    };
    const fromAngry = evolveTurnEmotion(angry, '嗯', 'authentic', now);
    const fromCalm = evolveTurnEmotion(calm, '嗯', 'authentic', now);
    expect(fromAngry.vector.pleasure).toBeLessThan(fromCalm.vector.pleasure);
    expect(fromAngry.snapshot.pleasure).toBeLessThan(0);
  });

  it('negative messages accumulate over consecutive turns', () => {
    let state = {
      personaMd: '',
      intimacy: 60,
      relationship: undefined as PersonaRecord['relationship'],
      emotionState: {
        primary: '平静',
        pleasure: 0.3,
        arousal: 0.3,
        dominance: 0.5,
        intensity: 0.5,
        lastUpdated: new Date('2026-11-24T12:00:00').toISOString(),
        decayRate: 0.1,
      },
    };
    const pleasures: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const now = new Date(`2026-11-24T12:0${i + 1}:00`);
      const r = evolveTurnEmotion(state, '烦死了 讨厌 滚', 'authentic', now);
      pleasures.push(r.snapshot.pleasure);
      state = { ...state, emotionState: r.snapshot, relationship: r.intimacy.relationship };
    }
    expect(pleasures[2]).toBeLessThan(pleasures[0]);
  });

  it('decays a strong emotion back toward baseline after many hours', () => {
    const last = new Date('2026-11-24T00:00:00');
    const angry = {
      personaMd: '',
      intimacy: 60,
      relationship: undefined,
      emotionState: {
        primary: '生气',
        pleasure: -0.8,
        arousal: 0.9,
        dominance: 0.7,
        intensity: 0.95,
        lastUpdated: last.toISOString(),
        decayRate: 0.1,
      },
    };
    const soon = evolveTurnEmotion(angry, '嗯', 'authentic', new Date('2026-11-24T00:01:00'));
    const later = evolveTurnEmotion(angry, '嗯', 'authentic', new Date('2026-11-24T18:00:00'));
    expect(later.hoursSinceLast).toBeGreaterThan(17);
    expect(later.snapshot.pleasure).toBeGreaterThan(soon.snapshot.pleasure);
  });
});

describe('B2 bounded intimacy', () => {
  it('neutral messages do not raise intimacy and daily gain is capped', () => {
    const now = new Date('2026-11-24T10:00:00');
    expect(computeIntimacyUpdate({ current: 60, pleasantness: 0, mode: 'companion', now }).delta).toBe(0);

    let current = 60;
    let relationship: PersonaRecord['relationship'];
    for (let i = 0; i < 100; i += 1) {
      const r = computeIntimacyUpdate({ current, pleasantness: 0.8, mode: 'companion', relationship, now });
      current = r.intimacy;
      relationship = r.relationship;
    }
    expect(current).toBe(60 + DAILY_INTIMACY_GAIN_CAP);

    const nextDay = new Date('2026-11-25T10:00:00');
    const r = computeIntimacyUpdate({ current, pleasantness: 0.8, mode: 'companion', relationship, now: nextDay });
    expect(r.delta).toBe(2);
    expect(r.relationship.ledgerDate).toBe(localDateKey(nextDay));
  });

  it('applies neglect decay after days of silence but never below the floor', () => {
    const r = computeIntimacyUpdate({
      current: 80,
      pleasantness: 0,
      mode: 'authentic',
      relationship: { ledgerDate: '2026-11-01', gainedToday: 0, lastChatAt: '2026-11-01T10:00:00.000Z' },
      now: new Date('2026-11-24T10:00:00Z'),
    });
    expect(r.neglectPenalty).toBe(5);
    expect(r.intimacy).toBe(75);

    const nearFloor = computeIntimacyUpdate({
      current: 42,
      pleasantness: 0,
      mode: 'authentic',
      lastChatAt: '2026-11-01T10:00:00.000Z',
      now: new Date('2026-11-24T10:00:00Z'),
    });
    expect(nearFloor.intimacy).toBe(40);
  });

  it('negative messages lower intimacy', () => {
    const r = computeIntimacyUpdate({ current: 60, pleasantness: -0.6, mode: 'authentic' });
    expect(r.delta).toBe(-3);
  });
});

describe('B3 Chinese memory retrieval with budget', () => {
  const memories = `# 共同记忆

## 4. 对话自动沉淀的长期记忆
- [2026/11/1] 个人近况：我养了一只橘猫叫团子
- [2026/11/2] 偏好习惯：最喜欢喝杨枝甘露
- [2026/11/3] 近期日程：下周要去杭州出差`;

  it('tokenizes Chinese into bigrams and content unigrams', () => {
    const t = tokenizeForRecall('我那只猫最近不吃饭');
    expect(t.tokens.has('猫')).toBe(true);
    expect(t.tokens.has('吃饭')).toBe(true);
    expect(t.tokens.has('我')).toBe(false);
  });

  it('recalls the cat memory for a cat-related message without spaces', () => {
    const r = retrieveRelevantMemories(memories, '我那只猫最近不吃饭');
    expect(r.relevant).toHaveLength(1);
    expect(r.relevant[0]).toContain('橘猫');
    expect(r.context).toContain('### 当前话题触发的高相关记忆');
  });

  it('returns the raw memories when nothing matches', () => {
    const r = retrieveRelevantMemories(memories, '在干嘛');
    expect(r.relevant).toEqual([]);
    expect(r.context).toBe(memories.trim());
  });

  it('keeps the prompt within budget, preferring relevant and recent entries', () => {
    const many = Array.from({ length: 80 }, (_, i) => `- [2026/10/${(i % 28) + 1}] 偏好习惯：第${i}条无关记忆内容填充文本`).join('\n');
    const md = `# 共同记忆\n\n## 4. 对话自动沉淀的长期记忆\n- [2026/9/1] 个人近况：我养了一只橘猫叫团子\n${many}`;
    const r = retrieveRelevantMemories(md, '团子今天好乖', { budgetChars: 600 });
    expect(r.truncated).toBe(true);
    expect(r.relevant[0]).toContain('团子');
    const base = r.context.split('### 记忆底色\n')[1];
    expect(base.length).toBeLessThanOrEqual(600);
    expect(base).toContain('第79条');
    expect(base).not.toContain('第0条无关');
  });
});

describe('B4/B5 snapshot quotas, atomic writes and persistent evolution cursor', () => {
  afterAll(async () => {
    await storageRepo.deletePersona(TEST_SLUG);
  });

  it('infers legacy snapshot kind from the reason text', () => {
    expect(inferSnapshotKind({ reason: '第 12 轮自动记忆与风格自省' })).toBe('auto');
    expect(inferSnapshotKind({ reason: '手动存档' })).toBe('manual');
    expect(inferSnapshotKind({ kind: 'auto', reason: '手动' })).toBe('auto');
  });

  it('auto snapshots never evict manual snapshots', async () => {
    await seedTestPersona();
    await storageRepo.createSnapshot(TEST_SLUG, '我的手动存档', undefined, 'manual');
    for (let i = 0; i < SNAPSHOT_QUOTA.auto + 5; i += 1) {
      await storageRepo.createSnapshot(TEST_SLUG, `第 ${i} 轮自动记忆与风格自省`, undefined, 'auto');
    }
    const list = await storageRepo.listSnapshots(TEST_SLUG);
    expect(list.filter((s) => s.kind === 'auto')).toHaveLength(SNAPSHOT_QUOTA.auto);
    expect(list.some((s) => s.reason === '我的手动存档')).toBe(true);
  });

  it('serializes concurrent read-modify-write updates without losing fields', async () => {
    await seedTestPersona();
    await Promise.all([
      storageRepo.updatePersona(TEST_SLUG, (p) => ({ ...p, memoriesMd: `${p.memoriesMd}\n- A` })),
      storageRepo.updatePersona(TEST_SLUG, (p) => ({ ...p, memoriesMd: `${p.memoriesMd}\n- B` })),
      storageRepo.updatePersona(TEST_SLUG, (p) => ({ ...p, intimacy: 77 })),
      storageRepo.addCorrection(TEST_SLUG, {
        userInput: 'x',
        botResponse: 'y',
        correction: '别这么油腻',
        category: 'style',
      }),
    ]);
    const p = await storageRepo.getPersona(TEST_SLUG);
    expect(p?.memoriesMd).toContain('- A');
    expect(p?.memoriesMd).toContain('- B');
    expect(p?.intimacy).toBe(77);
    expect(p?.corrections.at(-1)?.correction).toBe('别这么油腻');
  });

  it('persists the evolution cursor so the same turns are not re-consolidated', async () => {
    await seedTestPersona();
    const base = Date.now() - 60_000;
    await storageRepo.saveConversation(
      TEST_SLUG,
      Array.from({ length: 4 }, (_, i) => ({
        id: `m${i}`,
        role: 'user' as const,
        content: `我最喜欢吃第${i}种水果`,
        timestamp: new Date(base + i * 1000).toISOString(),
      }))
    );
    await runAutoEvolutionIfDue(TEST_SLUG);
    const after = await storageRepo.getPersona(TEST_SLUG);
    expect(after?.evolution?.lastEvolvedUserTurn).toBe(4);
    expect(after?.evolution?.lastEvolvedAt).toBeTruthy();

    const again = await runAutoEvolutionIfDue(TEST_SLUG);
    expect(again).toBe(false);
    const list = await storageRepo.listSnapshots(TEST_SLUG);
    const autoCount = list.filter((s) => s.kind === 'auto').length;
    await runAutoEvolutionIfDue(TEST_SLUG);
    expect((await storageRepo.listSnapshots(TEST_SLUG)).filter((s) => s.kind === 'auto').length).toBe(autoCount);
  });
});
