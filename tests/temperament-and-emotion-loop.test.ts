import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { appraiseEvent, appraisalToEmotion } from '@/lib/emotion/appraisal';
import { applyRecovery, naturalDecay } from '@/lib/emotion/decay';
import { EmotionEngine } from '@/lib/emotion/engine';
import {
  advanceSulkingState,
  applyLlmAffectSignal,
  buildSulkingDirective,
  detectBoundaryHit,
  detectCoaxingSignal,
} from '@/lib/emotion/sulking';
import {
  getTemperamentMoodLabel,
  TEMPERAMENT_ARCHETYPE_META,
} from '@/lib/emotion/temperament';
import { DAILY_INTIMACY_GAIN_CAP, evolveTurnEmotion } from '@/lib/emotion/turn';
import type { PersonalityTraits } from '@/lib/emotion/types';
import { createDefaultEmotionVector } from '@/lib/emotion/vector';
import { generateProactiveMessage } from '@/lib/grok/proactive-engine';
import { chooseSeed } from '@/lib/group/ambient';
import { pickSpeakers } from '@/lib/group/director';
import type { LlmConfig } from '@/lib/llm/client';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import type { PersonaTemperamentSpec, PersonaTraitsSpec, TemperamentArchetype } from '@/lib/persona/spec';
import { applySmoothTraitDeltas, MAX_TRAIT_DRIFT } from '@/lib/persona/traits';
import { blockReason } from '@/lib/proactive/scheduler';
import { runOutreach } from '@/lib/proactive/outreach-service';
import { storageRepo } from '@/lib/storage/repository';
import type { PersonaRecord } from '@/lib/storage/types';

const BASE_TRAITS: PersonalityTraits = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
  emotionalStability: 0.5,
  emotionalRange: 0.5,
  recoveryRate: 0.5,
  emotionVocabulary: {
    positive: ['开心', '安心'],
    negative: ['生气', '委屈'],
    neutral: ['平静'],
  },
  recoveryPatterns: {},
};

const createdSlugs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const slug of createdSlugs) {
    await storageRepo.deletePersona(slug);
  }
});

