import { describe, it, expect } from 'vitest';
import {
  synthesizeGroupFallbackReply,
  type GroupFallbackInput,
} from '@/lib/group/fallback';
import type { PersonaMode } from '@/lib/storage/types';

function makeInput(overrides: Partial<GroupFallbackInput> & { mode?: PersonaMode } = {}): GroupFallbackInput {
  const { mode, ...rest } = overrides;
  return {
    speaker: { slug: 'xiaoyu', name: '小雨', defaultMode: mode },
    triggerText: '今天大家都干嘛去了',
    triggerSpeakerName: '我（群主）',
    isReaction: false,
    isKickoff: false,
    seed: 1,
    ...rest,
  };
}

const MODES: PersonaMode[] = ['authentic', 'fun', 'companion', 'analytical'];

describe('synthesizeGroupFallbackReply', () => {
  it('returns 1-2 non-empty bubbles', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const mode of MODES) {
        const bubbles = synthesizeGroupFallbackReply(makeInput({ seed, mode }));
        expect(bubbles.length).toBeGreaterThanOrEqual(1);
        expect(bubbles.length).toBeLessThanOrEqual(2);
        for (const b of bubbles) {
          expect(b.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is deterministic for the same input', () => {
    const input = makeInput({ seed: 7, mode: 'fun' });
    expect(synthesizeGroupFallbackReply(input)).toEqual(synthesizeGroupFallbackReply(input));
  });

  it('kickoff with topic contains the topic', () => {
    for (let seed = 0; seed < 20; seed++) {
      const bubbles = synthesizeGroupFallbackReply(
        makeInput({ seed, isKickoff: true, topic: '周末去哪玩', triggerText: '' }),
      );
      expect(bubbles[0]).toContain('周末去哪玩');
    }
  });

  it('kickoff without topic leaves no placeholder behind', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const mode of MODES) {
        const bubbles = synthesizeGroupFallbackReply(
          makeInput({ seed, mode, isKickoff: true, triggerText: '' }),
        );
        for (const b of bubbles) {
          expect(b).not.toContain('{topic}');
          expect(b).not.toContain('{name}');
        }
      }
    }
  });

  it('reaction contains the other speaker first token for some seeds', () => {
    let hits = 0;
    for (let seed = 0; seed <= 20; seed++) {
      const bubbles = synthesizeGroupFallbackReply(
        makeInput({
          seed,
          isReaction: true,
          triggerText: '我觉得这事一定不行',
          triggerSpeakerName: '阿杰 测试',
        }),
      );
      if (bubbles.some((b) => b.includes('阿杰'))) hits++;
      for (const b of bubbles) {
        expect(b).not.toContain('{name}');
        expect(b).not.toContain('测试');
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('different modes give different outputs for the same seed', () => {
    const outputs = MODES.map((mode) =>
      synthesizeGroupFallbackReply(makeInput({ seed: 3, mode })).join('|'),
    );
    expect(new Set(outputs).size).toBeGreaterThan(1);
  });

  it('never uses AI-assistant phrases', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const mode of MODES) {
        const variants = [
          makeInput({ seed, mode }),
          makeInput({ seed, mode, triggerText: '这个怎么办？' }),
          makeInput({ seed, mode, triggerText: '哈哈哈笑死' }),
          makeInput({ seed, mode, isReaction: true, triggerSpeakerName: '阿杰' }),
          makeInput({ seed, mode, isKickoff: true, topic: '露营', triggerText: '' }),
          makeInput({ seed, mode, isKickoff: true, triggerText: '' }),
        ];
        for (const input of variants) {
          for (const b of synthesizeGroupFallbackReply(input)) {
            expect(b).not.toContain('希望');
            expect(b).not.toContain('帮到你');
          }
        }
      }
    }
  });
});
