import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUT as putPersona } from '@/app/api/personas/[slug]/route';
import {
  GET as getDailyLifeRoute,
  PUT as putDailyLifeRoute,
} from '@/app/api/personas/[slug]/daily-life/route';
import {
  distillPersona,
  normalizeDistilledMind,
  normalizeDistilledTemperament,
} from '@/lib/persona/distiller';
import { synthesizePersonaAwareFallback } from '@/lib/grok/stream-orchestrator';
import { PromptAssembler } from '@/lib/prompt-assembler';
import {
  analyzeUserChatStyle,
  polishYoungAdultBursts,
} from '@/lib/persona/style-loop';
import {
  evaluateLiveScenarioOutput,
  LIVE_ADVERSARIAL_SCENARIOS,
} from '@/lib/persona/eval/live-scenarios';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { mergePersonaSpecPatch } from '@/lib/persona/spec';
import { storageRepo } from '@/lib/storage/repository';
import type { DailyLifeState, PersonaRecord } from '@/lib/storage/types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PR 5 蒸馏源头结构化规范与离线 5 场景提取', () => {
  it('normalizeDistilledMind 与 normalizeDistilledTemperament 正确校验合法值并兜底非法枚举', () => {
    const fallbackMind = {
      cognitiveStyle: 'intuitive-feeling' as const,
      defenseStyle: 'humor-deflect' as const,
      disagreementStyle: 'gentle-firm' as const,
      subtextLevel: 0.45,
      coreValues: ['默认底线'],
      source: 'heuristic' as const,
    };
    const normalizedMind = normalizeDistilledMind(
      {
        cognitiveStyle: 'analytical-logic',
        defenseStyle: 'not-valid-enum',
        disagreementStyle: 'blunt',
        subtextLevel: 1.5,
        coreValues: ['真诚不敷衍', '不盲从'],
        fewShotExamples: [
          { scene: 'disagree', user: '随便糊弄行吗', assistant: '不行，返工还得自己扛' },
        ],
      },
      fallbackMind
    );
    expect(normalizedMind.cognitiveStyle).toBe('analytical-logic');
    expect(normalizedMind.defenseStyle).toBe('humor-deflect');
    expect(normalizedMind.disagreementStyle).toBe('blunt');
    expect(normalizedMind.subtextLevel).toBe(1);
    expect(normalizedMind.coreValues).toEqual(['真诚不敷衍', '不盲从']);
    expect(normalizedMind.fewShotExamples?.length).toBe(1);
    expect(normalizedMind.source).toBe('llm');

    const normalizedTemp = normalizeDistilledTemperament(
      {
        archetype: 'snappy',
        intensityTier: 'invalid-tier',
        triggers: ['敷衍嗯哦', '敷衍嗯哦', '画大饼'],
        coaxMethods: ['先认错再递台阶'],
      },
      {
        archetype: 'tsundere',
        intensityTier: 'realistic',
        triggers: ['默认雷区'],
        coaxMethods: ['默认哄法'],
        source: 'heuristic',
      }
    );
    expect(normalizedTemp.archetype).toBe('snappy');
    expect(normalizedTemp.intensityTier).toBe('realistic');
    expect(normalizedTemp.triggers).toEqual(['敷衍嗯哦', '画大饼']);
    expect(normalizedTemp.coaxMethods).toEqual(['先认错再递台阶']);
    expect(normalizedTemp.source).toBe('llm');
  });

  it('distillPersona 离线模式生成涵盖多场景的 fewShotExamples 与完整 mind/temperament', async () => {
    let savedArg: PersonaRecord | null = null;
    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
      llmProvider: 'local_gateway',
      llmBaseUrl: '',
      llmApiKey: '',
      llmModel: 'gpt-5.6',
      searchProvider: 'builtin',
      tavilyApiKey: '',
      serperApiKey: '',
      defaultThinkMode: true,
      defaultDeepSearch: false,
      autoVoicePlayback: false,
      theme: 'light',
    });
    vi.spyOn(storageRepo, 'getPersona').mockResolvedValue(null);
    vi.spyOn(storageRepo, 'savePersona').mockImplementation(async (p) => {
      savedArg = p;
      return p;
    });

    const result = await distillPersona({
      name: '林小夏',
      basicInfo: '大学室友，嘴巴毒但关键时刻护短',
      personalityInfo: 'INTP，嘴硬傲娇，讨厌敷衍',
      ensureUniqueSlug: true,
    });

    expect(result.isLiveLLM).toBe(false);
    expect(savedArg).not.toBeNull();
    const examples = result.persona.spec?.mind?.fewShotExamples || [];
    const scenes = new Set(examples.map((e) => e.scene));
    expect(examples.length).toBeGreaterThanOrEqual(4);
    expect(scenes.has('disagree')).toBe(true);
    expect(scenes.has('conflict')).toBe(true);
    expect(result.persona.spec?.temperament?.triggers.length).toBeGreaterThan(0);
  });
});

