import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/chat/stream/route';
import { GET as getInflightRoute } from '@/app/api/chat/inflight/route';
import { beginInflight, endInflight, getInflight, inflightKey } from '@/lib/chat/inflight';
import { buildStreamRequestBody, mergePolledMessages } from '@/lib/chat/switch-sync';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage } from '@/lib/storage/types';

afterEach(() => vi.restoreAllMocks());

async function waitUntilIdle(key: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (getInflight(key)) {
    if (Date.now() - start > timeoutMs) throw new Error('turn did not finish');
    await new Promise((r) => setTimeout(r, 20));
  }
}

function streamRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('生成中登记', () => {
  it('只结束自己那一次；超时残留不再报告', () => {
    const key = 'chat:test-inflight';
    const t1 = beginInflight(key, 'A');
    const t2 = beginInflight(key, 'B');
    endInflight(key, t1);
    expect(getInflight(key)?.label).toBe('B');
    endInflight(key, t2);
    expect(getInflight(key)).toBeNull();
    beginInflight(key, 'C');
    expect(getInflight(key, Date.now() + 4 * 60_000)).toBeNull();
    expect(inflightKey({ groupId: 'g1', slug: 'x' })).toBe('group:g1');
  });

  it('查询接口返回是否生成中', async () => {
    const res = await getInflightRoute(new Request('http://localhost/api/chat/inflight?slug=nobody'));
    expect((await res.json()).inflight).toBe(false);
  });
});

describe('中途切走不丢消息', () => {
  it('单聊：读到第一段就断开连接，你的消息和完整回复仍然都存下来', async () => {
    await storageRepo.listPersonas();
    const slug = 'chen-ye';
    await storageRepo.saveConversation(slug, []);
    const ts = new Date().toISOString();
    const res = await POST(
      streamRequest({
        slug,
        messages: [{ role: 'user', content: '我先说一句然后马上切走', timestamp: ts }],
        thinkMode: false,
        deepSearch: false,
      })
    );
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel(); // 模拟你切到别的聊天

    await waitUntilIdle(`chat:${slug}`);
    const saved = await storageRepo.getConversation(slug, 0);
    // 其他测试会并行写同一个角色，只看本测试这一轮：你的消息在，后面跟着这轮的回复
    const idx = saved.findIndex((m) => m.role === 'user' && m.content === '我先说一句然后马上切走');
    expect(idx).toBeGreaterThanOrEqual(0);
    const turnId = saved[idx].id.replace(/_user.*$/, '');
    expect(saved.some((m) => m.role === 'assistant' && m.id.startsWith(`${turnId}_ai`))).toBe(true);
  });

  it('群聊：断开连接后，成员回复照样存进群聊记录', async () => {
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const group = await storageRepo.createGroup({ name: '断线群', memberSlugs: subs.slice(0, 2).map((p) => p.slug) });
    const res = await POST(
      streamRequest({
        slug: 'master-bot',
        groupId: group.id,
        messages: [{ role: 'user', content: '大家看过来', timestamp: new Date().toISOString() }],
      })
    );
    const reader = res.body!.getReader();
    await reader.cancel();

    await waitUntilIdle(`group:${group.id}`);
    const saved = await storageRepo.getGroupConversation(group.id, 0);
    expect(saved[0]).toMatchObject({ role: 'user', content: '大家看过来' });
    expect(saved.some((m) => m.role === 'assistant')).toBe(true);
  });
});

describe('单聊回复清理', () => {
  it('去掉结尾孤立的「】【」和全角括号标签，保留正常的【】用法与【BURST】分条', async () => {
    const { splitLiveBursts } = await import('@/lib/grok/stream-orchestrator');
    expect(splitLiveBursts('明天估计还得继续抓鬼】【。')).toEqual(['明天估计还得继续抓鬼。']);
    expect(splitLiveBursts('好耶【STICKER: 转圈】')).toEqual(['好耶']);
    expect(splitLiveBursts('这是【重点】内容【BURST】第二条')).toEqual(['这是【重点】内容', '第二条']);
  });
});

