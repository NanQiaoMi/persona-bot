import { describe, it, expect } from 'vitest';
import { getPersonaModeSpec, PERSONA_MODES } from '@/lib/grok/persona-modes';
import {
  extractSearchQuery,
  formatSearchContextForPrompt,
  performDeepSearch,
  shouldAutoTriggerSearch,
} from '@/lib/grok/deep-search';
import { generateProactiveGreeting, getTimePeriodInfo } from '@/lib/grok/proactive-engine';
import {
  parseStructuredModelOutput,
  synthesizePersonaAwareFallback,
} from '@/lib/grok/stream-orchestrator';
import { analyzeChatLogCorpus } from '@/lib/persona/distiller';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { PromptAssembler } from '@/lib/prompt-assembler';

describe('Grok Brain, Modes, DeepSearch, Proactive Engine & Pure-TS Distiller', () => {
  it('supports all 4 Grok Persona Modes with distinct directives', () => {
    expect(Object.keys(PERSONA_MODES)).toEqual([
      'authentic',
      'fun',
      'companion',
      'analytical',
    ]);
    const funSpec = getPersonaModeSpec('fun');
    expect(funSpec.systemDirective).toContain('Grok');
    expect(funSpec.badge).toBe('⚡');
  });

  it('extracts search queries and runs DeepSearch with structured results', async () => {
    expect(extractSearchQuery('帮我查一下今天Grok 3有什么最新动态？')).toBe(
      '今天Grok 3有什么最新动态'
    );
    expect(shouldAutoTriggerSearch('今天热搜有什么大新闻？')).toBe(true);
    expect(shouldAutoTriggerSearch('抱抱我')).toBe(false);

    const searchResp = await performDeepSearch('人工智能最新趋势', {
      searchProvider: 'builtin',
    });
    expect(searchResp.query).toContain('人工智能');
    expect(searchResp.results.length).toBeGreaterThan(0);

    const formatted = formatSearchContextForPrompt(searchResp);
    expect(formatted).toContain('DeepSearch 实时联网检索结果');
  });

  it('generates time-aware proactive greetings based on hour and idle duration', () => {
    expect(getTimePeriodInfo(2).period).toBe('late_night');
    expect(getTimePeriodInfo(9).period).toBe('morning');

    const ella = BUILTIN_PRESETS[0];
    const idleGreeting = generateProactiveGreeting(ella, 12, 23);
    expect(idleGreeting.thought).toContain('12');
    expect(idleGreeting.bursts.length).toBeGreaterThanOrEqual(2);
  });

  it('parses structured model output (<thought>, [MOOD], [BURST], [PHOTO], [VOICE])', () => {
    const sample = `<thought>他居然问我在干嘛，先损他一句再发张桌面照。</thought>
[MOOD: 嘴硬暗爽 ⚡]
刚写完半篇稿子，累死我了 [BURST] 你呢，今天又摸了多久的鱼？
[PHOTO: 凌晨的机械键盘与半杯冰美式]
[VOICE: 还不快夸我勤奋]`;

    const parsed = parseStructuredModelOutput(sample);
    expect(parsed.thought).toContain('先损他一句');
    expect(parsed.mood).toBe('嘴硬暗爽 ⚡');
    expect(parsed.bursts).toHaveLength(2);
    expect(parsed.mediaCards).toHaveLength(2);
    expect(parsed.mediaCards[0].type).toBe('photo');
    expect(parsed.mediaCards[1].type).toBe('voice');
  });

  it('synthesizes persona-aware fallback and assembles full multi-layer system prompt', () => {
    const linWan = BUILTIN_PRESETS[1];
    const assembler = new PromptAssembler();
    const prompt = assembler.assembleFromRecord(linWan, {
      mode: 'fun',
      thinkMode: true,
      lastUserMessage: '想你了',
    });
    expect(prompt).toContain('Grok 毒舌犀利');
    expect(prompt).toContain('林晚');

    const fallbackRaw = synthesizePersonaAwareFallback(
      linWan,
      '发张自拍看看你',
      'authentic',
      null,
      false,
      true
    );
    const parsed = parseStructuredModelOutput(fallbackRaw);
    expect(parsed.thought.length).toBeGreaterThan(5);
    expect(parsed.mediaCards.some((c) => c.type === 'photo')).toBe(true);
  });

  it('analyzes WeChat and loose chat logs in pure TypeScript', () => {
    const sampleLog = `2026-05-01 21:10:00 小美: 笑死，你今天怎么这么笨啊
2026-05-01 21:11:00 我: 哪有
2026-05-01 21:12:00 小美: 不是吧，连这个都忘啦？笑死`;

    const stats = analyzeChatLogCorpus(sampleLog, '小美');
    expect(stats.totalCount).toBe(3);
    expect(stats.targetCount).toBe(2);
    expect(stats.participants).toContain('小美');
    expect(stats.topCatchphrases).toContain('笑死');
  });
});