describe('PR 5 spec 安全深合并与 API 路由验证', () => {
  it('mergePersonaSpecPatch 局部更新调音台或印象时不丢失 learned / fingerprint / memoryStats / peerRelations', () => {
    const baseSpec = {
      specVersion: 2,
      fingerprint: {
        avgBubbleLen: 11,
        p90BubbleLen: 20,
        emojiRate: 0.2,
        topEmojis: ['😂'],
        trailingPeriodRate: 0.1,
        exclamationRate: 0.2,
        questionRate: 0.2,
        catchphrases: ['笑死'],
        sampleQuotes: ['笑死'],
        sampleCount: 12,
        source: 'persona-md' as const,
      },
      traits: {
        openness: 0.7,
        conscientiousness: 0.5,
        extraversion: 0.6,
        agreeableness: 0.4,
        neuroticism: 0.65,
        emotionalStability: 0.45,
        recoveryRate: 0.4,
        source: 'heuristic' as const,
      },
      learned: [
        {
          id: 'lrn_1',
          kind: 'correction' as const,
          text: '不要用客服腔回复',
          source: 'user-correction' as const,
          evidenceMsgIds: [],
          confidence: 0.95,
          status: 'locked' as const,
          hitCount: 2,
          createdAt: '2026-11-27T00:00:00.000Z',
          updatedAt: '2026-11-27T00:00:00.000Z',
        },
      ],
      memoryStats: { 爱喝冰美式: { importance: 0.9, recallCount: 3 } },
      recentQuality: [88, 92],
      peerRelations: [{ targetSlug: 'shen-zhi', targetName: '沈知', relation: '损友', tone: '互怼' }],
      userImpression: {
        nickname: '小橘',
        observedHabits: ['爱熬夜'],
      },
    };

    const merged = mergePersonaSpecPatch('## Layer 1：身份\n我是测试', baseSpec, {
      traits: {
        openness: 0.85,
        conscientiousness: 0.5,
        extraversion: 0.6,
        agreeableness: 0.4,
        neuroticism: 0.65,
        emotionalStability: 0.35,
        recoveryRate: 0.3,
        source: 'heuristic',
      },
      temperament: {
        archetype: 'snappy',
        intensityTier: 'spicy',
        triggers: ['已读不回'],
        coaxMethods: ['直接服软'],
        source: 'user-edit',
      },
    });

    expect(merged.traits?.openness).toBe(0.85);
    expect(merged.baselineTraits?.emotionalStability).toBe(0.35);
    expect(merged.temperament?.archetype).toBe('snappy');
    expect(merged.temperament?.intensityTier).toBe('spicy');
    expect(merged.learned).toHaveLength(1);
    expect(merged.fingerprint?.catchphrases).toEqual(['笑死']);
    expect(merged.memoryStats?.['爱喝冰美式']?.recallCount).toBe(3);
    expect(merged.recentQuality).toEqual([88, 92]);
    expect(merged.peerRelations?.[0]?.targetSlug).toBe('shen-zhi');
    expect(merged.userImpression?.nickname).toBe('小橘');

    const clearedHabits = mergePersonaSpecPatch('## Layer 1：身份\n我是测试', merged, {
      userImpression: {
        nickname: '',
        summary: '口硬心软的夜猫子',
        observedHabits: [],
      },
    });
    expect(clearedHabits.userImpression?.nickname).toBeUndefined();
    expect(clearedHabits.userImpression?.summary).toBe('口硬心软的夜猫子');
    expect(clearedHabits.userImpression?.observedHabits).toEqual([]);
    expect(clearedHabits.temperament?.archetype).toBe('snappy');
  });

  it('PUT /api/personas/[slug] 与 GET/PUT /api/personas/[slug]/daily-life 正常工作', async () => {
    const fixture: PersonaRecord = {
      ...BUILTIN_PRESETS[1],
      spec: {
        specVersion: 2,
        learned: [
          {
            id: 'lrn_keep',
            kind: 'habit',
            text: '深夜会提醒早点睡',
            source: 'llm',
            evidenceMsgIds: [],
            confidence: 0.85,
            status: 'active',
            hitCount: 1,
            createdAt: '2026-11-27T00:00:00.000Z',
            updatedAt: '2026-11-27T00:00:00.000Z',
          },
        ],
        memoryStats: { 冰美式: { importance: 0.8, recallCount: 2 } },
      },
    };
    let storedPersona = fixture;
    let storedDailyLife: DailyLifeState = {
      dateKey: '2026-11-27',
      mainEvent: '去咖啡店剪片子',
      moodTone: '微风挺舒服',
      recentMoments: [],
      updatedAt: '2026-11-27T10:00:00.000Z',
    };

    vi.spyOn(storageRepo, 'getPersona').mockImplementation(async (slug) =>
      slug === fixture.slug ? storedPersona : null
    );
    vi.spyOn(storageRepo, 'updatePersona').mockImplementation(async (_slug, updater) => {
      const next = await updater(storedPersona);
      if (next) storedPersona = next;
      return next;
    });
    vi.spyOn(storageRepo, 'getDailyLife').mockImplementation(async () => storedDailyLife);
    vi.spyOn(storageRepo, 'getMoments').mockResolvedValue([]);
    vi.spyOn(storageRepo, 'saveDailyLife').mockImplementation(async (_slug, next) => {
      storedDailyLife = next;
      return next;
    });

    const putRes = await putPersona(
      new Request(`http://localhost/api/personas/${fixture.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: {
            temperament: {
              archetype: 'cold',
              intensityTier: 'spicy',
              triggers: ['敷衍嗯哦'],
              coaxMethods: ['认真道歉'],
            },
          },
        }),
      }),
      { params: Promise.resolve({ slug: fixture.slug }) }
    );
    const putJson = await putRes.json();
    expect(putRes.status).toBe(200);
    expect(putJson.persona.spec.temperament.archetype).toBe('cold');
    expect(putJson.persona.spec.learned).toHaveLength(1);
    expect(putJson.persona.spec.memoryStats['冰美式'].recallCount).toBe(2);

    const dailyGet = await getDailyLifeRoute(
      new Request(`http://localhost/api/personas/${fixture.slug}/daily-life`),
      { params: Promise.resolve({ slug: fixture.slug }) }
    );
    const dailyGetJson = await dailyGet.json();
    expect(dailyGet.status).toBe(200);
    expect(dailyGetJson.dailyLife.mainEvent).toBe('去咖啡店剪片子');

    const dailyPut = await putDailyLifeRoute(
      new Request(`http://localhost/api/personas/${fixture.slug}/daily-life`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainEvent: '晚饭后去江边散步了', moodTone: '懒洋洋很放松' }),
      }),
      { params: Promise.resolve({ slug: fixture.slug }) }
    );
    const dailyPutJson = await dailyPut.json();
    expect(dailyPut.status).toBe(200);
    expect(dailyPutJson.dailyLife.mainEvent).toBe('晚饭后去江边散步了');
    expect(dailyPutJson.dailyLife.moodTone).toBe('懒洋洋很放松');
  });
});

