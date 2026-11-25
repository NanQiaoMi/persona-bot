import { describe, expect, it } from 'vitest';
import { PROACTIVE_LINES } from '@/lib/grok/proactive-lines';
import type { ProactiveLine, ProactiveSituation } from '@/lib/grok/proactive-types';
import type { PersonaMode } from '@/lib/storage/types';

const MODES: PersonaMode[] = ['authentic', 'fun', 'companion', 'analytical'];
const SITUATIONS: ProactiveSituation[] = [
  'long_idle',
  'late_night',
  'morning',
  'afternoon',
  'evening',
  'idle_nudge_1',
  'idle_nudge_2',
];
const PLACEHOLDER_WHITELIST = ['hours', 'hour', 'topic'];
const PLACEHOLDER_RE = /\{(\w+)\}/g;
const FORBIDDEN_PHRASES = ['希望', '帮到你', '为您', '请问', '亲爱的用户', '随时为你服务'];
const NEEDY_PHRASES = ['为什么不理我', '怎么不回我', '你怎么不理'];
const EMOJI_G = /\p{Extended_Pictographic}/gu;
const NI_NE_ENDING = /你呢[？?]?\s*$/;

interface Entry {
  id: string;
  mode: PersonaMode;
  situation: ProactiveSituation;
  line: ProactiveLine;
}

const len = (s: string): number => [...s].length;
const firstChars = (s: string, n: number): string => [...s].slice(0, n).join('');
const countMatches = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

function allEntries(): Entry[] {
  const out: Entry[] = [];
  for (const mode of MODES) {
    for (const situation of SITUATIONS) {
      const pool = PROACTIVE_LINES[mode][situation] ?? [];
      pool.forEach((line, i) => {
        out.push({ id: `${mode}/${situation}#${i}`, mode, situation, line });
      });
    }
  }
  return out;
}

function allText(line: ProactiveLine): string {
  return [line.thought, line.mood, ...line.bursts].join('\n');
}

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
}

