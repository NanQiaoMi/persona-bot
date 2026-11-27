import { afterAll, describe, expect, it } from 'vitest';
import {
  buildRelationStageDirective,
  resolveRelationStage,
} from '@/lib/emotion/relation-stage';
import { consolidatePersonaEvolution } from '@/lib/persona/evolution';
import {
  expandQueryWithSynonyms,
  retrieveRelevantMemories,
} from '@/lib/persona/memory-retrieval';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import {
  buildUserImpressionDirective,
  extractHeuristicUserImpression,
  mergeUserImpression,
} from '@/lib/persona/user-impression';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { storageRepo } from '@/lib/storage/repository';

const createdSlugs: string[] = [];

afterAll(async () => {
  for (const slug of createdSlugs) {
    await storageRepo.deletePersona(slug);
  }
});

describe('4 档关系阶段分层', () => {
  it('将 0~100 亲密度映射为 4 档阶段并输出差异化指令', () => {
    expect(resolveRelationStage(15).id).toBe('acquaintance');
    expect(resolveRelationStage(48).id).toBe('familiar');
    expect(resolveRelationStage(72).id).toBe('close');
    expect(resolveRelationStage(94).id).toBe('confidant');

    const d1 = buildRelationStageDirective(15);
    const d4 = buildRelationStageDirective(94);
    expect(d1).toContain('初识边界');
    expect(d4).toContain('挚交默契');
    expect(d1).not.toBe(d4);
  });
});

describe('按角色严格隔离的「TA 眼中的你」认知档案', () => {
  it('支持安全合并、上限 6 条习惯、启发式提取与提示词渲染', () => {
    const first = mergeUserImpression(undefined, {
      nickname: '阿猫',
      summary: '嘴硬但其实很重感情的夜猫子',
      observedHabits: ['经常熬夜', '爱喝冰美式'],
      recentVibe: '聊得越来越合拍',
    });
    expect(first.updated).toBe(true);
    expect(first.impression.observedHabits).toHaveLength(2);

    const dup = mergeUserImpression(first.impression, {
      observedHabits: ['爱喝冰美式', '3', '4', '5', '6', '7'].map((x) =>
        x.length === 1 ? `新观察习惯第${x}条内容` : x
      ),
    });
    expect(dup.updated).toBe(true);
    expect(dup.impression.observedHabits).toHaveLength(6);

    const heuristic = extractHeuristicUserImpression([
      { role: 'user', content: '以后叫我小橘就好，最近天天熬夜失眠，全靠冰美式续命' },
    ]);
    expect(heuristic?.nickname).toBe('小橘');
    expect(heuristic?.observedHabits?.length).toBeGreaterThanOrEqual(2);

    const dir = buildUserImpressionDirective(first.impression);
    expect(dir).toContain('TA 眼中的你');
    expect(dir).toContain('阿猫');
  });

  it('在自进化沉淀时严格隔离不同角色的印象档案（A 的认知绝不串到 B）', async () => {
    const slugA = `test-imp-a-${Date.now()}`;
    const slugB = `test-imp-b-${Date.now()}`;
    createdSlugs.push(slugA, slugB);

    await storageRepo.savePersona({ ...BUILTIN_PRESETS[1], slug: slugA, isPreset: false });
    await storageRepo.savePersona({ ...BUILTIN_PRESETS[2], slug: slugB, isPreset: false });

    await storageRepo.saveConversation(slugA, [
      {
        id: 'm1',
        role: 'user',
        content: '以后叫我老林，我经常熬夜写代码还爱喝冰美式',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'm2',
        role: 'assistant',
        content: '行，记着了，老林少喝点冰的',
        timestamp: new Date().toISOString(),
      },
    ]);

    const resA = await consolidatePersonaEvolution(slugA, { force: true });
    expect(resA.evolved).toBe(true);

    const loadedA = await storageRepo.getPersona(slugA);
    const loadedB = await storageRepo.getPersona(slugB);
    expect(loadedA?.spec?.userImpression?.nickname).toBe('老林');
    expect(loadedA?.spec?.userImpression?.observedHabits.length).toBeGreaterThan(0);
    expect(loadedB?.spec?.userImpression).toBeUndefined();

    const promptA = new PromptAssembler().assembleFromRecord(loadedA!);
    const promptB = new PromptAssembler().assembleFromRecord(loadedB!);
    expect(promptA).toContain('老林');
    expect(promptA).toContain('当前关系阶段');
    expect(promptB).not.toContain('老林');

    const masterPrompt = new PromptAssembler().assembleFromRecord(BUILTIN_PRESETS[0]);
    expect(masterPrompt).not.toContain('当前关系阶段');
  });
});

describe('记忆同义词簇扩展与 memoryStats 重要度重排', () => {
  it('支持跨词同义词簇召回，且高重要度/高召回记忆在同等匹配时优先', () => {
    const expanded = expandQueryWithSynonyms('昨晚又失眠睡不着');
    expect(expanded.tokens.has('熬夜')).toBe(true);

    const memories = [
      '# 记忆',
      '- [2026/11/01] 对方随口提过一次路过楼下便利店。',
      '- [2026/11/02] 对方经常熬夜到凌晨两点多才睡。',
    ].join('\n');

    const res = retrieveRelevantMemories(memories, '昨晚失眠好难受', {
      minScore: 0.15,
    });
    expect(res.relevant.some((line) => line.includes('熬夜到凌晨两点'))).toBe(true);

    const equalMemories = [
      '# 记忆',
      '- [2026/11/01] 今天在地铁站看见一只小猫。',
      '- [2026/11/02] 上周路边遇到一只小猫拍照。',
    ].join('\n');
    const ranked = retrieveRelevantMemories(equalMemories, '小猫', {
      minScore: 0.1,
      memoryStats: {
        '今天在地铁站看见一只小猫。': { importance: 0.95, recallCount: 6 },
        '上周路边遇到一只小猫拍照。': { importance: 0.25, recallCount: 0 },
      },
    });
    expect(ranked.relevant[0]).toContain('地铁站');
  });
});
