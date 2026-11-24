import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProactiveInstruction,
  extractRecentTopic,
  generateProactiveGreeting,
  generateProactiveMessage,
  pickOfflineProactiveLine,
  resolveProactiveSituation,
} from '@/lib/grok/proactive-engine';
import type { LlmConfig } from '@/lib/llm/client';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import type { ConversationMessage, PersonaRecord } from '@/lib/storage/types';

const subs = BUILTIN_PRESETS.filter((p) => !p.isMaster && p.slug !== 'master-bot') as PersonaRecord[];
const llm: LlmConfig = {
  baseUrl: 'http://127.0.0.1:9/v1',
  endpoint: 'http://127.0.0.1:9/v1/chat/completions',
  apiKey: 'test',
  model: 'test-model',
  isLocalGateway: true,
  canCall: true,
};

function m(role: 'user' | 'assistant', content: string): ConversationMessage {
  return { id: content, role, content, timestamp: new Date().toISOString() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('主动消息场景判断', () => {
  it('按轻敲次数、空闲时长和时段区分场景', () => {
    expect(resolveProactiveSituation({ kind: 'idle', nudgeCount: 1 })).toBe('idle_nudge_1');
    expect(resolveProactiveSituation({ kind: 'idle', nudgeCount: 2 })).toBe('idle_nudge_2');
    expect(resolveProactiveSituation({ kind: 'greeting', hoursSinceLastChat: 7, currentHour: 15 })).toBe('long_idle');
    expect(resolveProactiveSituation({ kind: 'greeting', hoursSinceLastChat: 1, currentHour: 2 })).toBe('late_night');
    expect(resolveProactiveSituation({ kind: 'greeting', hoursSinceLastChat: 1, currentHour: 9 })).toBe('morning');
    expect(resolveProactiveSituation({ kind: 'greeting', hoursSinceLastChat: 1, currentHour: 15 })).toBe('afternoon');
    expect(resolveProactiveSituation({ kind: 'greeting', hoursSinceLastChat: 1, currentHour: 20 })).toBe('evening');
  });

  it('提取上次聊到的话题', () => {
    expect(extractRecentTopic([m('user', '我们去楼下那家新开的面馆吧，听说很好吃')])).toBe('我们去楼下那家新开的面馆…');
    expect(extractRecentTopic([m('user', '嗯')])).toBe('');
    expect(extractRecentTopic(undefined)).toBe('');
  });
});

describe('离线兜底不再按角色名写死', () => {
  it('引擎源码里不再出现具体角色 slug', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/lib/grok/proactive-engine.ts'), 'utf-8');
    for (const slug of ['chen-ye', 'xia-you', 'su-nian', 'lu-xi', 'grok-ella']) {
      expect(src).not.toContain(`'${slug}'`);
    }
  });

  it('同一角色同一时段稳定；所有角色都能拿到话术且占位符被填好', () => {
    const now = new Date(2026, 10, 25, 15, 10);
    for (const p of subs) {
      const a = pickOfflineProactiveLine(p, 'afternoon', { now });
      const b = pickOfflineProactiveLine(p, 'afternoon', { now });
      expect(a).toBe(b);
      const greeting = generateProactiveGreeting(p, 9, 15);
      expect(greeting.source).toBe('offline');
      expect(greeting.bursts.length).toBeGreaterThanOrEqual(1);
      expect(greeting.content).not.toMatch(/\{(hours|hour|topic)\}/);
    }
  });

  it('不同角色、不同日子说的不完全一样', () => {
    const lines = new Set<string>();
    for (let day = 20; day < 27; day += 1) {
      for (const p of subs) {
        lines.add(pickOfflineProactiveLine(p, 'evening', { now: new Date(2026, 10, day, 20) }).bursts[0]);
      }
    }
    expect(lines.size).toBeGreaterThan(4);
  });

  it('没有话题可接时不选带 {topic} 的句子', () => {
    for (let h = 0; h < 24; h += 1) {
      for (const p of subs) {
        const line = pickOfflineProactiveLine(p, 'idle_nudge_1', { now: new Date(2026, 10, 25, h) });
        expect(line.bursts.join('')).not.toContain('{topic}');
      }
    }
  });
});

describe('有模型时按人设生成', () => {
  const persona = subs[0];

  it('模型返回内容时使用模型输出（最多 2 条）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '[MOOD: 摸鱼中]刚泡的咖啡烫到舌头了[BURST]你那边忙完没[BURST]第三条不要' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const r = await generateProactiveMessage(
      persona,
      { kind: 'greeting', hoursSinceLastChat: 2, currentHour: 15, recentMessages: [m('user', '下午好困')] },
      llm
    );
    expect(r.source).toBe('llm');
    expect(r.bursts).toEqual(['刚泡的咖啡烫到舌头了', '你那边忙完没']);
    expect(r.moodLabel).toBe('摸鱼中');
    expect(r.modelUsed).toBe('test-model');
  });

  it('模型失败或返回空时回落到离线话术', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const failed = await generateProactiveMessage(persona, { kind: 'idle', nudgeCount: 1 }, llm);
    expect(failed.source).toBe('offline');
    expect(failed.bursts.length).toBeGreaterThan(0);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect((await generateProactiveMessage(persona, { kind: 'greeting' }, llm)).source).toBe('offline');
  });

  it('不可调用模型时直接走离线，不发请求', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const r = await generateProactiveMessage(persona, { kind: 'greeting' }, { ...llm, canCall: false });
    expect(r.source).toBe('offline');
    expect(spy).not.toHaveBeenCalled();
  });

  it('情境说明包含话题与额外情境，并要求不要客服腔', () => {
    const text = buildProactiveInstruction(
      {
        kind: 'idle',
        nudgeCount: 1,
        idleSeconds: 50,
        recentMessages: [m('user', '那家火锅店排队好久')],
        extraContext: ['你此刻在地铁上'],
      },
      'idle_nudge_1'
    );
    expect(text).toContain('那家火锅店排队好久');
    expect(text).toContain('你此刻在地铁上');
    expect(text).toContain('不要客服腔');
  });
});
