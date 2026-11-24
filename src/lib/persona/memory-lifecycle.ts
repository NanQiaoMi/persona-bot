import { textSimilarity } from '@/lib/persona/learned';
import { memoryBody } from '@/lib/persona/memory-retrieval';
import { MemoryStat } from '@/lib/persona/spec';

/**
 * 记忆生命周期：按「重要度 + 新近度 + 被想起次数」淘汰（取代先进先出），
 * 过期日程归档到「过往小事」而非直接删除，近义记忆自动合并。
 */
export const AUTO_MEMORY_HEADING = '## 4. 对话自动沉淀的长期记忆';
export const ARCHIVE_HEADING = '## 5. 过往小事（已过期的日程）';
export const AUTO_MEMORY_CAP = 30;
export const ARCHIVE_CAP = 15;
const MERGE_SIMILARITY = 0.6;

export function memoryKey(line: string): string {
  return memoryBody(line).replace(/\s+/g, '').toLowerCase();
}

export function baseImportance(line: string): number {
  if (/个人近况|我叫|名字|过敏|生日|纪念日|家人|工作|里程碑/.test(line)) return 0.8;
  if (/偏好习惯|喜欢|讨厌|不吃|不喝|习惯/.test(line)) return 0.7;
  if (/近期日程/.test(line)) return 0.4;
  return 0.5;
}