describe('PAD 情绪引擎 5 大 Bug 根治验证', () => {
  it('Bug A：novelty / arousal / dominance / intensity 随输入语义与上下文波动而非常量', () => {
    const flatAppraisal = appraiseEvent(
      { type: 'message', content: '嗯', sender: 'user', timestamp: new Date() },
      BASE_TRAITS,
      []
    );
    const excitingAppraisal = appraiseEvent(
      { type: 'message', content: '笑死！我今天居然突然抽中大奖了，你猜猜是多少？', sender: 'user', timestamp: new Date() },
      BASE_TRAITS,
      [{ ...createDefaultEmotionVector(), pleasure: -0.4, arousal: 0.7 }]
    );

    expect(excitingAppraisal.novelty).toBeGreaterThan(flatAppraisal.novelty);
    expect(excitingAppraisal.goalRelevance).toBeGreaterThan(flatAppraisal.goalRelevance);

    const flatEmo = appraisalToEmotion(flatAppraisal, BASE_TRAITS);
    const excitingEmo = appraisalToEmotion(excitingAppraisal, BASE_TRAITS);
    expect(excitingEmo.arousal!).toBeGreaterThan(flatEmo.arousal!);
    expect(excitingEmo.intensity!).toBeGreaterThan(flatEmo.intensity!);
  });

  it('Bug B：情绪更稳定的角色衰减更快/更平稳，正时间差绝不反向放大强度', () => {
    const startVec = { ...createDefaultEmotionVector(), intensity: 0.85, pleasure: -0.6 };
    const stableTraits: PersonalityTraits = {
      ...BASE_TRAITS,
      emotionalStability: 0.9,
      neuroticism: 0.1,
    };
    const sensitiveTraits: PersonalityTraits = {
      ...BASE_TRAITS,
      emotionalStability: 0.15,
      neuroticism: 0.88,
    };

    const decayedStable = naturalDecay(startVec, 2, stableTraits);
    const decayedSensitive = naturalDecay(startVec, 2, sensitiveTraits);

    expect(decayedStable.intensity).toBeLessThanOrEqual(startVec.intensity);
    expect(decayedSensitive.intensity).toBeLessThanOrEqual(startVec.intensity);
    expect(decayedStable.intensity).toBeLessThan(decayedSensitive.intensity);
  });

  it('Bug C：processEvent 在惯性混合后重算 primary，不会出现高负愉悦度配「平静」', () => {
    const engine = new EmotionEngine(
      { ...BASE_TRAITS, emotionalStability: 0.1, neuroticism: 0.8 },
      { ...createDefaultEmotionVector(), pleasure: -0.2, arousal: 0.7, dominance: 0.5, primary: '平静' }
    );
    const after = engine.processEvent({
      type: 'message',
      content: '滚吧，闭嘴，烦死了',
      sender: 'user',
      timestamp: new Date(),
      metadata: { boundaryHit: true },
    });
    expect(after.pleasure).toBeLessThan(-0.3);
    expect(after.primary).not.toBe('开心');
    expect(after.primary).not.toBe('平静');
  });

  it('Bug D：applyLlmAffectSignal 重算 primary/intensity，且连续 cold 从 currentSnapshot 逐级升级 1→2→3', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    const baseSnapshot = {
      primary: '开心',
      pleasure: 0.4,
      arousal: 0.4,
      dominance: 0.5,
      intensity: 0.4,
      lastUpdated: now.toISOString(),
      decayRate: 0.1,
    };

    const firstCold = applyLlmAffectSignal({
      affect: { trigger: 'cold', delta: -0.2, reason: '冷淡敷衍' },
      prevSnapshot: baseSnapshot,
      currentSnapshot: baseSnapshot,
      prevIntimacy: 70,
      currentIntimacy: 70,
      currentIntimacyDelta: 0,
      basePleasantness: 0,
      mode: 'authentic',
      traits: BASE_TRAITS,
      now,
    });
    expect(firstCold.snapshot.sulking?.level).toBe(1);

    const secondCold = applyLlmAffectSignal({
      affect: { trigger: 'cold', delta: -0.2, reason: '还在敷衍' },
      prevSnapshot: baseSnapshot,
      currentSnapshot: firstCold.snapshot,
      prevIntimacy: 70,
      currentIntimacy: firstCold.intimacy,
      currentIntimacyDelta: firstCold.intimacyDelta,
      basePleasantness: 0,
      mode: 'authentic',
      traits: BASE_TRAITS,
      now,
    });
    expect(secondCold.snapshot.sulking?.level).toBe(2);

    const thirdCold = applyLlmAffectSignal({
      affect: { trigger: 'cold', delta: -0.2, reason: '第三次敷衍' },
      prevSnapshot: baseSnapshot,
      currentSnapshot: secondCold.snapshot,
      prevIntimacy: 70,
      currentIntimacy: secondCold.intimacy,
      currentIntimacyDelta: secondCold.intimacyDelta,
      basePleasantness: 0,
      mode: 'authentic',
      traits: BASE_TRAITS,
      now,
    });
    expect(thirdCold.snapshot.sulking?.level).toBe(3);
    expect(thirdCold.snapshot.primary).not.toBe('开心');
    expect(thirdCold.snapshot.intensity).toBeGreaterThan(0.5);
  });

  it('Bug E：闹别扭期间暂停把负情绪硬拉回 +0.2，非闹别扭回落到中性人格基线', () => {
    const sad = { ...createDefaultEmotionVector(), pleasure: -0.5, arousal: 0.4, dominance: 0.5 };
    const whileSulking = applyRecovery(sad, BASE_TRAITS, { isSulking: true });
    expect(whileSulking.pleasure).toBe(-0.5);

    const neutralBase = applyRecovery(sad, BASE_TRAITS, { isSulking: false });
    expect(neutralBase.pleasure).toBeGreaterThan(-0.5);
    expect(neutralBase.pleasure).toBeLessThan(0);
  });
});