describe('切走不断流自动生图与切回消息合并', () => {
  it('带拍照请求中途断开连接后，服务端仍完成落盘并自动生图写回', async () => {
    await storageRepo.listPersonas();
    const base = await storageRepo.getPersona('chen-ye');
    const slug = `disconnect-photo-${process.pid}`;
    await storageRepo.savePersona({
      ...base!,
      slug,
      name: '断流生图测试',
      isPreset: false,
      profile: { ...base!.profile, referenceImageUrl: undefined },
    });
    await storageRepo.saveConversation(slug, []);

    const realSettings = await storageRepo.getSettings();
    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
      ...realSettings,
      llmApiKey: 'sk-test-disconnect-photo',
      llmBaseUrl: 'http://127.0.0.1:9/v1',
    });

    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/chat/completions')) {
        return new Response(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: '给你拍了一张[PHOTO: 桌边的咖啡杯]' } }],
          })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      }
      if (u.includes('/images/')) {
        return new Response(JSON.stringify({ data: [{ b64_json: tinyPng }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected ${u}`);
    });

    const res = await POST(
      streamRequest({
        slug,
        messages: [{ role: 'user', content: '发张照片看看', timestamp: new Date().toISOString() }],
        requestPhoto: true,
        thinkMode: false,
        deepSearch: false,
      })
    );
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    await waitUntilIdle(`chat:${slug}`);
    // enqueueNewMediaCards 在 finally 中异步启动，等待它完成写回
    let readyCard: unknown;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const saved = await storageRepo.getConversation(slug, 0);
      const aiWithMedia = saved.find((m) => m.role === 'assistant' && m.mediaCards?.length);
      if (aiWithMedia?.mediaCards?.[0]?.status === 'ready') {
        readyCard = aiWithMedia.mediaCards[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(readyCard).toMatchObject({ type: 'photo', status: 'ready' });
  });

  it('buildStreamRequestBody 与 mergePolledMessages 正确处理防抖载荷和切回合并', () => {
    const u1: ConversationMessage = {
      id: 'u1',
      role: 'user',
      content: '来张自拍',
      timestamp: '2026-11-26T00:00:00.000Z',
    };
    const body = buildStreamRequestBody({
      slug: 'mi-mi',
      groupId: null,
      mode: 'fun',
      thinkMode: true,
      deepSearch: false,
      messages: [u1],
    });
    expect(body).toEqual({
      slug: 'mi-mi',
      groupId: undefined,
      messages: [{ role: 'user', content: '来张自拍', imageUrl: undefined, timestamp: '2026-11-26T00:00:00.000Z' }],
      mode: 'fun',
      thinkMode: true,
      deepSearch: false,
    });

    const a1Pending: ConversationMessage = {
      id: 'a1',
      role: 'assistant',
      content: '给你看',
      timestamp: '2026-11-26T00:00:02.000Z',
      mediaCards: [{ type: 'photo', caption: '自拍', status: 'generating' }],
    };
    const a1Ready: ConversationMessage = {
      ...a1Pending,
      mediaCards: [{ type: 'photo', caption: '自拍', status: 'ready', imageUrl: '/api/media/ok.png' }],
    };
    const a2New: ConversationMessage = {
      id: 'a2',
      role: 'assistant',
      content: '拍好啦',
      timestamp: '2026-11-26T00:00:05.000Z',
    };
    const localUnsaved: ConversationMessage = {
      id: 'u2_local',
      role: 'user',
      content: '刚发出还没落盘的话',
      timestamp: '2026-11-26T00:00:06.000Z',
    };

    // 1. 合入图片 ready 与服务端新增消息，同时保留本地末尾未落盘用户消息
    const merged = mergePolledMessages([u1, a1Pending, localUnsaved], [u1, a1Ready, a2New]);
    expect(merged.map((m) => m.id)).toEqual(['u1', 'a1', 'a2', 'u2_local']);
    expect(merged[1].mediaCards?.[0].status).toBe('ready');

    // 2. 服务端无变化时返回原引用，避免无意义重渲染
    const sameRef = mergePolledMessages(merged, [u1, a1Ready, a2New]);
    expect(sameRef).toBe(merged);

    // 3. 服务端返回空列表时不丢弃本地消息
    expect(mergePolledMessages([u1], [])).toEqual([u1]);
  });
});
