import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatCognitiveReflectionForPrompt,
  runDeepCognitivePass,
  shouldTriggerDeepCognitivePass,
} from '@/lib/persona/cognitive-loop';
import {
  buildFewShotDirective,
  classifyMessageScene,
  extractFewShotsFromCorrections,
  extractFewShotsFromPersonaMd,
  selectDynamicFewShots,
} from '@/lib/persona/few-shot';
import { extractLiveThought, isForbiddenThought, sanitizeInnerThought } from '@/lib/persona/inner-thought';
import {
  buildMindCognitiveDirective,
  inferDefaultModeFromPersonality,
  inferPersonaMind,
  inferPersonaTemperament,
} from '@/lib/persona/mind';
import { ensurePersonaSpec, PERSONA_SPEC_VERSION } from '@/lib/persona/spec';
import { distillPersona } from '@/lib/persona/distiller';
import { createBotFromIntent } from '@/lib/persona/chat-create';
import { PromptAssembler } from '@/lib/prompt-assembler';
import {
  executeGrokChatTurn,
  parseStructuredModelOutput,
  synthesizePersonaAwareFallback,
} from '@/lib/grok/stream-orchestrator';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { storageRepo } from '@/lib/storage/repository';
import type { LlmConfig } from '@/lib/llm/client';

const TEST_LLM: LlmConfig = {
  baseUrl: 'http://127.0.0.1:9/v1',
  endpoint: 'http://127.0.0.1:9/v1/chat/completions',
  apiKey: 'sk-test',
  model: 'test-model',
  isLocalGateway: true,
  canCall: true,
};

function sseResponse(chunks: string[]) {
  const body =
    chunks
      .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
      .join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const createdSlugs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const slug of createdSlugs) {
    await storageRepo.deletePersona(slug);
  }
});

describe('PersonaSpec v2 backward compatibility', () => {
  it('preserves mind, temperament, and auto-seeds baselineTraits from traits', () => {
    const spec = ensurePersonaSpec('# 角色', {
      specVersion: 1,
      traits: {
        openness: 0.6,
        conscientiousness: 0.7,
        extraversion: 0.3,
        agreeableness: 0.4,
        neuroticism: 0.5,
        emotionalStability: 0.6,
        recoveryRate: 0.4,
        source: 'heuristic',
      },
      mind: {
        cognitiveStyle: 'analytical-logic',
        defenseStyle: 'direct-pushback',
        disagreementStyle: 'blunt',
        subtextLevel: 0.25,
        coreValues: ['有一说一'],
      },
      temperament: {
        archetype: 'snappy',
        intensityTier: 'spicy',
        triggers: ['敷衍'],
        coaxMethods: ['先认错'],
      },
      learned: [],
    });

    expect(PERSONA_SPEC_VERSION).toBe(2);
    expect(spec.baselineTraits).toEqual(spec.traits);
    expect(spec.mind?.cognitiveStyle).toBe('analytical-logic');
    expect(spec.temperament?.intensityTier).toBe('spicy');
  });
});

describe('Mind, temperament & mode inference', () => {
  it('infers differentiated cognitive/defense/temperament styles without defaulting everything to fun', () => {
    expect(inferDefaultModeFromPersonality('安静慢热、观察细致的内向摄影师')).toBe('authentic');
    expect(inferDefaultModeFromPersonality('嘴欠毒舌又爱吐槽的损友')).toBe('fun');
    expect(inferDefaultModeFromPersonality('温柔高共情、非常贴心的伴侣')).toBe('companion');
    expect(inferDefaultModeFromPersonality('第一性原理冷静分析的极客')).toBe('analytical');

    const logicMind = inferPersonaMind('遇事冷静拆解逻辑，不吃情绪鸡汤，有话直说。', {
      mbti: 'INTJ',
      personalityTags: ['冷静', '直爽'],
    });
    expect(logicMind.cognitiveStyle).toBe('analytical-logic');
    expect(logicMind.subtextLevel).toBeLessThan(0.35);

    const jealousTemp = inferPersonaTemperament(
      '## Layer 5：边界与雷区\n- 最讨厌拿我和别人比较。\n## Layer 3：情感逻辑\n- 容易吃醋，需要对方明确偏爱。',
      { personalityTags: ['容易吃醋'] }
    );
    expect(jealousTemp.archetype).toBe('jealous');
    expect(jealousTemp.intensityTier).toBe('realistic');
    expect(jealousTemp.triggers.some((t) => t.includes('比较'))).toBe(true);

    const directive = buildMindCognitiveDirective(logicMind, jealousTemp);
    expect(directive).toContain('真实熟人分歧权');
    expect(directive).toContain('心理防御');
  });
});

