import type { UserImpression } from '@/lib/persona/spec';

const MAX_HABITS = 6;

function cleanText(val: unknown, minLen: number, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.replace(/[\r\n]+/g, ' ').trim();
  if (trimmed.length < minLen) return undefined;
  return trimmed.slice(0, maxLen);
}

/**
 * 安全合并「TA 眼中的你」（按角色完全隔离，去重、上限 6 条观察习惯）
 */
export function mergeUserImpression(
  current: UserImpression | undefined,
  patch: Partial<UserImpression> | undefined,
  nowIso: string = new Date().toISOString()
): { updated: boolean; impression: UserImpression } {
  const base: UserImpression = {
    nickname: current?.nickname,
    summary: current?.summary,
    observedHabits: Array.isArray(current?.observedHabits) ? [...current.observedHabits] : [],
    recentVibe: current?.recentVibe,
    updatedAt: current?.updatedAt,
  };

  if (!patch || typeof patch !== 'object') {
    return { updated: false, impression: base };
  }

  let updated = false;

  const nextNick = cleanText(patch.nickname, 1, 12);
  if (nextNick && nextNick !== base.nickname) {
    base.nickname = nextNick;
    updated = true;
  }

  const nextSummary = cleanText(patch.summary, 6, 100);
  if (nextSummary && nextSummary !== base.summary) {
    base.summary = nextSummary;
    updated = true;
  }

  const nextVibe = cleanText(patch.recentVibe, 4, 60);
  if (nextVibe && nextVibe !== base.recentVibe) {
    base.recentVibe = nextVibe;
    updated = true;
  }

  if (Array.isArray(patch.observedHabits)) {
    for (const raw of patch.observedHabits) {
      const h = cleanText(raw, 4, 60);
      if (!h) continue;
      const norm = h.replace(/[\s，。,.！!？?]/g, '').toLowerCase();
      const dup = base.observedHabits.some(
        (ex) => ex.replace(/[\s，。,.！!？?]/g, '').toLowerCase() === norm
      );
      if (!dup) {
        base.observedHabits.push(h);
        updated = true;
      }
    }
    if (base.observedHabits.length > MAX_HABITS) {
      base.observedHabits = base.observedHabits.slice(-MAX_HABITS);
    }
  }

  if (updated) {
    base.updatedAt = nowIso;
  }

  return { updated, impression: base };
}

/**
 * 纯 TS 启发式提取近期对话里显现的对方习惯与称呼偏好
 */
export function extractHeuristicUserImpression(
  recentMessages: Array<{ role: string; content: string }>
): Partial<UserImpression> | null {
  const userTexts = recentMessages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (userTexts.length === 0) return null;

  const patch: Partial<UserImpression> = {};
  const habits: string[] = [];

  for (const text of userTexts) {
    const nickMatch = text.match(/(?:以后)?(?:叫我|喊我)[「“"']?([^\s，。！？,.!?"'」”]{1,10})[」”"']?/);
    if (nickMatch && nickMatch[1]) {
      const cleanedNick = nickMatch[1].replace(/(?:就好|就行|吧|呀|啦|哦)+$/, '').trim();
      if (cleanedNick && !/什么|怎么|干嘛/.test(cleanedNick)) {
        patch.nickname = cleanedNick;
      }
    }
    if (/熬夜|两点|三点|失眠|睡不着/.test(text)) {
      habits.push('经常熬夜晚睡，容易睡不着');
    }
    if (/冰美式|美式|拿铁|手冲|咖啡/.test(text)) {
      habits.push('平时爱喝咖啡续命');
    } else if (/奶茶|果茶/.test(text)) {
      habits.push('开心或累的时候喜欢点奶茶');
    }
    if (/加班|赶工|需求|累麻了|压力好大/.test(text)) {
      habits.push('工作忙碌时容易硬扛着累');
    }
  }

  if (habits.length > 0) {
    patch.observedHabits = Array.from(new Set(habits)).slice(0, 3);
  }

  return patch.nickname || patch.observedHabits?.length ? patch : null;
}

export function buildUserImpressionDirective(impression?: UserImpression): string {
  if (!impression) return '';
  const hasContent =
    Boolean(impression.nickname) ||
    Boolean(impression.summary) ||
    Boolean(impression.recentVibe) ||
    (Array.isArray(impression.observedHabits) && impression.observedHabits.length > 0);
  if (!hasContent) return '';

  const lines = ['## TA 眼中的你（只属于你的主观印象，自然记在心里）'];
  if (impression.nickname) {
    lines.push(`- 习惯称呼：顺口时会叫对方「${impression.nickname}」`);
  }
  if (impression.summary) {
    lines.push(`- 总体印象：${impression.summary}`);
  }
  if (impression.observedHabits?.length > 0) {
    lines.push(`- 注意到的习惯/软肋：${impression.observedHabits.join('；')}`);
  }
  if (impression.recentVibe) {
    lines.push(`- 最近相处感受：${impression.recentVibe}`);
  }
  lines.push('- 请把这些印象自然融进你的关心、吐槽或偏爱里，切忌生硬背诵。');
  return lines.join('\n');
}
