import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildInnerThoughtPrompt,
  cleanInnerThought,
  extractLiveThought,
  synthesizeInnerThought,
} from '@/lib/persona/inner-thought';
import type { LlmConfig } from '@/lib/llm/client';

const llm: LlmConfig = {
  baseUrl: 'http://127.0.0.1:9/v1',
  endpoint: 'http://127.0.0.1:9/v1/chat/completions',
  apiKey: 'test',
  model: 'test-model',
  isLocalGateway: true,
  canCall: true,
};

function mockReply(content: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

afterEach(() => vi.restoreAllMocks());

describe('边生成边取内心戏', () => {
  it('还没写完也能取出已写的部分，写完后标记 closed', () => {
    expect(extractLiveThought('<thought>啧，他又熬夜')).toEqual({ thought: '啧，他又熬夜', closed: false });
    expect(extractLiveThought('<thought>啧，他又熬夜了</thought>你几点睡')).toEqual({
      thought: '啧，他又熬夜了',
      closed: true,
    });
  });

  it('允许前面有一个 [MOOD]；正文中间的 <thought> 不算', () => {
    expect(extractLiveThought('[MOOD: 嘴硬中]<thought>才不想他')?.thought).toBe('才不想他');
    expect(extractLiveThought('你好呀<thought>偷看')).toBeNull();
    expect(extractLiveThought('还没开始')).toBeNull();
  });

  it('半截的结束标签不显示出来', () => {
    expect(extractLiveThought('<thought>想回快点</tho')?.thought).toBe('想回快点');
  });
});

describe('补写内心戏', () => {
  it('清理标签、前缀、引号，最多 3 行', () => {
    expect(cleanInnerThought('<thought>「内心戏：他居然记得我说过的话」</thought>')).toBe('他居然记得我说过的话');
    expect(cleanInnerThought('一\n二\n三\n四')).toBe('一\n二\n三');
  });

  it('提示词带上这轮真实的对话和回复，不要求固定句式', () => {
    const p = buildInnerThoughtPrompt({
      personaName: '夏柚',
      personaBrief: '职业：游戏测试员。',
      recent: [{ role: 'user', content: '今天测出什么离谱 bug 了' }],
      reply: 'NPC 原地抽搐了五秒',
      mood: '想笑',
    });
    expect(p).toContain('今天测出什么离谱 bug 了');
    expect(p).toContain('NPC 原地抽搐了五秒');
    expect(p).toContain('想笑');
  });

  it('模型写出的内心活动会被采用', async () => {
    mockReply('憋笑憋得肩膀都在抖，这个 bug 我能吹一年');
    const t = await synthesizeInnerThought(llm, {
      personaName: '夏柚',
      personaBrief: '',
      recent: [{ role: 'user', content: '讲讲 bug' }],
      reply: 'NPC 抽搐了',
    });
    expect(t).toBe('憋笑憋得肩膀都在抖，这个 bug 我能吹一年');
  });

  it('分析腔、太短或调用失败时返回空（不用模板顶替）', async () => {
    mockReply('根据用户的意图，我应该保持人设');
    expect(await synthesizeInnerThought(llm, { personaName: 'A', personaBrief: '', recent: [], reply: 'x' })).toBe('');
    vi.restoreAllMocks();
    mockReply('嗯');
    expect(await synthesizeInnerThought(llm, { personaName: 'A', personaBrief: '', recent: [], reply: 'x' })).toBe('');
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await synthesizeInnerThought(llm, { personaName: 'A', personaBrief: '', recent: [], reply: 'x' })).toBe('');
    expect(await synthesizeInnerThought({ ...llm, canCall: false }, { personaName: 'A', personaBrief: '', recent: [], reply: 'x' })).toBe('');
  });
});

describe('前端不再有模板话术', () => {
  it('心声面板源码里没有任何写死的内心戏句子', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/components/workspace/ThoughtSearchTrace.tsx'), 'utf-8');
    for (const line of ['一边晃腿一边想怎么回', '手指在发送键上停了半秒', '盯着屏幕偷偷翘嘴角', 'LIVE_WAIT']) {
      expect(src).not.toContain(line);
    }
  });
});

describe('聊天引擎里的内心戏（模拟流式模型）', () => {
  function sseResponse(chunks: string[]) {
    const body = chunks
      .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
      .join('') + 'data: [DONE]\n\n';
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  /** 只在本测试进程里模拟「配置了模型」，不写共享的设置文件（避免影响并行运行的其他测试） */
  async function withKey<T>(fn: () => Promise<T>): Promise<T> {
    const { storageRepo } = await import('@/lib/storage/repository');
    await storageRepo.listPersonas();
    const real = await storageRepo.getSettings();
    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
      ...real,
      llmApiKey: 'sk-test-thought',
      llmBaseUrl: 'http://127.0.0.1:9/v1',
    });
    return fn();
  }

  it('模型写了内心戏：生成过程中就实时推给前端，并存在第一段回复上', async () => {
    const { executeGrokChatTurn } = await import('@/lib/grok/stream-orchestrator');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(['<thought>他居然', '记得我爱吃辣，有点感动', '</thought>', '那今晚吃火锅[BURST]我请'])
    );
    const events: Array<{ type: string; fullThought?: string }> = [];
    const final = await withKey(() =>
      executeGrokChatTurn(
        { slug: 'lu-xi', messages: [{ role: 'user', content: '今晚吃辣的吗' }], thinkMode: true, deepSearch: false, skipPersistence: true },
        (e) => events.push(e as { type: string; fullThought?: string })
      )
    );
    const firstReplyIdx = events.findIndex((e) => e.type === 'reply' || e.type === 'message_part');
    const thoughtIdx = events.findIndex((e) => e.type === 'thought');
    expect(thoughtIdx).toBeGreaterThanOrEqual(0);
    expect(thoughtIdx).toBeLessThan(firstReplyIdx);
    expect(events.filter((e) => e.type === 'thought').some((e) => e.fullThought === '他居然')).toBe(true);
    expect(final.thought).toBe('他居然记得我爱吃辣，有点感动');
  });

  it('模型漏写内心戏：补写一次，用的是这轮的对话', async () => {
    const { executeGrokChatTurn } = await import('@/lib/grok/stream-orchestrator');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(sseResponse(['那今晚吃火锅', '[BURST]我请']));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: '嘴上说随便，其实早就想好去哪家了' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const final = await withKey(() =>
      executeGrokChatTurn(
        { slug: 'lu-xi', messages: [{ role: 'user', content: '今晚吃辣的吗' }], thinkMode: true, deepSearch: false, skipPersistence: true },
        () => {}
      )
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(secondBody.messages[0].content).toContain('今晚吃辣的吗');
    expect(final.thought).toBe('嘴上说随便，其实早就想好去哪家了');
  });
});