describe('Dynamic Few-Shot retrieval', () => {
  const sampleMd = `# 测试人物
## Layer 2：表达风格
> 有人问你今天过得怎么样：
> 你：凑合吧，刚把手头事收完

> 有人很久没回消息：
> 你：哟，大忙人终于看手机了？

> 有人说“好累”：
> 你：别硬撑了，先把手机放下喝口热茶`;

  it('extracts dialogue pairs, classifies scenes, and prioritizes matching examples', () => {
    const extracted = extractFewShotsFromPersonaMd(sampleMd);
    expect(extracted.length).toBe(3);
    expect(classifyMessageScene('我好累好想哭', 0)).toBe('comfort');
    expect(classifyMessageScene('你凭什么这么说，不对吧', 0)).toBe('disagree');
    expect(classifyMessageScene('随便吧无所谓', 2)).toBe('conflict');

    const correctionExamples = extractFewShotsFromCorrections([
      {
        id: 'c1',
        kind: 'correction',
        text: '避免「加油哦」，应当：先调侃一句再接住情绪',
        source: 'user-correction',
        evidenceMsgIds: [],
        confidence: 1,
        status: 'locked',
        hitCount: 1,
        createdAt: '2026-11-27T00:00:00Z',
        updatedAt: '2026-11-27T00:00:00Z',
      },
    ]);
    expect(correctionExamples).toHaveLength(1);

    const selected = selectDynamicFewShots({
      personaMd: sampleMd,
      userMessage: '今天加班好累啊，烦死了',
      maxExamples: 2,
    });
    expect(selected[0].scene).toBe('comfort');
    expect(buildFewShotDirective(selected)).toContain('说话质感参考');
  });
});

describe('Hybrid adaptive cognitive loop', () => {
  it('stays fast on casual turns and triggers deep pass on tension/conflict', () => {
    expect(
      shouldTriggerDeepCognitivePass({
        userMessage: '今晚吃辣的吗',
        sulkingLevel: 0,
        pleasantness: 0.1,
      }).trigger
    ).toBe(false);

    expect(
      shouldTriggerDeepCognitivePass({
        userMessage: '你凭什么这样说，这明明不对吧',
        sulkingLevel: 0,
        pleasantness: 0,
        isMasterBot: true,
      }).trigger
    ).toBe(false);

    expect(
      shouldTriggerDeepCognitivePass({
        userMessage: '你凭什么这样说，这明明不对吧',
        sulkingLevel: 0,
        pleasantness: -0.1,
      })
    ).toEqual({ trigger: true, reason: 'disagreement' });

    expect(
      shouldTriggerDeepCognitivePass({
        userMessage: '今天真的崩溃了，工作和家里一堆事压得我喘不过气好累好难受',
        sulkingLevel: 0,
        pleasantness: -0.3,
      })
    ).toEqual({ trigger: true, reason: 'confiding' });

    expect(
      shouldTriggerDeepCognitivePass({
        userMessage: '随便',
        sulkingLevel: 0,
        intensityTier: 'spicy',
        pleasantness: 0,
      })
    ).toEqual({ trigger: true, reason: 'spicy_tension' });
  });

  it('parses valid cognitive reflection, sanitizes meta-talk, and degrades gracefully on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  interpretation: '他又在拿敷衍态度试探我底线',
                  innerReaction: '心里火气一下就上来了，但表面先憋住',
                  stance: '绝不顺着他打哈哈',
                  surfaceStrategy: '冷淡短回，让他自己意识到不对',
                  spokenThought: '真当我好糊弄呢，这事没那么容易翻篇。',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const mind = inferPersonaMind('直爽有底线');
    const reflection = await runDeepCognitivePass(TEST_LLM, {
      personaName: '夏柚',
      mind,
      recentMessages: [],
      userMessage: '随便吧，都行',
      triggerReason: 'sulking',
    });
    expect(reflection?.spokenThought).toBe('真当我好糊弄呢，这事没那么容易翻篇。');
    expect(formatCognitiveReflectionForPrompt(reflection!)).toContain('站定立场');

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('timeout'));
    const failed = await runDeepCognitivePass(TEST_LLM, {
      personaName: '夏柚',
      mind,
      recentMessages: [],
      userMessage: '随便',
      triggerReason: 'sulking',
    });
    expect(failed).toBeNull();
  });
});

describe('Inner thought extraction & sanitization', () => {
  it('supports [EARLY] before <thought> and strips AI analytical phrasing', () => {
    const live = extractLiveThought('[EARLY: 等一下][MOOD: 嘴硬中]<thought>差一点就心软了</thought>算你识相');
    expect(live).toEqual({ thought: '差一点就心软了', closed: true });

    expect(isForbiddenThought('根据用户的意图和Layer 0人设保持一致')).toBe(true);
    expect(sanitizeInnerThought('根据指令保持人设回复用户', { minLength: 1 })).toBe('');
    expect(sanitizeInnerThought('才不想理他呢', { minLength: 1 })).toBe('才不想理他呢');

    const parsed = parseStructuredModelOutput(
      '<thought>根据用户的回复策略需要保持人设</thought>行吧行吧。',
      '真拿他没办法，算了。'
    );
    expect(parsed.thought).toBe('真拿他没办法，算了。');
  });
});