describe('PROACTIVE_LINES 离线主动话术', () => {
  it('每个 mode × situation 至少 5 条，总量不少于 140 条', () => {
    const short: string[] = [];
    for (const mode of MODES) {
      for (const situation of SITUATIONS) {
        const pool = PROACTIVE_LINES[mode]?.[situation];
        if (!Array.isArray(pool) || pool.length < 5) {
          short.push(`${mode}/${situation}: ${pool?.length ?? 0}`);
        }
      }
    }
    expect(short).toEqual([]);
    expect(allEntries().length).toBeGreaterThanOrEqual(140);
  });

  it('bursts 为 1~2 条，每条 4~28 个字符', () => {
    const violations: string[] = [];
    for (const { id, line } of allEntries()) {
      if (line.bursts.length < 1 || line.bursts.length > 2) {
        violations.push(`${id}: bursts 条数 ${line.bursts.length}`);
      }
      for (const burst of line.bursts) {
        const n = len(burst);
        if (n < 4 || n > 28) violations.push(`${id}: burst 长度 ${n} -> ${burst}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('thought 为 8~40 个字符的一句内心话', () => {
    const violations: string[] = [];
    for (const { id, line } of allEntries()) {
      const n = len(line.thought);
      if (n < 8 || n > 40) violations.push(`${id}: thought 长度 ${n} -> ${line.thought}`);
    }
    expect(violations).toEqual([]);
  });

  it('mood 去掉 emoji 后为 2~8 个字符，且最多 1 个 emoji', () => {
    const violations: string[] = [];
    for (const { id, line } of allEntries()) {
      const plain = line.mood.replace(EMOJI_G, '').trim();
      const n = len(plain);
      if (n < 2 || n > 8) violations.push(`${id}: mood 长度 ${n} -> ${line.mood}`);
      if (countMatches(line.mood, EMOJI_G) > 1) violations.push(`${id}: mood 多个 emoji`);
    }
    expect(violations).toEqual([]);
  });

  it('每条话术最多 1 个 emoji，且含 emoji 的条目不超过 20%', () => {
    const entries = allEntries();
    const perLine: string[] = [];
    let withEmoji = 0;
    for (const { id, line } of entries) {
      const count = countMatches(allText(line), EMOJI_G);
      if (count > 1) perLine.push(`${id}: ${count} 个 emoji`);
      if (count > 0) withEmoji += 1;
    }
    expect(perLine).toEqual([]);
    expect(withEmoji / entries.length).toBeLessThanOrEqual(0.2);
  });

  it('不出现禁用的客服腔与索取式措辞', () => {
    const violations: string[] = [];
    for (const { id, line } of allEntries()) {
      const text = allText(line);
      for (const phrase of [...FORBIDDEN_PHRASES, ...NEEDY_PHRASES]) {
        if (text.includes(phrase)) violations.push(`${id}: 含 "${phrase}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('大多数 burst 不以句号结尾（句号占比不超过 20%）', () => {
    let total = 0;
    let withPeriod = 0;
    for (const { line } of allEntries()) {
      for (const burst of line.bursts) {
        total += 1;
        if (burst.trim().endsWith('。')) withPeriod += 1;
      }
    }
    expect(withPeriod / total).toBeLessThanOrEqual(0.2);
  });

  it('占位符只能是 {hours} / {hour} / {topic}，且没有残留的花括号', () => {
    const violations: string[] = [];
    for (const { id, line } of allEntries()) {
      const text = allText(line);
      for (const name of placeholdersIn(text)) {
        if (!PLACEHOLDER_WHITELIST.includes(name)) violations.push(`${id}: 未知占位符 {${name}}`);
      }
      const stripped = text.replace(PLACEHOLDER_RE, '');
      if (/[{}]/.test(stripped)) violations.push(`${id}: 残留花括号`);
    }
    expect(violations).toEqual([]);
  });

  it('占位符只出现在对应场景：{hours} 限 long_idle，{hour} 限 late_night，{topic} 限 idle_nudge_1', () => {
    const violations: string[] = [];
    const allowed: Record<string, ProactiveSituation> = {
      hours: 'long_idle',
      hour: 'late_night',
      topic: 'idle_nudge_1',
    };
    for (const { id, situation, line } of allEntries()) {
      for (const name of placeholdersIn(allText(line))) {
        if (allowed[name] !== situation) violations.push(`${id}: {${name}} 不应出现在 ${situation}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('{hours} 约占 long_idle 的一半，{topic} 约占 idle_nudge_1 的一半，{hour} 每组至少 1 条 late_night', () => {
    const problems: string[] = [];
    for (const mode of MODES) {
      const longIdle = PROACTIVE_LINES[mode].long_idle;
      const withHours = longIdle.filter((l) => allText(l).includes('{hours}')).length;
      if (withHours / longIdle.length < 0.3 || withHours / longIdle.length > 0.7) {
        problems.push(`${mode}/long_idle {hours} 占比 ${withHours}/${longIdle.length}`);
      }
      const nudge = PROACTIVE_LINES[mode].idle_nudge_1;
      const withTopic = nudge.filter((l) => allText(l).includes('{topic}')).length;
      if (withTopic / nudge.length < 0.3 || withTopic / nudge.length > 0.7) {
        problems.push(`${mode}/idle_nudge_1 {topic} 占比 ${withTopic}/${nudge.length}`);
      }
      const late = PROACTIVE_LINES[mode].late_night;
      const withHour = late.filter((l) => allText(l).includes('{hour}')).length;
      if (withHour < 1) problems.push(`${mode}/late_night 没有 {hour}`);
    }
    expect(problems).toEqual([]);
  });

  it('同一 mode + situation 内，第一条 burst 的前 4 个字符互不相同', () => {
    const duplicates: string[] = [];
    for (const mode of MODES) {
      for (const situation of SITUATIONS) {
        const prefixes = PROACTIVE_LINES[mode][situation].map((l) => firstChars(l.bursts[0], 4));
        const dup = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
        if (dup.length > 0) duplicates.push(`${mode}/${situation}: ${dup.join(', ')}`);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('以「你呢？」结尾的条目不超过 30%', () => {
    const entries = allEntries();
    const hits = entries.filter(({ line }) => {
      const last = line.bursts[line.bursts.length - 1].trim();
      return NI_NE_ENDING.test(last);
    }).length;
    expect(hits / entries.length).toBeLessThanOrEqual(0.3);
  });

  it('pleasureDelta 在 [-0.1, 0.15]，intimacyChange 在 [0, 3]（若有设置）', () => {
    const violations: string[] = [];
    for (const { id, line } of allEntries()) {
      if (line.pleasureDelta !== undefined) {
        const p = line.pleasureDelta;
        if (typeof p !== 'number' || p < -0.1 || p > 0.15) violations.push(`${id}: pleasureDelta=${p}`);
      }
      if (line.intimacyChange !== undefined) {
        const i = line.intimacyChange;
        if (typeof i !== 'number' || i < 0 || i > 3) violations.push(`${id}: intimacyChange=${i}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
