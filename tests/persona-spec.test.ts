import { afterAll, describe, expect, it } from 'vitest';
import {
  CORRECTION_HEADING,
  ensurePersonaSpec,
  LEARNED_HABITS_HEADING,
  parseLearnedFromMarkdown,
  reconcileSpecWithMarkdown,
  renderPersonaMarkdown,
  STYLE_LOOP_HEADING,
  stripLearnedSections,
} from '@/lib/persona/spec';
import { mergeLearnedCandidates, textSimilarity } from '@/lib/persona/learned';
import { heuristicTraits, normalizeTraits, resolvePersonalityTraits } from '@/lib/persona/traits';
import { fitPersonaToBudget } from '@/lib/persona/prompt-budget';
import { analyzeChatLogCorpus, distillPersona } from '@/lib/persona/distiller';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { storageRepo } from '@/lib/storage/repository';

const LEGACY_MD = `# Layer 0：核心
保持真实。

## Layer 2：表达风格
- 常说「笑死」

${LEARNED_HABITS_HEADING}
- [2026/11/20] 对方熬夜时先催去喝水
- [2026/11/21] 互动风格调整：别空喊加油

${STYLE_LOOP_HEADING}
- [2026/11/22] 单轮最多保留 1 个克制表情，避免油腻连发

${CORRECTION_HEADING}
- [纠偏 2026/11/23] 避免「加油哦」，应当：先调侃一句再关心`;

describe('PersonaSpec migration & rendering', () => {
  it('parses legacy sections into learned items, keeps dates and drops duplicated correction habits', () => {
    const items = parseLearnedFromMarkdown(LEGACY_MD);
    expect(items.map((i) => i.kind)).toEqual(['habit', 'style', 'correction']);
    expect(items[0].text).toBe('对方熬夜时先催去喝水');
    expect(new Date(items[0].createdAt).getDate()).toBe(20);
    expect(items[1].dimension).toBe('emoji');
    expect(items[2].status).toBe('locked');
  });

  it('round-trips legacy markdown without losing author layers or entries', () => {
    const spec = ensurePersonaSpec(LEGACY_MD);
    const rendered = renderPersonaMarkdown(LEGACY_MD, spec.learned);
    expect(stripLearnedSections(rendered)).toBe(stripLearnedSections(LEGACY_MD));
    expect(rendered).toContain('- [2026/11/20] 对方熬夜时先催去喝水');
    expect(rendered).toContain('[纠偏 2026/11/23] 避免「加油哦」');
    expect(rendered).not.toContain('互动风格调整');
    expect(rendered.indexOf(LEARNED_HABITS_HEADING)).toBeLessThan(rendered.indexOf(CORRECTION_HEADING));
  });

  it('migrates every builtin preset losslessly', () => {
    for (const preset of BUILTIN_PRESETS) {
      const spec = ensurePersonaSpec(preset.personaMd);
      const rendered = renderPersonaMarkdown(preset.personaMd, spec.learned);
      expect(stripLearnedSections(rendered)).toBe(stripLearnedSections(preset.personaMd));
      expect(renderPersonaMarkdown(rendered, spec.learned)).toBe(rendered);
    }
  });

  it('does not render retired items and marks trial items', () => {
    const spec = ensurePersonaSpec(LEGACY_MD);
    spec.learned[0].status = 'retired';
    spec.learned[1].status = 'trial';
    const md = renderPersonaMarkdown(LEGACY_MD, spec.learned);
    expect(md).not.toContain('对方熬夜时先催去喝水');
    expect(md).toContain('避免油腻连发（试用中）');
  });

  it('reconciles direct markdown edits back into learned items', () => {
    const spec = ensurePersonaSpec(LEGACY_MD);
    const edited = renderPersonaMarkdown(LEGACY_MD, spec.learned)
      .replace('- [2026/11/20] 对方熬夜时先催去喝水\n', '- [2026/11/24] 聊工作少讲大道理\n');
    const next = reconcileSpecWithMarkdown(spec, edited);
    const byText = (t: string) => next.learned.find((i) => i.text === t);
    expect(byText('对方熬夜时先催去喝水')?.status).toBe('retired');
    expect(byText('聊工作少讲大道理')?.status).toBe('locked');
    expect(byText('聊工作少讲大道理')?.source).toBe('user-edit');
    expect(byText('单轮最多保留 1 个克制表情，避免油腻连发')?.id).toBe(spec.learned[1].id);
  });
});

