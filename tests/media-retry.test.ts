import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectRecoverableCards,
  enqueueNewMediaCards,
  MEDIA_MAX_AUTO_ATTEMPTS,
  MEDIA_STUCK_AFTER_MS,
  recoverMedia,
  resetGatewayCheckCache,
  runMediaJob,
} from '@/lib/media/media-jobs';
import { describeMediaState, getMediaVisualState, hasPendingMedia } from '@/lib/media/media-state';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage, MediaCard } from '@/lib/storage/types';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** 模拟生图服务：/models 是否在线、/images/* 成功还是失败；返回生图请求次数 */
function mockGateway(opts: { online?: boolean; imageOk?: boolean; delayMs?: number } = {}) {
  const { online = true, imageOk = true, delayMs = 0 } = opts;
  const calls = { images: 0, models: 0 };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.endsWith('/models')) {
      calls.models += 1;
      if (!online) throw new Error('offline');
      return new Response('{"data":[]}', { status: 200 });
    }
    if (u.includes('/images/')) {
      calls.images += 1;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (!imageOk) throw new Error('image gateway down');
      return new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected ${u}`);
  });
  return calls;
}

let seq = 0;
/** 每个用例用自己的临时角色：并行跑的其他测试文件也会改内置角色的聊天记录 */
async function seedChat(card: Partial<MediaCard> = {}, timestamp = new Date().toISOString()) {
  await storageRepo.listPersonas();
  const base = await storageRepo.getPersona('xia-you');
  const slug = `media-retry-${process.pid}-${seq}`;
  await storageRepo.savePersona({ ...base!, slug, name: '补图测试', isPreset: false });
  const id = `media_${Date.now()}_${seq++}`;
  const msg: ConversationMessage = {
    id,
    role: 'assistant',
    content: '给你看',
    timestamp,
    mediaCards: [{ type: 'photo', caption: '窗边的猫', status: 'generating', ...card }],
  };
  const existing = await storageRepo.getConversation(slug, 0);
  await storageRepo.saveConversation(slug, [...existing, msg]);
  return { slug, id };
}
async function cardOf(slug: string, id: string) {
  return (await storageRepo.getConversation(slug, 0)).find((m) => m.id === id)?.mediaCards?.[0];
}

beforeEach(() => resetGatewayCheckCache());
afterEach(() => vi.restoreAllMocks());

describe('卡片状态（页面显示用）', () => {
  it('生成中 / 等网络 / 稍后重试 / 失败 / 已完成', () => {
    expect(getMediaVisualState({ type: 'photo', caption: 'x', status: 'generating' })).toBe('generating');
    expect(getMediaVisualState({ type: 'photo', caption: 'x', status: 'error', waitingForNetwork: true })).toBe('waiting');
    expect(getMediaVisualState({ type: 'photo', caption: 'x', status: 'error', attempts: 1 })).toBe('retrying');
    expect(getMediaVisualState({ type: 'photo', caption: 'x', status: 'error', attempts: 3 })).toBe('failed');
    expect(getMediaVisualState({ type: 'photo', caption: 'x', status: 'ready', imageUrl: '/a.png' })).toBe('ready');
    expect(describeMediaState({ type: 'sticker', caption: 'x', status: 'generating' }, '夏柚')).toBe('夏柚 正在找表情包…');
    expect(hasPendingMedia([{ type: 'photo', caption: 'x', status: 'error', attempts: 3 }])).toBe(false);
    expect(hasPendingMedia([{ type: 'voice', caption: 'x' }])).toBe(false);
  });
});

describe('找出需要补生成的卡片', () => {
  it('卡住超过 2 分钟、到点重试的会补；刚开始的、没到点的、次数用完的不补', () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const later = new Date(now.getTime() + 60_000).toISOString();
    const msg = (id: string, card: Partial<MediaCard>, ts = ago(10 * 60_000)): ConversationMessage => ({
      id,
      role: 'assistant',
      content: '',
      timestamp: ts,
      mediaCards: [{ type: 'photo', caption: 'x', ...card }],
    });
    const got = collectRecoverableCards(
      [
        msg('stuck', { status: 'generating' }),
        msg('fresh', { status: 'generating', lastAttemptAt: ago(10_000) }, ago(10_000)),
        msg('due', { status: 'error', attempts: 1, nextRetryAt: ago(1) }),
        msg('notyet', { status: 'error', attempts: 1, nextRetryAt: later }),
        msg('maxed', { status: 'error', attempts: MEDIA_MAX_AUTO_ATTEMPTS }),
        msg('ready', { status: 'ready', imageUrl: '/a.png' }),
      ],
      now
    );
    expect(got.map((g) => g.messageId)).toEqual(['stuck', 'due']);
    expect(MEDIA_STUCK_AFTER_MS).toBe(120_000);
  });
});

describe('生成任务：重试次数、间隔与去重', () => {
  it('失败记一次并排好下次重试；3 次用完后不再自动试；手动重试能成功', async () => {
    const { slug, id } = await seedChat();
    mockGateway({ imageOk: false });
    const t = { slug, messageId: id, cardIndex: 0 };

    const r1 = await runMediaJob(t);
    expect(r1.card).toMatchObject({ status: 'error', attempts: 1 });
    expect(Date.parse(r1.card!.nextRetryAt!)).toBeGreaterThan(Date.now());
    await runMediaJob(t);
    const r3 = await runMediaJob(t);
    expect(r3.card).toMatchObject({ status: 'error', attempts: 3 });
    expect(r3.card!.nextRetryAt).toBeUndefined();
    expect((await runMediaJob(t)).skipped).toBe('max_attempts');

    vi.restoreAllMocks();
    mockGateway({ imageOk: true });
    const manual = await runMediaJob(t, { manual: true });
    expect(manual.card).toMatchObject({ status: 'ready', attempts: 1 });
    expect((await cardOf(slug, id))?.imageUrl).toBeTruthy();
  });

  it('同一张卡片同时只生成一次（服务端自动开始 + 页面也请求时）', async () => {
    const { slug, id } = await seedChat();
    const calls = mockGateway({ delayMs: 50 });
    const t = { slug, messageId: id, cardIndex: 0 };
    const [a, b] = await Promise.all([runMediaJob(t), runMediaJob(t)]);
    expect(calls.images).toBe(1);
    expect(a.card?.status).toBe('ready');
    expect(b.card?.imageUrl).toBe(a.card?.imageUrl);
  });

  it('一轮回复存好后服务端自己开始生成新卡片', async () => {
    const { slug, id } = await seedChat();
    mockGateway();
    const msg = (await storageRepo.getConversation(slug, 0)).find((m) => m.id === id)!;
    await enqueueNewMediaCards({ slug, messages: [msg] });
    expect((await cardOf(slug, id))?.status).toBe('ready');
  });
});

describe('打开会话时补生成', () => {
  it('生图服务连不上：标记「网络恢复后自动补发」，不消耗重试次数', async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const { slug, id } = await seedChat({ status: 'generating' }, old);
    const calls = mockGateway({ online: false });
    const res = await recoverMedia({ slug, wait: true });
    expect(res.gatewayOnline).toBe(false);
    expect(calls.images).toBe(0);
    const card = await cardOf(slug, id);
    expect(card).toMatchObject({ waitingForNetwork: true });
    expect(card?.attempts || 0).toBe(0);
    expect(getMediaVisualState(card!)).toBe('waiting');
  });

  it('连上之后把卡住的图补出来', async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    const { slug, id } = await seedChat({ status: 'generating', waitingForNetwork: true }, old);
    mockGateway({ online: true });
    const res = await recoverMedia({ slug, wait: true });
    expect(res.gatewayOnline).toBe(true);
    expect(res.queued).toBeGreaterThanOrEqual(1);
    const card = await cardOf(slug, id);
    expect(card).toMatchObject({ status: 'ready' });
    expect(card?.waitingForNetwork).toBeUndefined();
  });

  it('群聊里卡住的图用发图那位成员的形象补，结果写回群聊', async () => {
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const group = await storageRepo.createGroup({ name: '补图群', memberSlugs: subs.slice(0, 2).map((p) => p.slug) });
    await storageRepo.appendGroupMessages(group.id, [
      {
        id: 'g-stuck',
        role: 'assistant',
        content: '',
        timestamp: new Date(Date.now() - 10 * 60_000).toISOString(),
        fromBot: { slug: subs[0].slug, name: subs[0].name },
        mediaCards: [{ type: 'sticker', caption: '捂脸', status: 'generating' }],
      },
    ]);
    mockGateway();
    await recoverMedia({ groupId: group.id, wait: true });
    const saved = (await storageRepo.getGroupConversation(group.id, 0)).find((m) => m.id === 'g-stuck');
    expect(saved?.mediaCards?.[0]).toMatchObject({ status: 'ready' });
  });
});
