import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyWorldAction,
  buildWorldDirective,
  extractWorldMentionsByRules,
  findMatchingEntry,
  matchWorldEntriesForCaption,
  mergeWorldMentions,
  WORLD_AUTO_CONFIRM_MENTIONS,
  type WorldMention,
} from '@/lib/persona/world';
import { buildWorldExtractionPrompt, parseWorldMentions, refreshWorld } from '@/lib/persona/world-refresh';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage, WorldState } from '@/lib/storage/types';

const src = (snippet = 'x') => ({ type: 'chat' as const, snippet, at: '2026-11-25T10:00:00.000Z' });
const mention = (name: string, kind: WorldMention['kind'] = 'place', extra: Partial<WorldMention> = {}): WorldMention => ({
  kind,
  name,
  source: src(name),
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe('合并归纳结果', () => {
  it('新东西先进待确认；同一样东西累计到 3 次自动收录', () => {
    let state: WorldState = { entries: [] };
    state = mergeWorldMentions(state, [mention('楼下的咖啡店', 'place', { description: '木头桌子' })]);
    expect(state.entries[0]).toMatchObject({ status: 'candidate', mentionCount: 1 });
    state = mergeWorldMentions(state, [mention('楼下咖啡店')]);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].mentionCount).toBe(2);
    state = mergeWorldMentions(state, [mention('楼下的咖啡店')]);
    expect(state.entries[0].mentionCount).toBe(WORLD_AUTO_CONFIRM_MENTIONS);
    expect(state.entries[0].status).toBe('confirmed');
  });

  it('一次归纳里重复提到只算一次；不同种类不会混在一起', () => {
    let state: WorldState = { entries: [] };
    state = mergeWorldMentions(state, [mention('年糕', 'pet'), mention('年糕', 'pet'), mention('年糕', 'person')]);
    expect(state.entries.find((e) => e.kind === 'pet')?.mentionCount).toBe(1);
    expect(state.entries).toHaveLength(2);
  });

  it('忽略过的只累计、不再回到待确认或自动收录', () => {
    let state = mergeWorldMentions({ entries: [] }, [mention('我的胶片机', 'object')]);
    state = applyWorldAction(state, { id: state.entries[0].id, action: 'dismiss' });
    for (let i = 0; i < 5; i += 1) state = mergeWorldMentions(state, [mention('我的胶片机', 'object')]);
    expect(state.entries[0].status).toBe('dismissed');
  });

  it('关键词重合也算同一样东西；来源最多留 5 条', () => {
    let state = mergeWorldMentions({ entries: [] }, [mention('年糕', 'pet', { keywords: ['橘猫年糕'] })]);
    expect(findMatchingEntry(state.entries, { kind: 'pet', name: '那只橘猫', keywords: ['橘猫年糕'] })).toBeDefined();
    for (let i = 0; i < 8; i += 1) state = mergeWorldMentions(state, [mention('年糕', 'pet')]);
    expect(state.entries[0].sources.length).toBeLessThanOrEqual(5);
  });
});

describe('面板操作', () => {
  it('收录 / 恢复 / 编辑 / 移除', () => {
    let state = mergeWorldMentions({ entries: [] }, [mention('我的房间')]);
    const id = state.entries[0].id;
    state = applyWorldAction(state, { id, action: 'confirm' });
    expect(state.entries[0].status).toBe('confirmed');
    state = applyWorldAction(state, { id, action: 'edit', name: '小阁楼', description: '斜屋顶，窗边有绿萝' });
    expect(state.entries[0]).toMatchObject({ name: '小阁楼', description: '斜屋顶，窗边有绿萝' });
    expect(state.entries[0].keywords).toContain('小阁楼');
    state = applyWorldAction(state, { id, action: 'dismiss' });
    state = applyWorldAction(state, { id, action: 'restore' });
    expect(state.entries[0].status).toBe('candidate');
    state = applyWorldAction(state, { id, action: 'delete' });
    expect(state.entries).toHaveLength(0);
  });
});

describe('聊天与拍照时使用', () => {
  const base = (() => {
    let s = mergeWorldMentions({ entries: [] }, [
      mention('年糕', 'pet', { description: '胖乎乎的橘猫' }),
      mention('我的房间', 'place', { description: '暖黄台灯' }),
      mention('待定的店', 'place'),
    ]);
    s = applyWorldAction(s, { id: s.entries[0].id, action: 'confirm' });
    s = applyWorldAction(s, { id: s.entries[1].id, action: 'confirm' });
    return s;
  })();

  it('提示词只带已收录的，本轮提到的排在前面', () => {
    const d = buildWorldDirective(base.entries, '年糕今天又踩键盘了');
    expect(d).toContain('宠物「年糕」：胖乎乎的橘猫');
    expect(d).not.toContain('待定的店');
    expect(d.indexOf('年糕')).toBeLessThan(d.indexOf('我的房间'));
    expect(buildWorldDirective([], 'x')).toBe('');
  });

  it('拍照描述里出现的已收录设定会被找出来（地点优先）', () => {
    const hits = matchWorldEntriesForCaption(base.entries, '我的房间里年糕趴在台灯下');
    expect(hits.map((e) => e.name)).toEqual(['我的房间', '年糕']);
  });
});

