import { describe, it, expect, vi, afterEach } from 'vitest';
import { distillPersona } from '@/lib/persona/distiller';
import { executeGrokChatTurn } from '@/lib/grok/stream-orchestrator';
import { storageRepo } from '@/lib/storage/repository';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Persona Studio 5-Stage Distillation & End-to-End Stream Turn', () => {
  it('distills a new custom persona from 3-step settings and chat logs without external Python or API key', async () => {
    // 固定网络输入：维基搜索返回一条热搜结果，其余请求一律失败，让联网检索走可预期的路径
    vi.stubGlobal(
      'fetch',
      async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('zh.wikipedia.org')) {
          return new Response(
            JSON.stringify({ query: { search: [{ title: '微博热搜', snippet: '<span>今日</span>热搜榜单' }] } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new TypeError(`fetch disabled in test: ${url}`);
      }
    );

    const sampleChatLog = `2026-05-10 21:00:00 沈清: 笑死，你今天怎么又在熬夜写代码
2026-05-10 21:01:00 我: 马上写完了
2026-05-10 21:02:00 沈清: 不是吧，上次你也这么说，快去睡觉！`;

    const result = await distillPersona({
      name: '沈清测试',
      basicInfo: '认识三年的技术搭子，最爱深夜督促早睡',
      personalityInfo: 'ENTP · 毒舌幽默 · 嘴硬心软',
      chatLogText: sampleChatLog,
      targetSpeaker: '沈清',
      defaultMode: 'fun',
      avatarEmoji: '⚡',
    });

    expect(result.persona.slug).toBe('沈清测试');
    expect(result.persona.personaMd).toContain('Layer 0');
    expect(result.persona.personaMd).toContain('Layer 2');
    expect(result.persona.memoriesMd).toContain('共同记忆');
    expect(result.chatStats?.totalCount).toBe(3);

    // Execute an end-to-end streaming turn with DeepSearch and Think Mode enabled
    const events: string[] = [];
    const replyMsg = await executeGrokChatTurn(
      {
        slug: result.persona.slug,
        messages: [
          {
            role: 'user',
            content: '帮我整理今天的热搜清单？顺便发张你那边的照片看看',
          },
        ],
        mode: 'fun',
        thinkMode: true,
        deepSearch: true,
        requestPhoto: true,
      },
      (ev) => {
        events.push(ev.type);
      }
    );

    expect(events).toContain('search');
    expect(events).toContain('thought');
    expect(events).toContain('emotion');
    expect(events).toContain('reply');
    expect(events).toContain('done');
    expect(replyMsg.thought).toBeTruthy();
    // 搜不到就如实为空，绝不能出现编造的「热度脉搏 / 网友热评」假结果
    for (const item of replyMsg.searchResults || []) {
      expect(['Grok DeepSearch Pulse', 'Social Trend Radar']).not.toContain(item.source);
    }
    expect(replyMsg.pageCard).toBeDefined();
    expect(replyMsg.pageCard?.kind).toBe('search');
    expect(replyMsg.pageCard?.highlights?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(replyMsg.pageCard?.sources?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(replyMsg.pageCard?.metrics.length).toBe(0);

    // Clean up test persona
    await storageRepo.deletePersona('沈清测试');
    // 这条会真的联网检索（维基 / DuckDuckGo），网络慢时会超过默认 5 秒
  }, 20_000);
});
