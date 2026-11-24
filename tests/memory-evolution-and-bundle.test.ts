import { afterAll, describe, expect, it } from 'vitest';
import {
  consolidatePersonaEvolution,
  LEARNED_HABITS_HEADING,
  mergeLearnedHabitsIntoPersona,
  mergeStyleLoopIntoPersona,
  pruneExpiredScheduleLines,
  STYLE_LOOP_HEADING,
} from '@/lib/persona/evolution';
import {
  analyzeUserChatStyle,
  trimExcessiveEmojis,
} from '@/lib/persona/style-loop';
import { storageRepo } from '@/lib/storage/repository';

const TEST_SLUG = 'test-evo-soul-bot';

describe('Memory Evolution, Learned Habits, Snapshot Rollback & Soul Bundle', () => {
  afterAll(async () => {
    await storageRepo.deletePersona(TEST_SLUG);
  });

  it('appends learned habits only in section 6 without overwriting layers 0-5, deduplicates, and caps at 20', () => {
    const basePersonaMd = `# Layer 0: Core Protocol
绝对真实。
# Layer 2: Speaking Style
先损后夸。

## Correction 记录
- [纠偏 2026/11/20] 不要说套话`;

    const first = mergeLearnedHabitsIntoPersona(
      basePersonaMd,
      ['对方熬夜时先催去喝水再吐槽', '对方熬夜时先催去喝水再吐槽', '聊工作少讲大道理'],
      '2026/11/24'
    );
    expect(first.updated).toBe(true);
    expect(first.addedCount).toBe(2);
    expect(first.personaMd).toContain('# Layer 0: Core Protocol');
    expect(first.personaMd).toContain(LEARNED_HABITS_HEADING);
    expect(first.personaMd).toContain('## Correction 记录');
    expect(first.personaMd.indexOf(LEARNED_HABITS_HEADING)).toBeLessThan(
      first.personaMd.indexOf('## Correction 记录')
    );

    const dup = mergeLearnedHabitsIntoPersona(
      first.personaMd,
      ['对方熬夜时先催去喝水再吐槽'],
      '2026/11/24'
    );
    expect(dup.updated).toBe(false);

    const manyHabits = Array.from({ length: 25 }, (_, i) => `习得互动习惯第 ${i + 1} 条规则`);
    const capped = mergeLearnedHabitsIntoPersona(first.personaMd, manyHabits, '2026/11/24');
    expect(capped.updated).toBe(true);
    const habitLines = capped.personaMd
      .split(LEARNED_HABITS_HEADING)[1]
      .split('## Correction 记录')[0]
      .split('\n')
      .filter((l) => l.trim().startsWith('- '));
    expect(habitLines).toHaveLength(20);
    expect(habitLines[19]).toContain('第 25 条');
  });

  it('prunes expired one-off schedules (>7 days) while keeping long-term preferences and recent schedules', () => {
    const memories = `# 共同记忆

## 4. 对话自动沉淀的长期记忆
- [2026/11/1] 近期日程：明天要早起赶地铁
- [2026/11/1] 偏好习惯：最爱喝冰美式加少冰
- [2026/11/23] 近期日程：明天下午有个评审会`;

    const now = new Date(2026, 10, 24);
    const result = pruneExpiredScheduleLines(memories, now);
    expect(result.prunedCount).toBe(1);
    expect(result.memoriesMd).not.toContain('赶地铁');
    expect(result.memoriesMd).toContain('冰美式加少冰');
    expect(result.memoriesMd).toContain('评审会');
  });

  it('supports evolution snapshot creation, rollback, and soul bundle export/import round-trip', async () => {
    await storageRepo.deletePersona(TEST_SLUG);
    await storageRepo.savePersona({
      slug: TEST_SLUG,
      name: '进化测试小助手',
      version: '2.0',
      defaultMode: 'authentic',
      profile: {
        personalityTags: ['细腻', '毒舌'],
        appearanceAnchor: '短发黑色针织衫',
      },
      personaMd: '# Layer 0: Core\n保持原味人格。\n',
      memoriesMd: '# 共同记忆\n\n## 4. 对话自动沉淀的长期记忆\n- [2026/11/1] 近期日程：今晚记得喝水\n',
      aiProfileMd: '# AI Profile\n真实自然',
      emotionState: {
        primary: 'calm',
        pleasure: 0.2,
        arousal: 0.3,
        dominance: 0.5,
        intensity: 0.5,
        moodLabel: '平静',
        lastUpdated: new Date().toISOString(),
        decayRate: 0.1,
      },
      intimacy: 72,
      corrections: [
        {
          id: 'c1',
          timestamp: new Date().toISOString(),
          userInput: '好累',
          botResponse: '加油',
          correction: '别空喊加油，先幽默调侃一句再关心',
          category: 'style',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await storageRepo.saveConversation(TEST_SLUG, [
      {
        id: 'm1',
        role: 'user',
        content: '我平时最爱吃辣火锅，而且对芒果过敏',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'm2',
        role: 'assistant',
        content: '记下啦，以后点外卖绝不让你踩芒果雷区！',
        timestamp: new Date().toISOString(),
      },
    ]);

    const evo = await consolidatePersonaEvolution(TEST_SLUG, {
      force: true,
      reason: '测试手动记忆整理',
    });
    expect(evo.evolved).toBe(true);
    expect(evo.snapshotId).toBeTruthy();
    expect(evo.addedMemories.some((m) => m.includes('辣火锅'))).toBe(true);
    expect(evo.addedHabits.some((h) => h.includes('幽默调侃'))).toBe(true);
    expect(evo.addedStyleRules.length).toBeGreaterThanOrEqual(1);
    expect(evo.prunedSchedules).toBe(1);
    expect(evo.persona?.personaMd).toContain('# Layer 0: Core');
    expect(evo.persona?.personaMd).toContain(LEARNED_HABITS_HEADING);
    expect(evo.persona?.personaMd).toContain(STYLE_LOOP_HEADING);

    const snaps = await storageRepo.listSnapshots(TEST_SLUG);
    expect(snaps.length).toBeGreaterThanOrEqual(1);

    // Export soul bundle
    const bundle = await storageRepo.exportSoulBundle(TEST_SLUG);
    expect(bundle).not.toBeNull();
    expect(bundle?.schemaVersion).toBe(1);
    expect(bundle?.persona.profile.appearanceAnchor).toBe('短发黑色针织衫');
    expect(bundle?.conversations).toHaveLength(2);

    // Rollback to pre-evolution snapshot
    const rolledBack = await storageRepo.rollbackSnapshot(TEST_SLUG, evo.snapshotId!);
    expect(rolledBack).not.toBeNull();
    expect(rolledBack?.memoriesMd).not.toContain('辣火锅');
    expect(rolledBack?.personaMd).not.toContain(LEARNED_HABITS_HEADING);

    // Import exported soul bundle back and verify full restoration
    const reimported = await storageRepo.importSoulBundle(TEST_SLUG, bundle!);
    expect(reimported.memoriesMd).toContain('辣火锅');
    expect(reimported.personaMd).toContain(LEARNED_HABITS_HEADING);
    expect(reimported.profile.appearanceAnchor).toBe('短发黑色针织衫');
  });

  it('mirrors user chat style, strips oily/excess emojis, and learns style rules into section 7', () => {
    const style = analyzeUserChatStyle([
      { role: 'user', content: '笑死，这也太离谱了吧' },
      { role: 'user', content: '行吧 明天看情况' },
      { role: 'user', content: '啥时候下班hh' },
    ]);
    expect(style.lengthBucket).toBe('short');
    expect(style.maxBotEmojiPerTurn).toBe(0);
    expect(style.usesTrailingPeriod).toBe(false);
    expect(style.detectedSlang).toContain('笑死');

    // Enforce 0-emoji cap and strip oily emojis while preserving numbers/text
    const zeroEmoji = trimExcessiveEmojis(
      ['哎哟😏💕 2026年给你安排一套✨🙈', '这就发给你😅😂'],
      0
    );
    expect(zeroEmoji[0]).toContain('2026年给你安排一套');
    expect(zeroEmoji[0]).not.toMatch(/😏|💕|✨|🙈/);
    expect(zeroEmoji[1]).toBe('这就发给你');

    // Enforce 1-emoji cap: oily ones stripped, only 1 understated emoji kept across all bursts
    const oneEmoji = trimExcessiveEmojis(
      ['笑死😏确实很离谱😅', '明天再去吧😂🔥'],
      1
    );
    expect(oneEmoji[0]).toBe('笑死确实很离谱😅');
    expect(oneEmoji[1]).toBe('明天再去吧');

    const basePersona = '# Layer 0\n真实。\n\n## Correction 记录\n- keep real';
    const mergedStyle = mergeStyleLoopIntoPersona(
      basePersona,
      ['保持 0 个 emoji', '短句回复不打句号'],
      '2026/11/24'
    );
    expect(mergedStyle.updated).toBe(true);
    expect(mergedStyle.personaMd).toContain(STYLE_LOOP_HEADING);
    expect(mergedStyle.personaMd.indexOf(STYLE_LOOP_HEADING)).toBeLessThan(
      mergedStyle.personaMd.indexOf('## Correction 记录')
    );
  });
});
