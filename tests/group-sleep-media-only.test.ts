import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaOnlyBursts, parseStructuredModelOutput } from '@/lib/grok/stream-orchestrator';
import { addressesEveryone, buildSleepingTip, pickSpeakers } from '@/lib/group/director';
import { executeGroupTurn } from '@/lib/group/group-orchestrator';
import { messagePreviewText } from '@/lib/chat/preview';
import { getPresenceState } from '@/lib/persona/daily-rhythm';
import { storageRepo } from '@/lib/storage/repository';

afterEach(() => vi.restoreAllMocks());

async function pretendModelConfigured() {
  await storageRepo.listPersonas();
  const real = await storageRepo.getSettings();
  vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
    ...real,
    llmApiKey: 'sk-test-sleep-media',
    llmBaseUrl: 'http://127.0.0.1:9/v1',
  });
}

function sse(text: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

describe('只发图、没写字的回复', () => {
  it('解析时不再塞「我在听呢」，留给调用方决定', () => {
    const photo = parseStructuredModelOutput('[PHOTO: 窗边自拍]');
    expect(photo.bursts).toEqual([]);
    expect(photo.cleanReply).toBe('');
    expect(photo.mediaCards[0].type).toBe('photo');
    expect(parseStructuredModelOutput('[STICKER: 捂脸]').bursts).toEqual([]);
    // 什么都没有时仍然兜底
    expect(parseStructuredModelOutput('').bursts).toEqual(['我在听呢，继续说～']);
  });

  it('照片配一句短话，只有表情包不配字', () => {
    const line = mediaOnlyBursts([{ type: 'photo', caption: 'x' }], 'seed');
    expect(line).toHaveLength(1);
    expect(['喏', '刚拍的', '给', '你看', '随手拍的']).toContain(line[0]);
    expect(mediaOnlyBursts([{ type: 'sticker', caption: 'x' }])).toEqual(['']);
    expect(mediaOnlyBursts([])).toEqual(['我在听呢，继续说～']);
  });

  it('列表预览里显示 [照片] / [表情包]', () => {
    expect(messagePreviewText({ content: '', mediaCards: [{ type: 'sticker', caption: 'x' }] })).toBe('[表情包]');
    expect(messagePreviewText({ content: '', mediaCards: [{ type: 'photo', caption: 'x' }] })).toBe('[照片]');
    expect(messagePreviewText({ content: '喏' })).toBe('喏');
  });

  it('群里成员只回了个表情包：发一条不带字的消息挂着表情包，不再用兜底句', async () => {
    await pretendModelConfigured();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => sse('[STICKER: 抱着手机笑出眼泪]'));
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const group = await storageRepo.createGroup({ name: '表情包群', memberSlugs: subs.slice(0, 2).map((p) => p.slug) });
    const produced = await executeGroupTurn({
      groupId: group.id,
      userTurns: [{ content: '哈哈哈' }],
      now: new Date(2026, 10, 25, 15, 0),
      reactionChance: 0,
    });
    const replies = produced.filter((m) => m.fromBot);
    expect(replies.some((m) => /我在听呢/.test(m.content))).toBe(false);
    const withSticker = replies.filter((m) => (m.mediaCards || []).length > 0);
    expect(withSticker).toHaveLength(1);
    expect(withSticker[0].content).toBe('');
    // 图片名额用掉后，别人没字也没图的消息不会发出来
    expect(replies.every((m) => m.content.trim() || (m.mediaCards || []).length > 0)).toBe(true);
  });
});

describe('喊了所有人时，睡着的人', () => {
  const members = [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }, { slug: 'c', name: 'C' }];
  const availability = (slug: string) => (slug === 'a' ? 'free' : 'asleep') as 'free' | 'asleep';

  it('有一个被吵醒一起回；没喊所有人时睡着的人不出声', () => {
    const everyone = pickSpeakers({ text: '你们发自拍来', members, history: [], availabilityOf: availability, random: () => 0.1 });
    expect(everyone.map((m) => m.slug)).toContain('a');
    expect(everyone.filter((m) => m.slug !== 'a')).toHaveLength(1);

    const plain = pickSpeakers({ text: '在干嘛', members, history: [], availabilityOf: availability, random: () => 0.1 });
    expect(plain.map((m) => m.slug)).toEqual(['a']);
  });

  it('识别喊所有人，生成提示文字', () => {
    expect(addressesEveryone('发你们的自拍来')).toBe(true);
    expect(addressesEveryone('鹿汐在吗')).toBe(false);
    expect(buildSleepingTip(['夏柚', 'mi mi'])).toBe('夏柚、mi mi 这个点已经睡了');
    expect(buildSleepingTip([])).toBe('');
  });

  it('深夜喊所有人：没被吵醒的人在群里留一条灰色提示，且近期不重复', async () => {
    await pretendModelConfigured();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => sse('嗯…刚醒'));
    const all = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const now = new Date(2026, 10, 26, 4, 30);
    const asleep = all.filter((p) => getPresenceState(p, now).availability === 'asleep');
    // 至少要有两个睡着的人，才能验证「一个被吵醒、其余留提示」
    expect(asleep.length).toBeGreaterThanOrEqual(2);
    const group = await storageRepo.createGroup({ name: '深夜群', memberSlugs: asleep.slice(0, 3).map((p) => p.slug) });

    const produced = await executeGroupTurn({
      groupId: group.id,
      userTurns: [{ content: '你们发自拍来' }],
      now,
      reactionChance: 0,
    });
    const speakers = new Set(produced.filter((m) => m.fromBot && !m.systemTip).map((m) => m.fromBot!.slug));
    expect(speakers.size).toBeGreaterThanOrEqual(1);
    const silent = asleep.slice(0, 3).filter((p) => !speakers.has(p.slug)).map((p) => p.name);
    const tips = produced.filter((m) => m.systemTip);
    expect(tips.map((t) => t.content)).toEqual([buildSleepingTip(silent)]);

    const again = await executeGroupTurn({ groupId: group.id, userTurns: [{ content: '你们发自拍来' }], now, reactionChance: 0 });
    const silentAgain = asleep.slice(0, 3)
      .filter((p) => !again.some((m) => m.fromBot?.slug === p.slug && !m.systemTip))
      .map((p) => p.name);
    if (buildSleepingTip(silentAgain) === buildSleepingTip(silent)) {
      expect(again.filter((m) => m.systemTip)).toHaveLength(0);
    }
  });
});