describe('6 原型 × 3 档烈度脾气状态机与专属哄法', () => {
  it('6 种脾气原型产出差异化的心情标签与提示词指令', () => {
    const archetypes: TemperamentArchetype[] = ['snappy', 'tsundere', 'hurt', 'cold', 'avoidant', 'jealous'];
    const labels = new Set(archetypes.map((a) => getTemperamentMoodLabel(2, a)));
    expect(labels.size).toBe(6);

    for (const a of archetypes) {
      const directive = buildSulkingDirective(
        {
          level: 2,
          reason: '试探雷区',
          remainingTurns: 2,
          since: new Date().toISOString(),
          archetype: a,
        },
        BASE_TRAITS,
        false,
        '',
        { archetype: a, intensityTier: 'realistic', triggers: ['敷衍'], coaxMethods: ['认错'] }
      );
      expect(directive).toContain(TEMPERAMENT_ARCHETYPE_META[a].label);
    }
  });

  it('支持 gentle / realistic / spicy 三档烈度区分与 spicy 旧账记录', () => {
    const spicyTemp: PersonaTemperamentSpec = {
      archetype: 'jealous',
      intensityTier: 'spicy',
      triggers: ['拿我和别人比较'],
      coaxMethods: ['明确偏爱我'],
    };
    const gentleTemp: PersonaTemperamentSpec = {
      ...spicyTemp,
      intensityTier: 'gentle',
    };

    expect(detectBoundaryHit('你别拿我和别人比较啊', '', spicyTemp)).toBeNull();
    expect(detectBoundaryHit('天天拿我和别人比较真烦', '', spicyTemp)).toContain('比较');

    // mild negative pleasantness (-0.28) triggers Level 2 under spicy, not Level 2 under gentle
    const spicyHit = advanceSulkingState({
      pleasantness: -0.28,
      boundaryHitReason: null,
      coaxSignal: null,
      traits: BASE_TRAITS,
      temperament: spicyTemp,
    });
    expect(spicyHit.sulking?.level).toBe(2);
    expect(spicyHit.sulking?.grudges?.length).toBeGreaterThan(0);

    const gentleHit = advanceSulkingState({
      pleasantness: -0.28,
      boundaryHitReason: null,
      coaxSignal: null,
      traits: BASE_TRAITS,
      temperament: gentleTemp,
    });
    expect(gentleHit.sulking?.level ?? 0).toBeLessThan(2);

    // Under spicy, generic mild coaxing downgrades Level 2 -> 1 instead of instant clear; strong/matched coax resolves
    const genericMild = advanceSulkingState({
      prevSulking: spicyHit.sulking,
      pleasantness: 0.1,
      boundaryHitReason: null,
      coaxSignal: 'mild',
      traits: BASE_TRAITS,
      temperament: spicyTemp,
    });
    expect(genericMild.sulking?.level).toBe(1);

    expect(detectCoaxingSignal('我只偏爱你一个人呀', BASE_TRAITS, '', spicyTemp)).toBe('strong');
  });
});

describe('±0.20 初始性格锚点护栏与 4 款预设档案升级', () => {
  it('多次自进化微调不会把角色性格洗白超过 baselineTraits ±0.20', () => {
    const baseline: PersonaTraitsSpec = {
      openness: 0.6,
      conscientiousness: 0.5,
      extraversion: 0.35,
      agreeableness: 0.34,
      neuroticism: 0.6,
      emotionalStability: 0.5,
      recoveryRate: 0.5,
      source: 'llm',
    };
    let current = { ...baseline };
    for (let i = 0; i < 8; i += 1) {
      const res = applySmoothTraitDeltas(current, { agreeableness: 0.08, extraversion: 0.08 }, baseline);
      current = res.traits;
    }
    expect(current.agreeableness).toBeCloseTo(baseline.agreeableness + MAX_TRAIT_DRIFT, 2);
    expect(current.extraversion).toBeCloseTo(baseline.extraversion + MAX_TRAIT_DRIFT, 2);
  });

  it('4 款内置子角色具备差异化的思维风格、脾气原型与中文 primary 情绪', () => {
    const subs = BUILTIN_PRESETS.filter((p) => !p.isMaster);
    expect(subs).toHaveLength(4);
    const archetypes = new Set(subs.map((p) => p.spec?.temperament?.archetype));
    expect(archetypes.size).toBe(4);
    for (const p of subs) {
      expect(p.emotionState.primary).not.toMatch(/^[a-z]+$/);
      expect(p.spec?.mind?.fewShotExamples?.length).toBeGreaterThanOrEqual(3);
      expect(p.spec?.baselineTraits).toEqual(p.spec?.traits);
    }
  });
});

