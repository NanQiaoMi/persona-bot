import { describe, expect, it } from 'vitest';
import {
  buildLlmHeaders,
  parseJsonFromLlmOutput,
  resolveLlmConfig,
} from '@/lib/llm/client';
import { LOCAL_GATEWAY_BASE_URL } from '@/lib/grok/models';
import { buildFingerprintFromLines } from '@/lib/persona/fingerprint';
import { blendStyle, emojiBudgetFromRate, MIRROR_WEIGHTS } from '@/lib/persona/style-blend';
import { analyzeUserChatStyle, polishYoungAdultBursts, trimExcessiveEmojis } from '@/lib/persona/style-loop';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';

describe('B6 unified LLM client', () => {
  it('defaults to the local gateway and model, and never calls upstream in Vitest without a key', () => {
    const cfg = resolveLlmConfig({ llmBaseUrl: '', llmApiKey: '', llmModel: '' });
    expect(cfg.baseUrl).toBe(process.env.LLM_BASE_URL || LOCAL_GATEWAY_BASE_URL);
    expect(cfg.endpoint.endsWith('/chat/completions')).toBe(true);
    expect(cfg.canCall).toBe(Boolean(process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'your-api-key'));
  });

  it('can call upstream with a real key and honours model overrides', () => {
    const cfg = resolveLlmConfig(
      { llmBaseUrl: 'https://api.example.com/v1/', llmApiKey: 'sk-test', llmModel: 'm1' },
      { model: 'm2' }
    );
    expect(cfg.canCall).toBe(true);
    expect(cfg.isLocalGateway).toBe(false);
    expect(cfg.endpoint).toBe('https://api.example.com/v1/chat/completions');
    expect(cfg.model).toBe('m2');
    expect(buildLlmHeaders('sk-test').Authorization).toBe('Bearer sk-test');
    expect(buildLlmHeaders('your-api-key').Authorization).toBeUndefined();
  });

  it('parses JSON wrapped in code fences or prose', () => {
    expect(parseJsonFromLlmOutput<{ a: number }>('```json\n{"a":1}\n```')?.a).toBe(1);
    expect(parseJsonFromLlmOutput<{ a: number }>('好的：{"a":2} 以上')?.a).toBe(2);
    expect(parseJsonFromLlmOutput('不是 JSON')).toBeNull();
  });
});

describe('B7 persona style takes priority over the global young-adult defaults', () => {
  const emojiLover = buildFingerprintFromLines([
    '今天超开心😆',
    '你也太可爱了吧😆😆',
    '好耶🥳',
    '冲冲冲😆',
    '晚安啦🌙',
    '哈哈哈哈😆',
  ]);

  it('uses 80/20 self/user weights in authentic and 60/40 in companion', () => {
    expect(MIRROR_WEIGHTS.authentic).toEqual({ self: 0.8, user: 0.2 });
    expect(MIRROR_WEIGHTS.companion).toEqual({ self: 0.6, user: 0.4 });
    const userLines = ['嗯', '好', '行', '知道了'];
    const authentic = blendStyle(emojiLover, userLines, 'authentic');
    const companion = blendStyle(emojiLover, userLines, 'companion');
    expect(authentic.anchored).toBe(true);
    expect(authentic.target.emojiRate).toBeGreaterThan(companion.target.emojiRate);
    expect(authentic.emojiBudget).toBeGreaterThanOrEqual(1);
    expect(authentic.allowedEmojis).toContain('😆');
  });

  it('falls back to defaults when the persona has no own fingerprint', () => {
    const r = blendStyle(null, [], 'authentic');
    expect(r.anchored).toBe(false);
    expect(r.emojiBudget).toBe(0);
  });

  it('maps emoji rate to a 0~3 budget', () => {
    expect(emojiBudgetFromRate(0)).toBe(0);
    expect(emojiBudgetFromRate(0.3)).toBe(1);
    expect(emojiBudgetFromRate(0.8)).toBe(2);
    expect(emojiBudgetFromRate(2)).toBe(3);
  });

  it('keeps the persona’s own emojis instead of stripping them as oily', () => {
    expect(trimExcessiveEmojis(['好耶🥳'], 1)).toEqual(['好耶']);
    expect(trimExcessiveEmojis(['好耶🥳'], 1, ['🥳'])).toEqual(['好耶🥳']);
    expect(trimExcessiveEmojis(['a😆', 'b😆', 'c😆'], 2).join('')).toBe('a😆b😆c');
  });

  it('polish honours blended overrides', () => {
    const profile = analyzeUserChatStyle([{ role: 'user', content: '嗯' }]);
    expect(polishYoungAdultBursts(['今天超开心😆'], profile)).toEqual(['今天超开心']);
    expect(
      polishYoungAdultBursts(['今天超开心😆'], profile, { maxEmoji: 1, allowedEmojis: ['😆'] })
    ).toEqual(['今天超开心😆']);
  });

  it('assembler uses the persona-first style section when anchored', () => {
    const persona = BUILTIN_PRESETS.find((p) => p.slug === 'lu-xi')!;
    const assembler = new PromptAssembler();
    const anchored = assembler.assembleFromRecord(persona, {
      blendedStyle: blendStyle(emojiLover, [], 'authentic'),
    });
    expect(anchored).toContain('## 说话方式（以 TA 本人为准，去 AI 味）');
    expect(anchored).not.toContain('平时默认 **0 个 emoji**');
    expect(anchored).toContain('拒绝主持人追问与 AI 套话');

    const fallback = assembler.assembleFromRecord(persona, {});
    expect(fallback).toContain('## 当代年轻人真实微信聊天铁律');
  });
});