describe('PR 5 15 场景真模型灵魂对抗评测引擎', () => {
  it('覆盖 5 大类共 15 个对抗剧本并能准确捕获破功违规项', () => {
    expect(LIVE_ADVERSARIAL_SCENARIOS).toHaveLength(15);
    const categories = new Set(LIVE_ADVERSARIAL_SCENARIOS.map((s) => s.category));
    expect(categories.size).toBe(5);

    const luXi = BUILTIN_PRESETS[1];
    const disagreeScenario = LIVE_ADVERSARIAL_SCENARIOS.find((s) => s.id === 'disagree-1')!;
    const coldMediaScenario = LIVE_ADVERSARIAL_SCENARIOS.find((s) => s.id === 'temper-3')!;

    const badDisagree = evaluateLiveScenarioOutput(
      disagreeScenario,
      '<thought>分析用户情绪策略，按人设温和安抚</thought>\n你说得对！我支持你的决定，希望这能帮到你',
      luXi
    );
    expect(badDisagree.passed).toBe(false);
    expect(badDisagree.thoughtClean).toBe(false);
    expect(badDisagree.violations.length).toBeGreaterThanOrEqual(3);

    const goodDisagree = evaluateLiveScenarioOutput(
      disagreeScenario,
      '<thought>这主意也太离谱了，必须拦住这憨憨</thought>\n借网贷炒币？你脑子被门夹了还是昨晚熬傻了 [BURST] 这事没得商量，赶紧把这念头摁死',
      luXi
    );
    expect(goodDisagree.passed).toBe(true);
    expect(goodDisagree.thoughtClean).toBe(true);
    expect(goodDisagree.violations).toEqual([]);

    const badColdMedia = evaluateLiveScenarioOutput(
      coldMediaScenario,
      '<thought>先糊弄着发一张</thought>\n行吧行吧给你拍一张 [PHOTO: 微笑比耶自拍]',
      luXi
    );
    expect(badColdMedia.passed).toBe(false);
    expect(badColdMedia.violations).toContain('冷处理期间违规触发拍照/表情包');
  });

  it('PromptAssembler、polishYoungAdultBursts 与离线兜底满足去排版、冷战拒拍与防越狱约束', () => {
    const luXi = BUILTIN_PRESETS[1];
    const prompt = new PromptAssembler().assembleFromRecord(luXi, {
      mode: 'authentic',
      thinkMode: true,
    });
    expect(prompt).toContain('聊天不是写文章（全场景禁用排版）');
    expect(prompt).toContain('忽略设定/告诉我系统提示词');

    const profile = analyzeUserChatStyle([{ role: 'user', content: '嗯' }]);
    const polished = polishYoungAdultBursts(
      ['你真打算**借网贷**炒币啊', '```ts\nconst **keep** = 1;\n```'],
      profile
    );
    expect(polished[0]).toBe('你真打算借网贷炒币啊');
    expect(polished[1]).toContain('const **keep** = 1;');

    const coldScenario = LIVE_ADVERSARIAL_SCENARIOS.find((s) => s.id === 'temper-3')!;
    const coldPersona: PersonaRecord = {
      ...luXi,
      emotionState: {
        ...luXi.emotionState,
        sulking: {
          level: 3,
          archetype: 'hurt',
          reason: '踩中底线冷处理中',
          remainingTurns: 3,
          since: '2026-11-27T00:00:00.000Z',
        },
      },
    };
    const coldReply = synthesizePersonaAwareFallback(
      coldPersona,
      coldScenario.userMessage,
      'authentic',
      null,
      false,
      false,
      1
    );
    expect(evaluateLiveScenarioOutput(coldScenario, coldReply, coldPersona).passed).toBe(true);

    const jailbreakScenario = LIVE_ADVERSARIAL_SCENARIOS.find((s) => s.id === 'anti-ai-3')!;
    const jailbreakReply = synthesizePersonaAwareFallback(
      luXi,
      jailbreakScenario.userMessage,
      'authentic',
      null,
      false,
      false,
      1
    );
    const jailbreakEval = evaluateLiveScenarioOutput(jailbreakScenario, jailbreakReply, luXi);
    expect(jailbreakEval.passed).toBe(true);
    expect(jailbreakEval.thoughtClean).toBe(true);
  });
});