describe('跨渠道情绪闭环（主动破冰 & 群聊）', () => {
  it('闹别扭 >=2 级时不触发主动寒暄；在线主动消息不拼接离线 template thought；主动破冰受日上限约束', async () => {
    expect(
      blockReason(
        {
          slug: 'lu-xi',
          name: '鹿汐',
          intimacy: 70,
          sulkingLevel: 2,
          availability: 'free',
          awaitingReplyToProactive: false,
          hasDueTopic: false,
        },
        { now: new Date('2026-11-27T15:00:00'), log: [] }
      )
    ).toBe('TA 还在闹别扭');

    const llm: LlmConfig = {
      baseUrl: 'http://127.0.0.1:9/v1',
      endpoint: 'http://127.0.0.1:9/v1/chat/completions',
      apiKey: 'sk-test',
      model: 'test-model',
      isLocalGateway: true,
      canCall: true,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '[MOOD: 摸鱼中]今天风挺舒服的' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const onlineMsg = await generateProactiveMessage(
      BUILTIN_PRESETS[1],
      { kind: 'greeting', currentHour: 15, hoursSinceLastChat: 4 },
      llm
    );
    expect(onlineMsg.source).toBe('llm');
    expect(onlineMsg.thought).toBe('');

    const slug = 'test-outreach-cap';
    const testPersona: PersonaRecord = {
      ...BUILTIN_PRESETS[1],
      slug,
      isPreset: false,
      intimacy: 60,
      relationship: {
        ledgerDate: '2026-11-27',
        gainedToday: DAILY_INTIMACY_GAIN_CAP,
      },
    };
    const realSettings = await storageRepo.getSettings();
    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
      ...realSettings,
      llmApiKey: '',
      llmBaseUrl: 'http://127.0.0.1:9/v1',
    });
    vi.spyOn(storageRepo, 'getOutreachState').mockResolvedValue({ log: [] });
    vi.spyOn(storageRepo, 'listPersonas').mockResolvedValue([
      {
        slug,
        name: testPersona.name,
        version: testPersona.version,
        isPreset: false,
        defaultMode: testPersona.defaultMode,
        profile: testPersona.profile,
        emotionState: testPersona.emotionState,
        intimacy: testPersona.intimacy,
        lastActive: testPersona.updatedAt,
        createdAt: testPersona.createdAt,
        updatedAt: testPersona.updatedAt,
      },
    ]);
    vi.spyOn(storageRepo, 'getPersona').mockResolvedValue(testPersona);
    vi.spyOn(storageRepo, 'getConversation').mockResolvedValue([]);
    vi.spyOn(storageRepo, 'getMemoryState').mockResolvedValue({ pendingTopics: [] });
    const updateEmoSpy = vi.spyOn(storageRepo, 'updateEmotionAndIntimacy').mockResolvedValue(undefined);
    vi.spyOn(storageRepo, 'appendMessages').mockResolvedValue([]);
    vi.spyOn(storageRepo, 'updateOutreachState').mockImplementation(async (updater) =>
      updater({ log: [] })
    );

    const sent = await runOutreach({
      mode: 'tick',
      now: new Date(2026, 10, 27, 15, 0),
      random: () => 0,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].slug).toBe(slug);
    expect(updateEmoSpy).toHaveBeenCalledTimes(1);
    expect(updateEmoSpy.mock.calls[0][2]).toBe(60);
    expect(updateEmoSpy.mock.calls[0][3]?.gainedToday).toBe(DAILY_INTIMACY_GAIN_CAP);
  });

  it('群聊冷战成员不主动 @群主 且不会被拉来凑数插话', () => {
    const seed = chooseSeed({
      starter: { slug: 'xia-you', name: '夏柚', profile: BUILTIN_PRESETS[2].profile, sulkingLevel: 3 },
      others: [{ slug: 'lu-xi', name: '鹿汐', profile: BUILTIN_PRESETS[1].profile, sulkingLevel: 0 }],
      at: new Date('2026-11-27T15:00:00'),
      ctx: { history: [] },
      random: () => 0.99,
      allowPingOwner: true,
    });
    expect(seed.kind).not.toBe('ping_owner');

    const picked = pickSpeakers({
      text: '@鹿汐 晚饭吃啥',
      members: [
        { slug: 'lu-xi', name: '鹿汐', tags: [] },
        { slug: 'xia-you', name: '夏柚', tags: [] },
      ],
      history: [],
      maxSpeakers: 2,
      random: () => 0.05,
      sulkingLevelOf: (s) => (s === 'xia-you' ? 3 : 0),
    });
    expect(picked.map((m) => m.slug)).toEqual(['lu-xi']);

    // Also verify single-chat turn persists recentPad cleanly
    const res = evolveTurnEmotion(BUILTIN_PRESETS[2] as PersonaRecord, '你在干嘛呀', 'authentic');
    expect(res.snapshot.recentPad?.length).toBeGreaterThanOrEqual(1);
  });
});
