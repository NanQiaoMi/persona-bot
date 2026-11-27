import { describe, expect, it } from 'vitest';
import { executeGrokChatTurn, scopeHistoryToChannel } from '@/lib/grok/stream-orchestrator';
import { storageRepo } from '@/lib/storage/repository';

/** 复制一个内置角色作为本测试专用角色（关闭主动消息，免得被主动消息测试打扰） */
async function createIsolatedPersona(suffix: string): Promise<string> {
  const personas = (await storageRepo.listPersonas()).filter((p) => p.slug !== 'master-bot' && !p.isMaster);
  const base = await storageRepo.getPersona(personas[0].slug);
  if (!base) throw new Error('no base persona');
  const slug = `iso-test-${suffix}-${Date.now()}`;
  await storageRepo.savePersona({
    ...base,
    slug,
    name: `隔离测试${suffix}`,
    isPreset: false,
    isMaster: false,
    profile: { ...base.profile, allowProactive: false },
  });
  await storageRepo.saveConversation(slug, []);
  return slug;
}

const ts = '2026-11-27T10:00:00.000Z';
const u = (content: string) => ({ role: 'user' as const, content, timestamp: ts });
const a = (content: string) => ({ role: 'assistant' as const, content, timestamp: ts });

describe('scopeHistoryToChannel（纯函数）', () => {
  it('只保留本角色已存过的消息，丢掉外来的，并保持原顺序', () => {
    const messages = [u('a'), a('b'), u('c'), a('d'), u('e')];
    const stored = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'd' },
    ];
    expect(scopeHistoryToChannel(messages, stored)).toEqual([u('a'), a('d'), u('e')]);
  });

  it('末尾连续的用户消息即使没存过也保留', () => {
    const messages = [a('A'), u('x'), u('y')];
    expect(scopeHistoryToChannel(messages, [])).toEqual([u('x'), u('y')]);
  });

  it('空白差异不影响匹配（多个空格视为一个）', () => {
    const messages = [u('你好  呀'), a('外来回复'), u('继续')];
    const stored = [{ role: 'user' as const, content: '你好 呀' }];
    expect(scopeHistoryToChannel(messages, stored)).toEqual([u('你好  呀'), u('继续')]);
  });

  it('角色不同即视为不同消息：存的是用户「在吗」，传入的助手「在吗」要丢掉', () => {
    const stored = [{ role: 'user' as const, content: '在吗' }];
    expect(scopeHistoryToChannel([a('在吗')], stored)).toEqual([]);
    expect(scopeHistoryToChannel([u('在吗'), a('在吗'), a('z')], stored)).toEqual([u('在吗')]);
  });

  it('空输入返回空数组', () => {
    expect(scopeHistoryToChannel([], [])).toEqual([]);
  });
});

describe('executeGrokChatTurn 的角色校验与隔离（隔离数据目录）', () => {
  it('slug 不存在时直接报错，并且不会给 lu-xi 凭空建出会话', async () => {
    const slug = 'no-such-bot-xyz';
    expect(await storageRepo.getPersona(slug)).toBeNull();
    const before = (await storageRepo.getConversation('lu-xi', 0)).length;
    await expect(
      executeGrokChatTurn({
        slug,
        messages: [u('你好')],
        mode: 'authentic',
        thinkMode: false,
        deepSearch: false,
      })
    ).rejects.toThrow('角色不存在');
    expect(await storageRepo.getPersona(slug)).toBeNull();
    expect((await storageRepo.getConversation('lu-xi', 0)).length).toBe(before);
  });

  it('串台场景：别的角色的旧消息不会写进本角色的聊天记录', { timeout: 30_000 }, async () => {
    // 用专门新建的测试角色，避免和其它并行测试文件抢同一个角色的聊天记录
    const slugA = await createIsolatedPersona('scope');
    const previous = await storageRepo.getConversation(slugA, 0);
    const foreignUser = 'FOREIGN-USER-乙角色的旧话题';
    const foreignBot = 'FOREIGN-BOT-乙角色的旧回复';
    const fresh = '新的一句话-隔离测试';
    try {
      // 直接单元断言：外来消息不在 A 的已存记录里，结果只剩末尾这句用户话
      const incoming = [u(foreignUser), a(foreignBot), u(fresh)];
      expect(scopeHistoryToChannel(incoming, previous)).toEqual([u(fresh)]);

      await executeGrokChatTurn({
        slug: slugA,
        messages: incoming,
        mode: 'authentic',
        thinkMode: false,
        deepSearch: false,
      });

      const after = await storageRepo.getConversation(slugA, 0);
      expect(after.some((m) => m.content.includes(fresh))).toBe(true);
      expect(after.some((m) => m.content.includes('FOREIGN-'))).toBe(false);
    } finally {
      await storageRepo.deletePersona(slugA);
    }
  });

  it('skipPersistence 为 true 时不报错，也不写入 A 的聊天记录', { timeout: 30_000 }, async () => {
    // 用专门新建的测试角色，避免和其它并行测试文件抢同一个角色的聊天记录
    const slugA = await createIsolatedPersona('skip');
    const previous = await storageRepo.getConversation(slugA, 0);
    try {
      await expect(
        executeGrokChatTurn({
          slug: slugA,
          messages: [u('FOREIGN-USER-乙角色的旧话题'), a('FOREIGN-BOT-乙角色的旧回复'), u('不落盘的一句')],
          mode: 'authentic',
          thinkMode: false,
          deepSearch: false,
          skipPersistence: true,
        })
      ).resolves.toBeDefined();
      const after = await storageRepo.getConversation(slugA, 0);
      expect(after.length).toBe(previous.length);
      expect(after.some((m) => m.content.includes('不落盘的一句'))).toBe(false);
    } finally {
      await storageRepo.deletePersona(slugA);
    }
  });
});
