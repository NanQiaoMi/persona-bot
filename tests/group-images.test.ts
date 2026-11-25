import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildUpstreamMessages } from '@/lib/grok/stream-orchestrator';
import { executeGroupTurn } from '@/lib/group/group-orchestrator';
import { buildGroupTranscriptForSpeaker } from '@/lib/group/director';
import { storageRepo } from '@/lib/storage/repository';

/** 1x1 透明 PNG */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

afterEach(() => vi.restoreAllMocks());

/** 只在本测试进程里模拟「配置了模型」，不写共享设置文件 */
async function pretendModelConfigured() {
  await storageRepo.listPersonas();
  const real = await storageRepo.getSettings();
  vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
    ...real,
    llmApiKey: 'sk-test-group-images',
    llmBaseUrl: 'http://127.0.0.1:9/v1',
  });
}

function sse(text: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

describe('图片真正发给模型', () => {
  it('只把最近一张图片以多模态形式发送，其余保持文字', async () => {
    const out = await buildUpstreamMessages([
      { role: 'user', content: '旧图', imageUrl: PNG },
      { role: 'assistant', content: '好看' },
      { role: 'user', content: '看这张', imageUrl: PNG },
    ]);
    expect(typeof out[0].content).toBe('string');
    expect(Array.isArray(out[2].content)).toBe(true);
    const parts = out[2].content as Array<{ type: string }>;
    expect(parts.map((p) => p.type)).toEqual(['text', 'image_url']);
  });

  it('没有图片时内容不变', async () => {
    const out = await buildUpstreamMessages([{ role: 'user', content: '你好' }]);
    expect(out).toEqual([{ role: 'user', content: '你好' }]);
  });

  it('群聊记录里的图片在文字里标出来', () => {
    const t = buildGroupTranscriptForSpeaker(
      [{ id: 'u1', role: 'user', content: '[图片]', imageUrl: PNG, timestamp: '' }],
      'xia-you'
    );
    expect(t[t.length - 1].content).toContain('[发了一张图片]');
  });
});

describe('群聊里看图与发图', () => {
  it('群主发图后，回复的成员拿到真实图片；所有人都想发表情包时一轮只保留一张', async () => {
    await pretendModelConfigured();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => sse('哈哈这张好可爱[STICKER: 抱着手机笑出眼泪]'));
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const group = await storageRepo.createGroup({ name: '看图群', memberSlugs: subs.slice(0, 3).map((p) => p.slug) });

    const produced = await executeGroupTurn({
      groupId: group.id,
      userTurns: [{ content: '大家看我家猫', imageUrl: PNG }],
      now: new Date(2026, 10, 25, 20, 0),
      reactionChance: 0,
    });

    // 每次成员生成的请求里都带着图片
    const chatCalls = fetchSpy.mock.calls.filter(([, init]) => String(init?.body || '').includes('"stream":true'));
    expect(chatCalls.length).toBeGreaterThanOrEqual(1);
    for (const [, init] of chatCalls) expect(String(init?.body)).toContain('image_url');

    const withMedia = produced.filter((m) => (m.mediaCards || []).length > 0);
    expect(withMedia).toHaveLength(1);
    expect(withMedia[0].mediaCards![0]).toMatchObject({ type: 'sticker', status: 'generating' });
    const saved = await storageRepo.getGroupConversation(group.id, 0);
    expect(saved.filter((m) => (m.mediaCards || []).length > 0)).toHaveLength(1);
  });
});

describe('生图结果写回群聊', () => {
  it('带 groupId 时把结果写进群聊里的那条消息', async () => {
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const group = await storageRepo.createGroup({ name: '回写群', memberSlugs: subs.slice(0, 2).map((p) => p.slug) });
    await storageRepo.appendGroupMessages(group.id, [
      {
        id: 'gm1',
        role: 'assistant',
        content: '给你们看',
        timestamp: new Date().toISOString(),
        fromBot: { slug: subs[0].slug, name: subs[0].name },
        mediaCards: [{ type: 'photo', caption: '窗边的猫', status: 'generating' }],
      },
    ]);
    // 生图网关不可用：结果是失败卡片，但也要写回群聊那条消息
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { POST } = await import('@/app/api/media/generate/route');
    const res = await POST(
      new Request('http://localhost/api/media/generate', {
        method: 'POST',
        body: JSON.stringify({ slug: subs[0].slug, messageId: 'gm1', cardIndex: 0, kind: 'photo', caption: '窗边的猫', groupId: group.id }),
      })
    );
    const data = await res.json();
    expect(data.success).toBe(true);
    const saved = (await storageRepo.getGroupConversation(group.id, 0)).find((m) => m.id === 'gm1');
    expect(saved?.mediaCards?.[0].status).not.toBe('generating');
  });
});
