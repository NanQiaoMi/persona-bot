import { describe, it, expect, vi } from 'vitest';
import { getPersonaModeSpec, PERSONA_MODES } from '@/lib/grok/persona-modes';
import {
  extractSearchQuery,
  formatSearchContextForPrompt,
  performDeepSearch,
  shouldAutoTriggerSearch,
} from '@/lib/grok/deep-search';
import { generateProactiveGreeting, getTimePeriodInfo } from '@/lib/grok/proactive-engine';
import {
  buildContextualMediaCaption,
  computeRealisticTypingDelayMs,
  executeGrokChatTurn,
  parseStructuredModelOutput,
  sanitizeGatewayRefusalLeaks,
  splitIntoNaturalMessages,
  splitLiveBursts,
  StreamEvent,
  synthesizePersonaAwareFallback,
} from '@/lib/grok/stream-orchestrator';
import { storageRepo } from '@/lib/storage/repository';
import {
  buildMediaGenerationPrompt,
  generatePersonaMedia,
  LOCAL_CHAT_MODELS,
  LOCAL_IMAGE_MODELS,
} from '@/lib/grok/image-generator';
import { executeMasterBotTurn } from '@/lib/grok/master-orchestrator';
import {
  extractMemorableFactFromTurn,
  mergeMemoryIntoMarkdown,
} from '@/lib/persona/auto-memory';
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
    // 这条会真的联网检索（维基 / DuckDuckGo），网络慢时会超过默认 5 秒
  }, 20_000);

  it('generates time-aware proactive greetings based on hour and idle duration', () => {
    expect(getTimePeriodInfo(2).period).toBe('late_night');
    expect(getTimePeriodInfo(9).period).toBe('morning');

    const chenYe =
      BUILTIN_PRESETS.find((p) => p.slug === 'chen-ye') || BUILTIN_PRESETS[0];
    const idleGreeting = generateProactiveGreeting(chenYe, 12, 23);
    expect(idleGreeting.situation).toBe('long_idle');
    expect(idleGreeting.bursts.length).toBeGreaterThanOrEqual(1);
    expect(idleGreeting.content).not.toMatch(/\{(hours|hour|topic)\}/);
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
    const xiaYou =
      BUILTIN_PRESETS.find((p) => p.slug === 'xia-you') || BUILTIN_PRESETS[1];
    const assembler = new PromptAssembler();
    const prompt = assembler.assembleFromRecord(xiaYou, {
      mode: 'fun',
      thinkMode: true,
      lastUserMessage: '想你了',
    });
    expect(prompt).toContain('Grok 毒舌犀利');
    expect(prompt).toContain('夏柚');

    const fallbackRaw = synthesizePersonaAwareFallback(
      xiaYou,
      '发张自拍看看你',
      'authentic',
      null,
      false,
      true,
      4
    );
    const parsed = parseStructuredModelOutput(fallbackRaw);
    expect(parsed.thought.length).toBeGreaterThan(5);
    expect(parsed.mediaCards.some((c) => c.type === 'photo')).toBe(true);

    const challengeRaw = synthesizePersonaAwareFallback(
      xiaYou,
      '你是AI机器人吧',
      'fun',
      null,
      false,
      false,
      2
    );
    const challengeParsed = parseStructuredModelOutput(challengeRaw);
    expect(challengeParsed.cleanReply).toContain('图灵测试');
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

  it('dispatches master-bot commands to sub-bots and aggregates interBotReports', async () => {
    const events: string[] = [];
    const result = await executeMasterBotTurn(
      {
        slug: 'master-bot',
        messages: [
          {
            role: 'user',
            content: '请让 鹿汐 和 陈野 一起调研下今天 AI 开源动态',
          },
        ],
        mode: 'analytical',
        thinkMode: true,
        deepSearch: false,
      },
      (ev) => {
        events.push(ev.type);
      }
    );

    expect(events).toContain('status');
    expect(events).toContain('done');
    expect(result.interBotReports && result.interBotReports.length).toBeGreaterThanOrEqual(2);
    expect(result.content).toContain('已交回本轮执行结果');
  });

  it('parses [STICKER] tags, builds sticker/photo prompts, and degrades gracefully when gateway is offline', async () => {
    const sample = `<thought>他求安慰了，配一个摸摸头的表情包。</thought>
[MOOD: 嘴硬心软 🐾]
好啦好啦别丧啦 [BURST] 给你摸摸头，歇五分钟再继续！
[STICKER: 歪头举着小花说辛苦了的可爱表情包]`;

    const parsed = parseStructuredModelOutput(sample);
    expect(parsed.mediaCards.some((c) => c.type === 'sticker')).toBe(true);
    expect(parsed.mediaCards.find((c) => c.type === 'sticker')?.caption).toContain('辛苦了');

    const stickerPrompt = buildMediaGenerationPrompt(
      'sticker',
      '歪头吐舌头嘲笑你熬夜',
      '艾拉 Ella',
      '毒舌幽默'
    );
    expect(stickerPrompt).toContain('chat sticker illustration');

    const photoPrompt = buildMediaGenerationPrompt(
      'photo',
      '凌晨书桌旁的冰美式和机械键盘',
      '艾拉 Ella'
    );
    expect(photoPrompt).toContain('Natural candid lifestyle photograph');

    expect(LOCAL_CHAT_MODELS).toContain('gpt-5.6');
    expect(LOCAL_IMAGE_MODELS).toContain('gpt-image-2.6');

    const offlineRes = await generatePersonaMedia({
      kind: 'sticker',
      caption: '开心比耶',
      personaName: '艾拉 Ella',
      baseUrl: 'http://127.0.0.1:18699/v1',
      imageModel: 'gpt-image-2.6',
    });
    expect(offlineRes.imageUrl).toBeUndefined();
    expect(offlineRes.errorHint).toBeTruthy();

    const rawStream = `<thought>内部思考</thought>\n[MOOD: 开心]\n\n\n第一句气泡\n\n\n\n[BURST]\n\n第二句气泡\n[STICKER: 得意`;
    const bursts = splitLiveBursts(rawStream);
    expect(bursts).toEqual(['第一句气泡', '第二句气泡']);
  });

  it('omits fake thoughts when missing, parses [EARLY] and [FOLLOWUP], and enforces anti-OOC camera immersion', () => {
    const noThoughtParsed = parseStructuredModelOutput(
      `[EARLY: 稍等我两秒]\n[MOOD: 嘴硬心软]\n其实我觉得你今天已经够拼了 [BURST] 先去洗个热水澡吧\n[FOLLOWUP: 12 | 对了，洗完记得吹干头发再躺下]`
    );
    expect(noThoughtParsed.thought).toBe('');
    expect(noThoughtParsed.bursts).toEqual([
      '稍等我两秒',
      '其实我觉得你今天已经够拼了',
      '先去洗个热水澡吧',
    ]);
    expect(noThoughtParsed.followup).toEqual({
      delaySec: 12,
      content: '对了，洗完记得吹干头发再躺下',
    });

    const luXi =
      BUILTIN_PRESETS.find((p) => p.slug === 'lu-xi') || BUILTIN_PRESETS[0];
    const assembler = new PromptAssembler();
    const systemPrompt = assembler.assembleFromRecord(luXi, {
      mode: 'fun',
      thinkMode: true,
      lastUserMessage: '发张随手拍看看',
    });
    expect(systemPrompt).toContain('严禁');
    expect(systemPrompt).toContain('[FOLLOWUP:');
  });

  it('sanitizes gateway temporary-chat refusal leaks and builds contextual media captions', () => {
    const dirtyBursts = [
      '哼哼，这就给你安排黑色过膝长靴配短裙和宽松毛衣～',
      '不过你现在是在临时聊天，切换到普通聊天就能用图片生成功能啦。🙈',
    ];
    const cleaned = sanitizeGatewayRefusalLeaks(dirtyBursts);
    expect(cleaned).toEqual(['哼哼，这就给你安排黑色过膝长靴配短裙和宽松毛衣～']);

    const caption = buildContextualMediaCaption(
      'photo',
      'mi mi',
      '发张你穿黑色过膝长靴的照片看看',
      '哼哼，这就给你安排黑色过膝长靴，搭配短裙和软乎乎毛衣！',
      '开心'
    );
    expect(caption).toContain('过膝长靴');
    expect(caption).not.toContain('顺手拍下的日常画面');
  });

  it('auto-extracts memorable user facts, deduplicates memories.md, and embeds appearanceAnchor in media prompts', () => {
    expect(extractMemorableFactFromTurn('你好呀')).toBeNull();
    const prefFact = extractMemorableFactFromTurn('我平时最爱喝冰美式，但不吃香菜');
    expect(prefFact).toContain('冰美式');

    const planFact = extractMemorableFactFromTurn('我下周二要去北京参加一场重要面试');
    expect(planFact).toContain('下周二');

    const firstMerge = mergeMemoryIntoMarkdown('# 共同记忆', prefFact!, '2026/11/24');
    expect(firstMerge.updated).toBe(true);
    expect(firstMerge.memoriesMd).toContain('对话自动沉淀的长期记忆');

    const dupMerge = mergeMemoryIntoMarkdown(firstMerge.memoriesMd, prefFact!, '2026/11/24');
    expect(dupMerge.updated).toBe(false);

    const anchoredPrompt = buildMediaGenerationPrompt(
      'photo',
      '咖啡厅落地窗边自拍',
      'mi mi',
      '甜酷灵动',
      'Shoulder-length wavy black hair, oversized knit sweater'
    );
    expect(anchoredPrompt).toContain('Consistent character appearance anchor');
    expect(anchoredPrompt).toContain('Shoulder-length wavy black hair');
  });

  it('splits long replies into natural IM message segments, preserves code blocks, and computes realistic delays', async () => {
    const longSingleParagraph =
      '今天外面下了好大一场雨，我差点就被淋成落汤鸡了！还好路过一家便利店顺手买了把透明雨伞，顺便还带了一杯热美式回来。你那边现在天气怎么样呀？下班路上记得多穿一件外套别着凉了哦！';
    const segments = splitIntoNaturalMessages([longSingleParagraph]);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.length).toBeLessThanOrEqual(4);
    expect(segments.join('')).toContain('便利店');

    const capped = splitIntoNaturalMessages(
      ['第一条消息。', '第二条消息。', '第三条消息。', '第四条消息。', '第五条消息。', '第六条消息。'],
      4
    );
    expect(capped).toHaveLength(4);
    expect(capped[3]).toContain('第五条消息');

    const codeMsg = '给你写好啦：\n```ts\nconst a = 1;\nconst b = 2;\nreturn a + b;\n```\n你直接贴过去运行就行！';
    const codeSegments = splitIntoNaturalMessages([codeMsg]);
    expect(codeSegments).toHaveLength(1);
    expect(codeSegments[0]).toContain('```ts');

    // In Vitest default mode delay returns 0ms; when respectTestEnv=false it scales by length within [750, 2800]
    expect(computeRealisticTypingDelayMs('你好呀', 1)).toBe(0);
    const shortDelay = computeRealisticTypingDelayMs('好呀～', 1, {
      respectTestEnv: false,
      jitter: false,
    });
    const longDelay = computeRealisticTypingDelayMs('x'.repeat(80), 1, {
      respectTestEnv: false,
      jitter: false,
    });
    expect(shortDelay).toBeGreaterThanOrEqual(750);
    expect(longDelay).toBeLessThanOrEqual(2800);
    expect(longDelay).toBeGreaterThan(shortDelay);

    const appendSpy = vi
      .spyOn(storageRepo, 'appendMessages')
      .mockResolvedValue([]);
    const emotionSpy = vi
      .spyOn(storageRepo, 'updateEmotionAndIntimacy')
      .mockResolvedValue(undefined);

    const streamedEvents: StreamEvent[] = [];
    const finalMsg = await executeGrokChatTurn(
      {
        slug: 'lu-xi',
        messages: [{ role: 'user', content: '今天工作累麻了，哄哄我' }],
        mode: 'fun',
        thinkMode: true,
        deepSearch: false,
      },
      (ev) => streamedEvents.push(ev)
    );

    const partEvents = streamedEvents.filter(
      (e): e is Extract<StreamEvent, { type: 'message_part' }> =>
        e.type === 'message_part'
    );
    const doneEvent = streamedEvents.find(
      (e): e is Extract<StreamEvent, { type: 'done' }> => e.type === 'done'
    );

    expect(partEvents.length).toBeGreaterThanOrEqual(2);
    expect(partEvents[0].hasMore).toBe(true);
    expect(partEvents[partEvents.length - 1].hasMore).toBe(false);
    expect(partEvents[partEvents.length - 1].message.id).toBe(finalMsg.id);
    expect(doneEvent?.messages).toHaveLength(partEvents.length);
    // 先存你的消息，再每发出一段存一段（中途切走也不会丢）
    expect(appendSpy).toHaveBeenCalledTimes(1 + partEvents.length);
    expect(appendSpy.mock.calls[0][1][0].role).toBe('user');
    expect(appendSpy.mock.calls.slice(1).map((c) => c[1][0].id)).toEqual(
      partEvents.map((e) => e.message.id)
    );

    appendSpy.mockRestore();
    emotionSpy.mockRestore();
  });
});
