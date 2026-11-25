import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/chat/stream/route';
import { GET as getInflightRoute } from '@/app/api/chat/inflight/route';
import { beginInflight, endInflight, getInflight, inflightKey } from '@/lib/chat/inflight';
import { storageRepo } from '@/lib/storage/repository';

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
