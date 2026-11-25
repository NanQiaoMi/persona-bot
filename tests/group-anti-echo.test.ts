import { describe, expect, it } from 'vitest';
import {
  buildGroupAntiEchoDirective,
  collectGroupPeerBubbles,
  collectRoundOpeners,
  stripEchoedOpener,
} from '@/lib/group/director';
import { synthesizeGroupFallbackReply } from '@/lib/group/fallback';
import { executeGroupTurn } from '@/lib/group/group-orchestrator';
import { extractOpener, findEchoedOpener, openerKey } from '@/lib/persona/repetition-guard';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage } from '@/lib/storage/types';

function botMsg(id: string, slug: string, name: string, content: string): ConversationMessage {
  return { id, role: 'assistant', content, timestamp: new Date().toISOString(), fromBot: { slug, name } };
}

describe('buildGroupAntiEchoDirective', () => {
  it('本轮群友用「笑死」开头时，提醒换个开头', () => {
    const directive = buildGroupAntiEchoDirective({
      peers: [{ name: '艾拉', text: '笑死 你这也太离谱了', thisRound: true }],
    });
    expect(directive).toContain('别跟群友撞词');
    expect(directive).toContain('「笑死」');
    expect(directive).toContain('艾拉');
    expect(directive).toContain('换个开头');
  });

  it('没有可撞的开头或口头禅时返回空字符串', () => {
    expect(buildGroupAntiEchoDirective({ peers: [] })).toBe('');
    expect(
      buildGroupAntiEchoDirective({
        peers: [{ name: '艾拉', text: '今天下班路上看到一只特别胖的橘猫', thisRound: true }],
      })
    ).toBe('');
    // @名字 不算起手式
    expect(
      buildGroupAntiEchoDirective({
        peers: [{ name: '陆凛', text: '@艾拉 今天下班路上看到一只特别胖的橘猫', thisRound: true }],
      })
    ).toBe('');
  });

  it('最近消息里反复出现的口头禅也会提醒', () => {
    const directive = buildGroupAntiEchoDirective({
      peers: [
        { name: '艾拉', text: '这家店的菜绝了，下次还去', thisRound: false },
        { name: '陆凛', text: '那个电影也是绝了，强推', thisRound: false },
      ],
    });
    expect(directive).toContain('「绝了」');
  });
});

describe('开头比对与兜底去开头', () => {
  it('笑声长短不同也算同一个起手，「笑死我了」≈「笑死」', () => {
    expect(openerKey('哈哈哈哈')).toBe(openerKey('哈哈'));
    expect(findEchoedOpener('哈哈哈哈 笑死我了', ['哈哈哈'])).toBe('哈哈哈');
    expect(findEchoedOpener('笑死我了 你别说了', ['笑死'])).toBe('笑死');
    expect(findEchoedOpener('确实挺好笑', ['笑死'])).toBeNull();
  });

  it('第一条气泡撞了本轮别人刚用的短开头时去掉它，内容不够时保持原样', () => {
    expect(stripEchoedOpener('笑死，你怎么想到的这个梗', ['笑死'])).toBe('你怎么想到的这个梗');
    expect(stripEchoedOpener('哈哈哈哈 我眼泪都出来了', ['哈哈'])).toBe('我眼泪都出来了');
    // 去掉后只剩一两个字：不动
    expect(stripEchoedOpener('笑死 绝了', ['笑死'])).toBe('笑死 绝了');
    expect(stripEchoedOpener('笑死', ['笑死'])).toBe('笑死');
    // 没撞：不动
    expect(stripEchoedOpener('诶 这也太巧了吧', ['笑死'])).toBe('诶 这也太巧了吧');
  });

  it('只把本轮群友的开头当作兜底依据，自己的话不算', () => {
    const history = [
      botMsg('old1', 'ella', '艾拉', '哈哈 早上好'),
      { id: 'u1', role: 'user', content: '笑死', timestamp: '' } as ConversationMessage,
      botMsg('r1', 'ella', '艾拉', '笑死 你怎么这么会'),
      botMsg('r2', 'lu', '陆凛', '啧 又来'),
    ];
    const peers = collectGroupPeerBubbles(history, 'lu', ['u1', 'r1', 'r2']);
    expect(peers.map((p) => [p.text, p.thisRound])).toEqual([
      ['哈哈 早上好', false],
      ['笑死 你怎么这么会', true],
    ]);
    expect(collectRoundOpeners(peers)).toEqual(['笑死']);
  });
});

describe('离线群聊话术避开本轮已用开头', () => {
  it('笑声话术池里，传入已用开头后挑出的第一条不撞', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const input = {
        speaker: { slug: 'lu', name: '陆凛' },
        triggerText: '哈哈哈哈 笑死',
        triggerSpeakerName: '我（群主）',
        isReaction: false,
        isKickoff: false,
        seed,
      };
      const first = synthesizeGroupFallbackReply(input)[0];
      const opener = extractOpener(first)!;
      const second = synthesizeGroupFallbackReply({ ...input, speaker: { slug: 'ella', name: '艾拉' }, avoidOpeners: [opener] })[0];
      expect(findEchoedOpener(second, [opener])).toBeNull();
    }
  });
});

describe('群聊一轮里不同角色不撞开头（离线）', () => {
  it('用户连发两条好笑的，两个角色第一条气泡的开头不同', async () => {
    const personas = await storageRepo.listPersonas();
    const [a, b] = personas.filter((p) => !p.isMaster && p.slug !== 'master-bot').slice(0, 2);
    expect(a && b).toBeTruthy();

    for (let i = 0; i < 5; i += 1) {
      const group = await storageRepo.createGroup({ name: `笑点群${i}`, memberSlugs: [a.slug, b.slug] });
      const produced = await executeGroupTurn({
        groupId: group.id,
        userTurns: [{ content: '大家快看' }, { content: `哈哈哈哈 笑死我了 ${i}` }],
      });
      const firstBySlug = new Map<string, string>();
      for (const m of produced) {
        const slug = m.fromBot?.slug;
        if (slug && !firstBySlug.has(slug)) firstBySlug.set(slug, m.content);
      }
      expect(firstBySlug.size).toBe(2);
      const [first, second] = [...firstBySlug.values()];
      const opener = extractOpener(first);
      if (opener) expect(findEchoedOpener(second, [opener])).toBeNull();
      expect(second.trim().length).toBeGreaterThan(0);
    }
  });
});