describe('4-tier Prompt priority & Level 3 cold-war media triple-lock', () => {
  it('orders core identity & sulking above PersonaMode and gates photo/sticker during Level 3 sulking', () => {
    const asm = new PromptAssembler();
    const prompt = asm.assembleSystemPrompt(
      {
        persona_md: '## Layer 0：核心\n有主见。',
        memories_md: '',
        ai_profile: '',
        meta: { defaultMode: 'companion', basicPersonality: '外冷内热有底线' },
      },
      { emotion: '生气', intensity: 0.85, attitude: '有点火大', intimacy: 70 },
      '帮我拍张自拍',
      {
        mode: 'companion',
        sulkingLevel: 3,
        sulkingDirective: '## 当前情绪余波：明显踩雷，冷处理中（快点讲重点）',
        mindDirective: '## 性格思考内核与真实熟人分歧权\n- **思考习惯**：先拆解逻辑。',
      }
    );

    expect(prompt.indexOf('主人给你定的基础性格')).toBeLessThan(prompt.indexOf('高共情伴侣'));
    expect(prompt.indexOf('明显踩雷，冷处理中')).toBeLessThan(prompt.indexOf('高共情伴侣'));
    expect(prompt).toContain('冷战期媒体门控');
    expect(prompt).not.toContain('绝对禁止**拒绝拍照');
  });

  it('strips model-emitted photo/sticker and blocks auto-prepend during Level 3 sulking', async () => {
    const slug = 'test-cold-war-media-lock';
    createdSlugs.push(slug);
    await storageRepo.savePersona({
      ...BUILTIN_PRESETS[2],
      slug,
      isPreset: false,
      emotionState: {
        primary: '生气',
        pleasure: -0.5,
        arousal: 0.6,
        dominance: 0.5,
        intensity: 0.8,
        moodLabel: '有点火大',
        lastUpdated: new Date().toISOString(),
        decayRate: 0.1,
        sulking: {
          level: 3,
          reason: '刚才一直敷衍',
          remainingTurns: 3,
          since: new Date().toISOString(),
        },
      },
    });

    const realSettings = await storageRepo.getSettings();
    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
      ...realSettings,
      llmApiKey: 'sk-test-cold-war',
      llmBaseUrl: 'http://127.0.0.1:9/v1',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Call 1: deep cognitive pass (sulking trigger)
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  interpretation: '气还没消就想让我拍照',
                  innerReaction: '更烦了，不想配合',
                  stance: '直接冷淡拒绝',
                  surfaceStrategy: '不拍，让他先认真道歉',
                  spokenThought: '这会儿还让我拍照，想得美。',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    // Call 2: main model deliberately disobeys and emits PHOTO + STICKER
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        '<thought>真懒得理他</thought>现在没心情拍。[PHOTO: 对镜笑脸自拍][STICKER: 比心]',
      ])
    );

    const res = await executeGrokChatTurn({
      slug,
      messages: [{ role: 'user', content: '发张自拍和表情包给我看看' }],
      thinkMode: true,
      deepSearch: false,
      requestPhoto: true,
      requestSticker: true,
      skipPersistence: true,
    });

    expect((res.mediaCards || []).some((c) => c.type === 'photo' || c.type === 'sticker')).toBe(false);

    const offlineCold = synthesizePersonaAwareFallback(
      BUILTIN_PRESETS[2],
      '看看你的自拍',
      'authentic',
      null,
      false,
      true,
      1,
      3
    );
    expect(offlineCold).not.toContain('[PHOTO:');
    expect(offlineCold).toContain('没心情拍');
  });
});

describe('Creation path de-biasing', () => {
  it('distillPersona without MBTI avoids forced ENFP, uses Chinese primary emotion, and seeds mind/temperament/baselineTraits', async () => {
    const res = await distillPersona({
      name: '清淡测试角色',
      ensureUniqueSlug: true,
      basicPersonality: '安静沉稳、不喜欢废话的图书馆管理员',
      personalityInfo: '安静沉稳、不喜欢废话的图书馆管理员',
    });
    createdSlugs.push(res.persona.slug);

    expect(res.persona.defaultMode).toBe('authentic');
    expect(res.persona.profile.mbti).toBe('');
    expect(res.persona.emotionState.primary).toBe('开心');
    expect(res.persona.spec?.baselineTraits).toEqual(res.persona.spec?.traits);
    expect(res.persona.spec?.mind).toBeDefined();
    expect(res.persona.spec?.temperament).toBeDefined();
    expect(res.persona.spec?.traits?.extraversion).toBeLessThan(0.6);
  });

  it('createBotFromIntent infers defaultMode instead of hardcoding fun', async () => {
    const { persona } = await createBotFromIntent({
      name: '测试温和学姐',
      personality: '温柔耐心、细心安慰人的学姐',
    });
    createdSlugs.push(persona.slug);
    expect(persona.defaultMode).toBe('companion');
  });
});