function lineDate(line: string): number | undefined {
  const m = line.match(/\[(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\]/);
  if (!m) return undefined;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** 综合保留分：重要度 60% + 新近度 20%（30 天线性衰减）+ 被想起次数 20%（7 天内被想起再 +0.1） */
export function retentionScore(line: string, stat: MemoryStat | undefined, now = Date.now()): number {
  const importance = stat?.importance ?? baseImportance(line);
  const ts = lineDate(line);
  const ageDays = ts ? Math.max(0, (now - ts) / 86_400_000) : 15;
  const recency = Math.max(0, 1 - ageDays / 30);
  const recall = Math.min(1, (stat?.recallCount ?? 0) / 5);
  const lastRecall = stat?.lastRecalledAt ? new Date(stat.lastRecalledAt).getTime() : NaN;
  const recallFresh = Number.isFinite(lastRecall) && now - lastRecall < 7 * 86_400_000 ? 0.1 : 0;
  return importance * 0.6 + recency * 0.2 + recall * 0.2 + recallFresh;
}

interface Section {
  start: number;
  end: number;
  lines: string[];
}

function readSection(md: string, heading: string): Section | null {
  const start = md.indexOf(heading);
  if (start === -1) return null;
  const after = md.slice(start + heading.length);
  const next = after.match(/\n##\s+/);
  const end = next ? start + heading.length + (next.index ?? after.length) : md.length;
  const lines = md
    .slice(start + heading.length, end)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return { start, end, lines };
}

function writeSection(md: string, heading: string, lines: string[]): string {
  const block = lines.length ? `${heading}\n${lines.join('\n')}` : '';
  const sec = readSection(md, heading);
  if (!sec) {
    if (!block) return md;
    const base = md.trimEnd();
    return `${base ? `${base}\n\n` : '# 共同记忆\n\n'}${block}\n`;
  }
  const before = md.slice(0, sec.start).trimEnd();
  const rest = md.slice(sec.end).trimStart();
  return `${[before, block, rest].filter(Boolean).join('\n\n')}\n`;
}

export function getAutoMemoryLines(md: string): string[] {
  return readSection(md || '', AUTO_MEMORY_HEADING)?.lines ?? [];
}

/**
 * 追加一条记忆：精确/近义重复时合并为最新表述并提升重要度；超过上限时淘汰保留分最低的条目
 */
export function addMemoryWithRetention(
  memoriesMd: string,
  fact: string,
  stats: Record<string, MemoryStat> = {},
  options: { dateLabel?: string; now?: number; cap?: number } = {}
): { updated: boolean; memoriesMd: string; stats: Record<string, MemoryStat>; evicted: string[] } {
  const normalizedFact = fact.trim();
  if (!normalizedFact) return { updated: false, memoriesMd, stats, evicted: [] };
  const dateLabel = options.dateLabel ?? new Date().toLocaleDateString('zh-CN');
  const cap = options.cap ?? AUTO_MEMORY_CAP;
  const nextStats = { ...stats };

  const core = memoryBody(normalizedFact);
  if (core.length >= 4 && memoriesMd.includes(core)) {
    return { updated: false, memoriesMd, stats, evicted: [] };
  }

  let lines = getAutoMemoryLines(memoriesMd);
  const entry = `- [${dateLabel}] ${normalizedFact}`;
  const similarIdx = lines.findIndex(
    (l) => textSimilarity(memoryBody(l), core) >= MERGE_SIMILARITY
  );
  if (similarIdx !== -1) {
    const oldKey = memoryKey(lines[similarIdx]);
    const old = nextStats[oldKey];
    delete nextStats[oldKey];
    lines.splice(similarIdx, 1);
    nextStats[memoryKey(entry)] = {
      importance: Math.min(1, (old?.importance ?? baseImportance(entry)) + 0.1),
      recallCount: old?.recallCount ?? 0,
      lastRecalledAt: old?.lastRecalledAt,
    };
  }
  lines.push(entry);

  const evicted: string[] = [];
  if (lines.length > cap) {
    const now = options.now ?? Date.now();
    const ranked = lines
      .map((l, idx) => ({ l, idx, score: retentionScore(l, nextStats[memoryKey(l)], now) }))
      // 刚写入的这条永远不被立刻淘汰
      .filter((r) => r.l !== entry)
      .sort((a, b) => a.score - b.score || a.idx - b.idx);
    const dropCount = lines.length - cap;
    const drop = new Set(ranked.slice(0, dropCount).map((r) => r.l));
    lines = lines.filter((l) => {
      if (drop.has(l)) {
        evicted.push(l);
        delete nextStats[memoryKey(l)];
        return false;
      }
      return true;
    });
  }

  return {
    updated: true,
    memoriesMd: writeSection(memoriesMd || '', AUTO_MEMORY_HEADING, lines),
    stats: nextStats,
    evicted,
  };
}

/**
 * 过期一次性日程（超过 7 天的「明天/今晚…」）移入「过往小事」归档，而不是直接删除
 */
export function archiveExpiredSchedules(
  memoriesMd: string,
  now = new Date()
): { archivedCount: number; memoriesMd: string } {
  const sevenDays = 7 * 86_400_000;
  const md = memoriesMd || '';
  const allLines = md.split('\n');
  const expired: string[] = [];
  const kept = allLines.filter((line) => {
    const t = lineDate(line);
    const isOneOff = /近期日程/.test(line) && /(?:明天|后天|大后天|今晚|今早|待会|这周末)/.test(line);
    if (t !== undefined && isOneOff && now.getTime() - t > sevenDays) {
      expired.push(line.trim());
      return false;
    }
    return true;
  });
  if (expired.length === 0) return { archivedCount: 0, memoriesMd };

  let next = kept.join('\n').replace(/\n{3,}/g, '\n\n');
  const archived = [...(readSection(next, ARCHIVE_HEADING)?.lines ?? []), ...expired.map((l) => l.replace('近期日程', '过往日程'))];
  next = writeSection(next, ARCHIVE_HEADING, archived.slice(-ARCHIVE_CAP));
  return { archivedCount: expired.length, memoriesMd: next };
}

/** 本轮被想起（进入「高相关记忆」区）的条目累加 recallCount */
export function recordRecall(
  stats: Record<string, MemoryStat> = {},
  recalledLines: string[],
  nowIso = new Date().toISOString()
): Record<string, MemoryStat> {
  if (!recalledLines.length) return stats;
  const next = { ...stats };
  for (const line of recalledLines) {
    const key = memoryKey(line);
    const prev = next[key];
    next[key] = {
      importance: prev?.importance ?? baseImportance(line),
      recallCount: (prev?.recallCount ?? 0) + 1,
      lastRecalledAt: nowIso,
    };
  }
  return next;
}