describe('learned item dedupe', () => {
  it('treats paraphrases as the same rule and reinforces instead of duplicating', () => {
    expect(textSimilarity('对方熬夜时先催去喝水', '对方熬夜时先催他去喝水')).toBeGreaterThan(0.55);
    const spec = ensurePersonaSpec(LEGACY_MD);
    const before = spec.learned.length;
    const res = mergeLearnedCandidates(spec, [
      { kind: 'habit', text: '对方熬夜时先催他去喝水', source: 'llm' },
      { kind: 'habit', text: '聊到考试时多鼓励', source: 'llm' },
    ]);
    expect(res.spec.learned.length).toBe(before + 1);
    expect(res.reinforced[0].hitCount).toBe(2);
    expect(res.added[0].text).toBe('聊到考试时多鼓励');
  });

  it('does not resurrect retired items', () => {
    const spec = ensurePersonaSpec(LEGACY_MD);
    spec.learned[0].status = 'retired';
    const res = mergeLearnedCandidates(spec, [{ kind: 'habit', text: '对方熬夜时先催去喝水', source: 'heuristic' }]);
    expect(res.added).toHaveLength(0);
    expect(res.reinforced).toHaveLength(0);
  });
});

describe('traits & prompt budget', () => {
  it('infers traits from MBTI, attachment and keywords', () => {
    const t = heuristicTraits('平时很毒舌，但其实很记仇', { mbti: 'INTJ', attachment: '焦虑型' });
    expect(t.extraversion).toBeLessThan(0.5);
    expect(t.conscientiousness).toBeGreaterThan(0.5);
    expect(t.neuroticism).toBeGreaterThan(0.6);
    expect(t.agreeableness).toBeLessThan(0.5);
    expect(t.recoveryRate).toBeLessThan(0.5);
  });

  it('normalizes LLM traits and falls back on bad values', () => {
    const fb = heuristicTraits('', {});
    const t = normalizeTraits({ openness: 1.4, extraversion: 'x', neuroticism: 0.2 }, fb);
    expect(t.openness).toBe(1);
    expect(t.extraversion).toBe(fb.extraversion);
    expect(t.neuroticism).toBe(0.2);
    expect(t.source).toBe('llm');
  });

  it('emotion engine uses spec traits when present', () => {
    const traits = resolvePersonalityTraits({
      personaMd: '',
      spec: { traits: { ...heuristicTraits('', {}), neuroticism: 0.9, source: 'llm' } },
    });
    expect(traits.neuroticism).toBe(0.9);
  });

  it('keeps Layer 0 and learned/correction sections intact while trimming other layers', () => {
    const long = `# 标题\n## Layer 0：核心\n最高优先级规则\n## Layer 1：身份\n${'身份细节'.repeat(1500)}\n## Layer 3：情感\n${'情感细节'.repeat(1500)}\n${CORRECTION_HEADING}\n- [纠偏 2026/11/1] 别油腻`;
    const fitted = fitPersonaToBudget(long, 3000);
    expect(fitted.length).toBeLessThanOrEqual(3200);
    expect(fitted).toContain('最高优先级规则');
    expect(fitted).toContain('别油腻');
    expect(fitted).toContain('## Layer 3：情感');
    expect(fitted).toContain('…（略）');
  });
});

describe('storage integration', () => {
  const SLUG = 'test-spec-bot';
  afterAll(async () => {
    await storageRepo.deletePersona(SLUG);
    await storageRepo.deletePersona('spec蒸馏测试');
  });

  it('addCorrection creates a locked learned item rendered in the Correction section', async () => {
    await storageRepo.savePersona({ ...BUILTIN_PRESETS[2], slug: SLUG, isPreset: false, spec: undefined });
    const updated = await storageRepo.addCorrection(SLUG, {
      userInput: '好累',
      botResponse: '加油哦',
      correction: '先调侃一句再关心',
      category: 'style',
    });
    const item = updated?.spec?.learned.find((i) => i.kind === 'correction' && i.text.includes('先调侃一句'));
    expect(item?.status).toBe('locked');
    expect(updated?.personaMd).toContain('应当：先调侃一句再关心');
    const reread = await storageRepo.getPersona(SLUG);
    expect(reread?.spec?.learned.some((i) => i.id === item?.id)).toBe(true);
  });

  it('distillation stores a chat-log fingerprint and traits in the spec', async () => {
    const log = Array.from({ length: 6 }, (_, i) =>
      `小林: 哈哈哈笑死 第${i}次了😂\n我: 真的假的`
    ).join('\n');
    expect(analyzeChatLogCorpus(log, '小林').targetLines.length).toBe(6);
    const res = await distillPersona({
      name: 'spec蒸馏测试',
      personalityInfo: 'ENFP 话多 温柔',
      chatLogText: log,
      targetSpeaker: '小林',
    });
    expect(res.persona.spec?.fingerprint?.source).toBe('chatlog');
    expect(res.persona.spec?.fingerprint?.topEmojis).toContain('😂');
    expect(res.persona.spec?.traits?.extraversion).toBeGreaterThan(0.6);
  });
});
