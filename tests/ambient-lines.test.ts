import { describe, expect, it } from 'vitest';
import {
  AMBIENT_FOLLOW_LINES,
  AMBIENT_STARTER_LINES,
  PAT_SUFFIXES,
  QUICK_REACTIONS,
  type AmbientMode,
  type AmbientSeedKind,
} from '@/lib/group/ambient-lines';

const MODES: AmbientMode[] = ['authentic', 'fun', 'companion', 'analytical'];
const KINDS: AmbientSeedKind[] = [
  'activity',
  'moment',
  'topic',
  'tease',
  'callback',
  'daily',
  'ping_owner',
];
const ALLOWED_PLACEHOLDERS = new Set(['activity', 'moment', 'topic', 'name', 'quote']);
const KIND_PLACEHOLDER: Partial<Record<AmbientSeedKind, string>> = {
  activity: 'activity',
  moment: 'moment',
  topic: 'topic',
  tease: 'name',
  callback: 'quote',
};
const FORBIDDEN = ['希望', '帮到你', '为您', '请问', '亲爱的用户', '各位好', '大家好呀'];
const HAN = /\p{Script=Han}/gu;
const EMOJI_ALL = /\p{Extended_Pictographic}/gu;

function placeholdersOf(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}
function stripPlaceholders(s: string): string {
  return s.replace(/\{\w+\}/g, '');
}
function hanCount(s: string): number {
  return (stripPlaceholders(s).match(HAN) ?? []).length;
}
/** Opener key: placeholders removed, the mandatory '@群主 ' prefix ignored. */
function openerKey(s: string): string {
  return stripPlaceholders(s).replace(/^@群主\s*/, '').slice(0, 3);
}
function assertUniqueOpeners(lines: string[]): void {
  const keys = lines.map(openerKey);
  expect(new Set(keys).size).toBe(keys.length);
}

/** Every generated line (starters + follow replies), for pool-wide checks. */
function allLines(): string[] {
  const out: string[] = [];
  for (const mode of MODES) {
    for (const kind of KINDS) out.push(...AMBIENT_STARTER_LINES[mode][kind]);
    out.push(...AMBIENT_FOLLOW_LINES[mode]);
  }
  return out;
}

describe('ambient starter lines', () => {
  it('has at least 6 lines for every mode x seed kind', () => {
    for (const mode of MODES) {
      for (const kind of KINDS) {
        expect(AMBIENT_STARTER_LINES[mode][kind].length, `${mode}/${kind}`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('uses the required placeholder in at least 4 lines per kind', () => {
    for (const mode of MODES) {
      for (const kind of KINDS) {
        const lines = AMBIENT_STARTER_LINES[mode][kind];
        const required = KIND_PLACEHOLDER[kind];
        if (required) {
          const count = lines.filter((l) => placeholdersOf(l).includes(required)).length;
          expect(count, `${mode}/${kind}`).toBeGreaterThanOrEqual(4);
        }
        if (kind === 'daily') {
          for (const l of lines) expect(placeholdersOf(l), `${mode}/daily: ${l}`).toEqual([]);
        }
        if (kind === 'ping_owner') {
          const count = lines.filter((l) => l.startsWith('@群主 ')).length;
          expect(count, `${mode}/ping_owner`).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });
});

describe('ambient follow lines', () => {
  it('has at least 10 lines per mode with at least 3 using {name}', () => {
    for (const mode of MODES) {
      const lines = AMBIENT_FOLLOW_LINES[mode];
      expect(lines.length, mode).toBeGreaterThanOrEqual(10);
      const named = lines.filter((l) => placeholdersOf(l).includes('name')).length;
      expect(named, mode).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('ambient line content rules', () => {
  it('only uses whitelisted placeholders', () => {
    for (const line of allLines()) {
      for (const p of placeholdersOf(line)) {
        expect(ALLOWED_PLACEHOLDERS.has(p), `${p} in: ${line}`).toBe(true);
      }
    }
  });

  it('keeps every line between 4 and 30 Chinese characters after removing placeholders', () => {
    for (const line of allLines()) {
      const n = hanCount(line);
      expect(n, line).toBeGreaterThanOrEqual(4);
      expect(n, line).toBeLessThanOrEqual(30);
    }
  });

  it('contains no forbidden host-like or service phrases', () => {
    for (const line of allLines()) {
      for (const word of FORBIDDEN) expect(line.includes(word), `${word} in: ${line}`).toBe(false);
    }
  });

  it('uses emoji in at most 15% of lines, with at most one per line', () => {
    const lines = allLines();
    let withEmoji = 0;
    for (const line of lines) {
      const count = (line.match(EMOJI_ALL) ?? []).length;
      expect(count, line).toBeLessThanOrEqual(1);
      if (count > 0) withEmoji++;
    }
    expect(withEmoji / lines.length).toBeLessThanOrEqual(0.15);
  });

  it('rarely ends with the full stop 。 (at most 10% of lines)', () => {
    const lines = allLines();
    const count = lines.filter((l) => l.trimEnd().endsWith('。')).length;
    expect(count / lines.length).toBeLessThanOrEqual(0.1);
  });

  it('ends with 你呢 in at most 20% of lines', () => {
    const lines = allLines();
    const count = lines.filter((l) => /你呢[？?！!~～。.\s]*$/.test(l)).length;
    expect(count / lines.length).toBeLessThanOrEqual(0.2);
  });
});

describe('ambient pool variety', () => {
  it('has no two starter lines in the same pool sharing the first 3 characters', () => {
    for (const mode of MODES) {
      for (const kind of KINDS) {
        assertUniqueOpeners(AMBIENT_STARTER_LINES[mode][kind]);
      }
    }
  });

  it('has no two follow lines in the same mode pool sharing the first 3 characters', () => {
    for (const mode of MODES) assertUniqueOpeners(AMBIENT_FOLLOW_LINES[mode]);
  });
});

describe('quick reactions', () => {
  it('has at least 15 unique items, each at most 6 characters', () => {
    expect(QUICK_REACTIONS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(QUICK_REACTIONS).size).toBe(QUICK_REACTIONS.length);
    for (const r of QUICK_REACTIONS) {
      expect([...r].length, r).toBeLessThanOrEqual(6);
      expect(r.length, r).toBeGreaterThan(0);
    }
  });
});

describe('pat suffixes', () => {
  it('has at least 8 unique items, each at most 10 characters, including an empty suffix', () => {
    expect(PAT_SUFFIXES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PAT_SUFFIXES).size).toBe(PAT_SUFFIXES.length);
    for (const s of PAT_SUFFIXES) expect([...s].length, s).toBeLessThanOrEqual(10);
    expect(PAT_SUFFIXES).toContain('');
  });
});
