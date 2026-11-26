import { afterAll, describe, expect, it } from 'vitest';
import { appraisalToEmotion, assessPleasantness } from '@/lib/emotion/appraisal';
import {
  advanceSulkingState,
  applyLlmAffectSignal,
  buildSulkingDirective,
  detectBoundaryHit,
  detectCoaxingSignal,
  extractPersonaBoundaryHints,
  parseAffectTag,
  stripAffectTags,
} from '@/lib/emotion/sulking';
import { evolveTurnEmotion } from '@/lib/emotion/turn';
import type { PersonalityTraits } from '@/lib/emotion/types';
import { parseStructuredModelOutput, splitLiveBursts } from '@/lib/grok/stream-orchestrator';
import { extractLiveThought } from '@/lib/persona/inner-thought';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { buildTraitsBehaviorDirective } from '@/lib/persona/traits';
import { storageRepo } from '@/lib/storage/repository';

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
  recoveryPatterns: {
    from_anger: {
      description: '需要认真道歉或一杯热饮',
      decayRate: 0.15,
      triggers: ['道歉', '热美式'],
      timeToRecover: 2,
    },
  },
};

describe('semantic emotion appraisal & negation', () => {
  it('flips negated positive phrases and keeps negated negatives calm', () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const negHappy = assessPleasantness(
      { type: 'message', content: '我一点也不开心，真的不喜欢这样', sender: 'user', timestamp: now },
      BASE_TRAITS
    );
    expect(negHappy).toBeLessThan(-0.3);

    const negAngry = assessPleasantness(
      { type: 'message', content: '我没有生气啦', sender: 'user', timestamp: now },
      BASE_TRAITS
    );
    expect(negAngry).toBeGreaterThanOrEqual(0);
  });

  it('recognizes cold dismissal while keeping neutral single-char 嗯 unbiased', () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const cold = assessPleasantness(
      { type: 'message', content: '随便，无所谓', sender: 'user', timestamp: now },
      BASE_TRAITS
    );
    expect(cold).toBeLessThan(-0.15);

    const neutral = assessPleasantness(
      { type: 'message', content: '嗯', sender: 'user', timestamp: now },
      BASE_TRAITS
    );
    expect(neutral).toBe(0);

    const vec = appraisalToEmotion({
      novelty: 0.5,
      pleasantness: 0,
      goalRelevance: 0.7,
      copingPotential: 0.6,
      normCompatibility: 0.7,
    });
    expect(vec.pleasure).toBe(0);
  });
});

describe('sulking state machine, boundary detection & coaxing loop', () => {
  const sampleMd = `## Layer 3：情感逻辑
- 生气时需要对方认真认错或买杯奶茶哄一哄。

## Layer 5：边界与雷区
- 讨厌敷衍的模板赞美、讨厌被人催促“快点讲重点”。`;

  it('extracts Layer 5 boundary hints and ignores negated mentions', () => {
    const hints = extractPersonaBoundaryHints(sampleMd);
    expect(hints).toContain('快点讲重点');
    expect(detectBoundaryHit('你快点讲重点行不行', sampleMd)).toContain('快点讲重点');
    expect(detectBoundaryHit('我没有敷衍你呀', sampleMd)).toBeNull();
  });

  it('triggers sulking across turns, decays neutrally, and resolves on coaxing or 12h timeout', () => {
    const start = new Date('2026-11-26T10:00:00Z');
    const grumpyTraits: PersonalityTraits = { ...BASE_TRAITS, recoveryRate: 0.25 };

    const persona = {
      personaMd: sampleMd,
      intimacy: 70,
      relationship: undefined,
      emotionState: {
        primary: '平静',
        pleasure: 0.2,
        arousal: 0.3,
        dominance: 0.5,
        intensity: 0.5,
        lastUpdated: start.toISOString(),
        decayRate: 0.1,
      },
    };

    const hit = evolveTurnEmotion(persona, '少啰嗦，快点讲重点', 'authentic', start);
    expect(hit.snapshot.sulking).toBeDefined();
    expect(hit.snapshot.sulking?.level).toBe(3);
    expect(hit.snapshot.sulking?.remainingTurns).toBe(3);
    expect(hit.snapshot.pleasure).toBeLessThan(0);

    // Next neutral turn reduces remainingTurns but stays sulking
    const nextTurn = evolveTurnEmotion(
      { ...persona, emotionState: hit.snapshot, intimacy: hit.intimacy.intimacy },
      '嗯',
      'authentic',
      new Date('2026-11-26T10:05:00Z')
    );
    expect(nextTurn.snapshot.sulking?.remainingTurns).toBe(2);

    // Coaxing via strong apology or recoveryPattern trigger resolves sulking immediately
    expect(detectCoaxingSignal('给你买了热美式顺顺气', grumpyTraits, sampleMd)).toBe('mild');
    const coaxed = evolveTurnEmotion(
      { ...persona, emotionState: nextTurn.snapshot, intimacy: nextTurn.intimacy.intimacy },
      '对不起嘛，刚才是我太急了，别生气了',
      'authentic',
      new Date('2026-11-26T10:08:00Z')
    );
    expect(coaxed.snapshot.sulking).toBeUndefined();
    expect(coaxed.sulkingTransition.justResolved).toBe(true);

    // Over 12 hours auto-cools stale sulking
    const afterTimeout = advanceSulkingState({
      prevSulking: hit.snapshot.sulking,
      pleasantness: 0,
      boundaryHitReason: null,
      coaxSignal: null,
      traits: grumpyTraits,
      now: new Date('2026-11-26T23:00:00Z'),
    });
    expect(afterTimeout.sulking).toBeUndefined();
  });
});

