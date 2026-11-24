import { describe, expect, it } from 'vitest';
import {
  buildFingerprintFromLines,
  extractSampleLinesFromPersonaMd,
  fingerprintFromPersonaMd,
} from '@/lib/persona/fingerprint';
import { measureReply } from '@/lib/persona/eval/metrics';
import { scoreReply } from '@/lib/persona/eval/scorer';
import { PERSONA_EVAL_SCENARIOS } from '@/lib/persona/eval/scenarios';
import { analyzeUserChatStyle, polishYoungAdultBursts } from '@/lib/persona/style-loop';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import {
  parseStructuredModelOutput,
  sanitizeGatewayRefusalLeaks,
  splitIntoNaturalMessages,
  synthesizePersonaAwareFallback,
} from '@/lib/grok/stream-orchestrator';

describe('Persona eval: fingerprint, metrics & scorer', () => {
  it('builds a style fingerprint from real lines', () => {
    const fp = buildFingerprintFromLines([
      '哈哈哈笑死',
      '你又熬夜了吧',
      '行吧行吧 听你的',
      '哈哈哈哈这也太离谱了😂',
      '明天见。',
    ]);
    expect(fp.sampleCount).toBe(5);
    expect(fp.avgBubbleLen).toBeGreaterThan(4);
    expect(fp.catchphrases).toContain('哈哈哈');
    expect(fp.catchphrases).not.toContain('哈哈');
    expect(fp.topEmojis).toContain('😂');
    expect(fp.trailingPeriodRate).toBeCloseTo(0.2, 2);
  });

  it('extracts quoted sample lines from Layer 2 of persona markdown', () => {
    const md = `## Layer 1：身份\n「这句不算」\n## Layer 2：表达风格\n- 常说「笑死我了」\n- 「你又来了是吧」\n- “行吧随你”\n## Layer 3：情感逻辑\n「也不算」`;
    expect(extractSampleLinesFromPersonaMd(md)).toEqual(['笑死我了', '你又来了是吧', '行吧随你']);
    expect(fingerprintFromPersonaMd(md).sampleCount).toBe(3);
  });

  it('detects AI cliches, OOC leaks, host questions, stage directions and markdown', () => {
    const m = measureReply([
      '作为一个AI，我很乐意帮你！（微笑）',
      '**首先**，你需要休息',
      '希望这能帮到你，你呢？',
    ]);
    expect(m.oocHits.length).toBeGreaterThan(0);
    expect(m.aiClicheHits).toEqual(expect.arrayContaining(['希望这能帮到你', '我很乐意', '首先']));
    expect(m.hostQuestion).toBe(true);
    expect(m.stageDirectionCount).toBe(1);
    expect(m.markdownCount).toBeGreaterThan(0);
  });

  it('scores a natural reply far above a robotic one against the same fingerprint', () => {
    const fp = buildFingerprintFromLines(['笑死', '你又熬夜', '行吧', '我看看', '真假']);
    const natural = scoreReply(['笑死 你又熬夜', '赶紧睡'], fp);
    const robotic = scoreReply(
      [
        '我理解你的感受！！作为一个AI，我建议你首先保证充足的睡眠，其次合理安排工作时间。',
        '希望这能帮到你，你呢？😊✨🔥',
      ],
      fp
    );
    expect(natural.total).toBeGreaterThan(robotic.total + 30);
    expect(natural.deAI).toBe(100);
    expect(robotic.deAI).toBeLessThan(40);
  });
});

describe('Persona eval: offline fallback regression across builtin presets', () => {
  const runOfflineTurn = (presetIdx: number, userMessage: string) => {
    const persona = BUILTIN_PRESETS[presetIdx];
    const raw = synthesizePersonaAwareFallback(
      persona,
      userMessage,
      persona.defaultMode || 'authentic',
      null,
      false,
      false,
      1
    );
    const parsed = parseStructuredModelOutput(raw, '');
    const style = analyzeUserChatStyle([{ role: 'user', content: userMessage }]);
    const segments = splitIntoNaturalMessages(
      polishYoungAdultBursts(sanitizeGatewayRefusalLeaks(parsed.bursts), style)
    );
    return scoreReply(segments, fingerprintFromPersonaMd(persona.personaMd));
  };

  it('never leaks OOC phrases and keeps a minimum de-AI score in every scenario', () => {
    const rows: Array<{ slug: string; avgTotal: number; minDeAI: number }> = [];
    BUILTIN_PRESETS.forEach((persona, idx) => {
      const scores = PERSONA_EVAL_SCENARIOS.map((s) => runOfflineTurn(idx, s.userMessage));
      for (const sc of scores) {
        expect(sc.metrics.oocHits).toEqual([]);
        expect(sc.deAI).toBeGreaterThanOrEqual(50);
      }
      rows.push({
        slug: persona.slug,
        avgTotal: Math.round(scores.reduce((s, x) => s + x.total, 0) / scores.length),
        minDeAI: Math.min(...scores.map((x) => x.deAI)),
      });
    });
    if (process.env.PERSONA_EVAL_REPORT) {
      console.table(rows);
    }
    expect(rows.length).toBe(BUILTIN_PRESETS.length);
  });
});
