import { describe, expect, it } from 'vitest';
import { detectCreateBotIntent, pickFallbackName, pickMascotFor } from '@/lib/persona/create-intent';

describe('对话里建 Bot 的意图识别', () => {
  it('拆出名字、性格、外貌、颜色', () => {
    const r = detectCreateBotIntent('帮我建一个嘴硬爱撒娇的深夜搭子，叫阿凛，黑长直，紫色的');
    expect(r?.name).toBe('阿凛');
    expect(r?.personality).toBe('嘴硬爱撒娇的深夜搭子');
    expect(r?.appearance).toContain('黑长直');
    expect(r?.color).toBe('#8B5CF6');
  });

  it('「名字叫X」「外貌是X」的说法', () => {
    const r = detectCreateBotIntent('创建个新bot，名字叫小满，性格是温柔话痨，外貌是短发戴眼镜');
    expect(r?.name).toBe('小满');
    expect(r?.personality).toBe('温柔话痨');
    expect(r?.appearance).toBe('短发戴眼镜');
  });

  it('没说名字也能识别，名字留给调用方起', () => {
    const r = detectCreateBotIntent('再捏一个毒舌但护短的角色');
    expect(r).not.toBeNull();
    expect(r?.name).toBeUndefined();
    expect(r?.personality).toBe('毒舌但护短');
  });

  it('群里 @主 bot 的写法也能识别', () => {
    const r = detectCreateBotIntent('@猫咪的bot 帮我建个 bot 叫阿澈，冷面学霸');
    expect(r?.name).toBe('阿澈');
    expect(r?.personality).toBe('冷面学霸');
  });

  it('不是建 Bot 的话不触发', () => {
    expect(detectCreateBotIntent('拉个群聊聊周末去哪玩')).toBeNull();
    expect(detectCreateBotIntent('帮我做个计划')).toBeNull();
    expect(detectCreateBotIntent('建个群叫周末')).toBeNull();
    expect(detectCreateBotIntent('今天好累啊')).toBeNull();
    expect(detectCreateBotIntent('我在做一个网页')).toBeNull();
  });
});

describe('起名与形象', () => {
  it('起名避开已有名字', () => {
    const n = pickFallbackName(['阿凛', '小满'], 0);
    expect(['阿凛', '小满']).not.toContain(n);
  });
  it('同一个名字总是得到同样的形状和颜色，且不是黑/灰', () => {
    const a = pickMascotFor('阿凛');
    expect(pickMascotFor('阿凛')).toEqual(a);
    expect(['#0A0A0C', '#8E8E93']).not.toContain(a.color);
  });
});

describe('对话里真正建出 Bot（离线）', () => {
  it('主 bot 单聊：建好角色并返回新 Bot 卡片，基础性格与外貌写进资料', { timeout: 30_000 }, async () => {
    const { executeMasterBotTurn } = await import('@/lib/grok/master-orchestrator');
    const { storageRepo } = await import('@/lib/storage/repository');
    const reply = await executeMasterBotTurn({
      slug: 'master-bot',
      messages: [{ role: 'user', content: '帮我建一个嘴硬爱撒娇的深夜搭子，叫测试阿凛，黑长直' }],
    });
    expect(reply.botCreated?.name).toBe('测试阿凛');
    const created = await storageRepo.getPersona(reply.botCreated!.slug);
    expect(created?.profile.basicPersonality).toBe('嘴硬爱撒娇的深夜搭子');
    expect(created?.profile.appearanceAnchor).toContain('黑长直');
    expect(reply.content).toContain('测试阿凛');
  });

  it('群里：建好后拉进群，主 bot 留卡片，新成员第一个打招呼', { timeout: 30_000 }, async () => {
    const { executeGroupTurn } = await import('@/lib/group/group-orchestrator');
    const { storageRepo } = await import('@/lib/storage/repository');
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
    const group = await storageRepo.createGroup({ name: '建人测试群', memberSlugs: subs.slice(0, 2).map((p) => p.slug) });
    const produced = await executeGroupTurn({
      groupId: group.id,
      userText: '@猫咪的bot 帮我建个 bot 叫测试阿澈，冷面学霸',
      shouldSkipDelays: () => true,
    });
    const card = produced.find((m) => m.botCreated)?.botCreated;
    expect(card?.name).toBe('测试阿澈');
    expect(card?.joinedGroupId).toBe(group.id);
    const after = await storageRepo.getGroup(group.id);
    expect(after?.memberSlugs).toContain(card!.slug);
    const firstBotReply = produced.find((m) => m.role === 'assistant' && !m.botCreated && !m.systemTip);
    expect(firstBotReply?.fromBot?.slug).toBe(card!.slug);
  });
});

describe('删除角色时移出所在的群', () => {
  it('群成员里不再有被删的角色', { timeout: 30_000 }, async () => {
    const { storageRepo } = await import('@/lib/storage/repository');
    const { createBotFromIntent } = await import('@/lib/persona/chat-create');
    const { persona } = await createBotFromIntent({ name: '测试待删', personality: '路过' });
    const subs = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot' && p.slug !== persona.slug);
    const group = await storageRepo.createGroup({ name: '删人测试群', memberSlugs: [subs[0].slug, persona.slug] });
    await storageRepo.deletePersona(persona.slug);
    const after = await storageRepo.getGroup(group.id);
    expect(after?.memberSlugs).toEqual([subs[0].slug]);
  });
});