describe('piggyback [AFFECT] parsing, streaming strip, and prompt directives', () => {
  it('parses [AFFECT] cleanly and strips full, fullwidth, and partial tags without leaking', () => {
    const raw =
      '[AFFECT: mood=有点火大 | delta=-0.35 | trigger=boundary | reason=一直催着讲重点]\n<thought>真够敷衍的，懒得热脸贴冷屁股</thought>\n行吧，你自己看呗。[BURST]我现在没心情拍。';
    const parsed = parseStructuredModelOutput(raw);
    expect(parsed.affect).toEqual({
      mood: '有点火大',
      delta: -0.35,
      trigger: 'boundary',
      reason: '一直催着讲重点',
    });
    expect(parsed.thought).toBe('真够敷衍的，懒得热脸贴冷屁股');
    expect(parsed.cleanReply).not.toContain('AFFECT');
    expect(parsed.bursts).toEqual(['行吧，你自己看呗。', '我现在没心情拍。']);

    const fullwidth = '【AFFECT: trigger=cold | delta=-0.2】哼，随你。';
    expect(parseAffectTag(fullwidth).affect?.trigger).toBe('cold');
    expect(splitLiveBursts(fullwidth)).toEqual(['哼，随你。']);

    const streamingPartial = '你先忙吧 [AFFECT: mood=委屈 | trig';
    expect(stripAffectTags(streamingPartial)).toBe('你先忙吧');
    expect(splitLiveBursts(streamingPartial)).toEqual(['你先忙吧']);

    const liveWithAffect = extractLiveThought(
      '[AFFECT: trigger=cold | delta=-0.2] <thought>还在装没事人呢'
    );
    expect(liveWithAffect?.thought).toBe('还在装没事人呢');
  });

  it('merges LLM affect signal while respecting bounded daily intimacy cap', () => {
    const now = new Date('2026-11-26T15:00:00Z');
    const merged = applyLlmAffectSignal({
      affect: { mood: '淡淡别扭中', delta: -0.25, trigger: 'cold', reason: '一直在回哦' },
      prevSnapshot: {
        primary: '平静',
        pleasure: 0.2,
        arousal: 0.3,
        dominance: 0.5,
        intensity: 0.4,
        lastUpdated: now.toISOString(),
        decayRate: 0.1,
      },
      currentSnapshot: {
        primary: '平静',
        pleasure: 0.1,
        arousal: 0.3,
        dominance: 0.5,
        intensity: 0.4,
        lastUpdated: now.toISOString(),
        decayRate: 0.1,
      },
      prevIntimacy: 70,
      currentIntimacy: 70,
      currentIntimacyDelta: 0,
      basePleasantness: 0,
      mode: 'authentic',
      traits: BASE_TRAITS,
      now,
    });
    expect(merged.snapshot.sulking?.level).toBe(1);
    expect(merged.snapshot.moodLabel).toBe('淡淡别扭中');
    expect(merged.intimacyDelta).toBe(-2);
    expect(merged.intimacy).toBe(68);
  });

  it('builds traits and sulking directives accurately and leaves neutral traits empty', () => {
    expect(buildTraitsBehaviorDirective(BASE_TRAITS)).toBe('');

    const directive = buildTraitsBehaviorDirective({
      openness: 0.8,
      conscientiousness: 0.3,
      extraversion: 0.8,
      agreeableness: 0.35,
      neuroticism: 0.75,
      emotionalStability: 0.3,
      recoveryRate: 0.3,
    });
    expect(directive).toContain('嘴硬带刺');
    expect(directive.split('\n').length).toBeLessThanOrEqual(5);

    const sulkDir = buildSulkingDirective(
      { level: 3, reason: '踩到雷区', remainingTurns: 2, since: '2026-11-26T12:00:00Z' },
      BASE_TRAITS,
      false
    );
    expect(sulkDir).toContain('冷处理中');
    expect(sulkDir).toContain('没心情拍');

    const resolvedDir = buildSulkingDirective(undefined, BASE_TRAITS, true);
    expect(resolvedDir).toContain('刚被哄好');
  });
});

describe('storage compatibility for emotionState.sulking', () => {
  const SLUG = 'test-sulking-storage';

  afterAll(async () => {
    await storageRepo.deletePersona(SLUG);
  });

  it('persists valid sulking and strips expired/zero-turn sulking on read', async () => {
    const base = BUILTIN_PRESETS[1];
    await storageRepo.savePersona({
      ...base,
      slug: SLUG,
      name: '别扭存储测试',
      isPreset: false,
      emotionState: {
        ...base.emotionState,
        sulking: {
          level: 2,
          reason: '测试别扭',
          remainingTurns: 2,
          since: '2026-11-26T12:00:00.000Z',
        },
      },
    });
    const loaded = await storageRepo.getPersona(SLUG);
    expect(loaded?.emotionState.sulking?.level).toBe(2);

    await storageRepo.updatePersona(SLUG, (p) => ({
      ...p,
      emotionState: {
        ...p.emotionState,
        sulking: {
          level: 2,
          reason: '已归零',
          remainingTurns: 0,
          since: '2026-11-26T12:00:00.000Z',
        },
      },
    }));
    const cleaned = await storageRepo.getPersona(SLUG);
    expect(cleaned?.emotionState.sulking).toBeUndefined();
  });
});