describe('归纳来源', () => {
  it('规则只认明确说法', () => {
    const r = extractWorldMentionsByRules('我家猫叫年糕，今天在我的书桌上睡觉，下班去了楼下的咖啡店', src());
    expect(r.map((m) => [m.kind, m.name])).toEqual(
      expect.arrayContaining([
        ['pet', '年糕'],
        ['place', '我的书桌'],
        ['place', '楼下的咖啡店'],
      ])
    );
    expect(extractWorldMentionsByRules('今天天气不错', src())).toEqual([]);
  });

  it('解析模型返回的 JSON 数组（带代码块也行），过滤无效项', () => {
    const raw = '```json\n[{"kind":"pet","name":"年糕","description":"橘猫"},{"kind":"weird","name":"破相机"},{"kind":"place","name":"x"}]\n```';
    const r = parseWorldMentions(raw, src());
    expect(r.map((m) => [m.kind, m.name])).toEqual([
      ['pet', '年糕'],
      ['object', '破相机'],
    ]);
    expect(parseWorldMentions('没有', src())).toEqual([]);
  });

  it('提示词带上已记录的名字，方便模型沿用同一个名字', () => {
    const p = buildWorldExtractionPrompt({
      personaName: '鹿汐',
      messages: [{ id: '1', role: 'assistant', content: '我的胶片机又卡片了', timestamp: '' }],
      known: ['我的胶片机'],
    });
    expect(p).toContain('已经记录过的：我的胶片机');
    expect(p).toContain('鹿汐：我的胶片机又卡片了');
  });
});

describe('后台归纳（存储联动，离线规则）', () => {
  it('攒够新消息才归纳；归纳后记下位置，下次只看新的', async () => {
    await storageRepo.listPersonas();
    const slug = 'shen-zhi';
    await storageRepo.updateWorld(slug, () => ({ entries: [] }));
    const msgs: ConversationMessage[] = Array.from({ length: 4 }, (_, i) => ({
      id: `w${i}`,
      role: i % 2 ? 'assistant' : 'user',
      content: i % 2 ? '我家猫叫年糕，刚在我的书桌上打了个滚' : '在干嘛',
      timestamp: new Date(2026, 10, 25, 10, i).toISOString(),
    }));
    await storageRepo.saveConversation(slug, msgs);
    expect(await refreshWorld({ slug, personaName: '沈知意', llm: null })).toBeNull();

    const state = await refreshWorld({ slug, personaName: '沈知意', llm: null, force: true });
    expect(state?.entries.map((e) => e.name)).toEqual(expect.arrayContaining(['年糕', '我的书桌']));
    expect(state?.lastExtractedMessageId).toBe('w3');
    expect(state?.entries.find((e) => e.name === '年糕')?.mentionCount).toBe(1);
  });
});

describe('在已收录的地点拍照', () => {
  it('第一张照片成为该地点的参考图，并同步成固定场景资产；之后不再覆盖', async () => {
    const { linkPhotoToWorld, worldAnchorsForCaption } = await import('@/lib/persona/world-refresh');
    await storageRepo.listPersonas();
    const slug = 'chen-ye';
    await storageRepo.updateWorld(slug, () =>
      applyWorldAction(mergeWorldMentions({ entries: [] }, [mention('楼下的咖啡店', 'place', { description: '木桌和绿植' })]), {
        id: '',
        action: 'confirm',
      })
    );
    const id = (await storageRepo.getWorld(slug)).entries[0].id;
    await storageRepo.updateWorld(slug, (s) => applyWorldAction(s, { id, action: 'confirm' }));

    await linkPhotoToWorld({ slug, caption: '在楼下的咖啡店靠窗的位置拍了一杯拿铁', imageUrl: '/generated-media/first.png' });
    let entry = (await storageRepo.getWorld(slug)).entries[0];
    expect(entry.imageUrl).toBe('/generated-media/first.png');
    expect(entry.sceneAssetId).toBeTruthy();
    const assets = await storageRepo.getSceneAssets(slug);
    expect(assets.some((a) => a.id === entry.sceneAssetId && a.category === 'location')).toBe(true);

    await linkPhotoToWorld({ slug, caption: '楼下的咖啡店又来了', imageUrl: '/generated-media/second.png' });
    entry = (await storageRepo.getWorld(slug)).entries[0];
    expect(entry.imageUrl).toBe('/generated-media/first.png');

    expect(await worldAnchorsForCaption(slug, '楼下的咖啡店')).toContain('木桌和绿植');
  });
});
