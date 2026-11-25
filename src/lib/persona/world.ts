/**
 * 世界设定（纯函数，无 IO）：
 * - 把一次归纳出的「提到了什么」合并进世界设定：同一样东西累计次数，达到 3 次自动收录
 * - 你在面板上的操作（收录 / 忽略 / 恢复 / 编辑 / 移除）
 * - 聊天时挑出相关的已收录设定写进提示词；拍照时找出画面里出现的设定
 * - 没有模型时的规则归纳（房间、常去的店、宠物、随身物品）
 */
import type {
  WorldEntry,
  WorldEntryKind,
  WorldEntrySource,
  WorldState,
} from '@/lib/storage/types';

export const WORLD_AUTO_CONFIRM_MENTIONS = 3;
const MAX_ENTRIES = 80;
const MAX_SOURCES = 5;

export interface WorldMention {
  kind: WorldEntryKind;
  name: string;
  description?: string;
  keywords?: string[];
  source: WorldEntrySource;
}

export type WorldAction =
  | { id: string; action: 'confirm' | 'dismiss' | 'restore' | 'delete' }
  | { id: string; action: 'edit'; name?: string; description?: string };

function norm(text: string): string {
  // 「楼下的咖啡店」和「楼下咖啡店」是同一个地方：比较时忽略空白、标点和「的」
  return (text || '').toLowerCase().replace(/[\s「」“”"'·、，,。.!！?？的]/g, '');
}

function newId(): string {
  return `world_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 同一种类里，名字相同 / 互相包含，或关键词重合，就认为是同一样东西 */
export function findMatchingEntry(entries: WorldEntry[], mention: Pick<WorldMention, 'kind' | 'name' | 'keywords'>): WorldEntry | undefined {
  const name = norm(mention.name);
  if (!name) return undefined;
  const kws = (mention.keywords || []).map(norm).filter((k) => k.length >= 2);
  return entries.find((e) => {
    if (e.kind !== mention.kind) return false;
    const en = norm(e.name);
    if (en === name || (en.length >= 2 && name.includes(en)) || (name.length >= 2 && en.includes(name))) return true;
    const eks = e.keywords.map(norm).filter((k) => k.length >= 2);
    return kws.some((k) => eks.includes(k) || k === en);
  });
}

/**
 * 合并一次归纳的结果。一次归纳里同一样东西只算一次；
 * 待确认的累计到 3 次自动收录；你忽略过的只累计、不再提示。
 */
export function mergeWorldMentions(state: WorldState, mentions: WorldMention[], now: Date = new Date()): WorldState {
  const nowIso = now.toISOString();
  const entries = state.entries.map((e) => ({ ...e, keywords: [...e.keywords], sources: [...e.sources] }));
  const touched = new Set<string>();

  for (const m of mentions) {
    const name = (m.name || '').trim().slice(0, 20);
    if (name.length < 2) continue;
    const existing = findMatchingEntry(entries, { ...m, name });
    if (existing) {
      if (!touched.has(existing.id)) {
        existing.mentionCount += 1;
        touched.add(existing.id);
      }
      const desc = (m.description || '').trim();
      if (desc && desc.length > existing.description.length) existing.description = desc.slice(0, 120);
      for (const k of m.keywords || []) {
        const kk = k.trim();
        if (kk.length >= 2 && !existing.keywords.includes(kk) && existing.keywords.length < 8) existing.keywords.push(kk);
      }
      existing.sources = [...existing.sources, m.source].slice(-MAX_SOURCES);
      if (existing.status === 'candidate' && existing.mentionCount >= WORLD_AUTO_CONFIRM_MENTIONS) {
        existing.status = 'confirmed';
      }
      existing.updatedAt = nowIso;
      continue;
    }
    const entry: WorldEntry = {
      id: newId(),
      kind: m.kind,
      name,
      description: (m.description || '').trim().slice(0, 120),
      keywords: Array.from(new Set([name, ...(m.keywords || []).map((k) => k.trim())].filter((k) => k.length >= 2))).slice(0, 8),
      status: 'candidate',
      mentionCount: 1,
      sources: [m.source],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    entries.push(entry);
    touched.add(entry.id);
  }

  // 超过上限时优先丢弃提到次数少的待确认 / 已忽略项
  const kept =
    entries.length <= MAX_ENTRIES
      ? entries
      : [...entries]
          .sort((a, b) => {
            const rank = (e: WorldEntry) => (e.status === 'confirmed' ? 2 : e.status === 'candidate' ? 1 : 0);
            return rank(b) - rank(a) || b.mentionCount - a.mentionCount;
          })
          .slice(0, MAX_ENTRIES);
  return { ...state, entries: kept };
}

export function applyWorldAction(state: WorldState, action: WorldAction): WorldState {
  const nowIso = new Date().toISOString();
  if (action.action === 'delete') {
    return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
  }
  return {
    ...state,
    entries: state.entries.map((e) => {
      if (e.id !== action.id) return e;
      if (action.action === 'confirm') return { ...e, status: 'confirmed', updatedAt: nowIso };
      if (action.action === 'dismiss') return { ...e, status: 'dismissed', updatedAt: nowIso };
      if (action.action === 'restore') return { ...e, status: 'candidate', updatedAt: nowIso };
      const edit = action as Extract<WorldAction, { action: 'edit' }>;
      const name = edit.name?.trim().slice(0, 20);
      const description = edit.description?.trim().slice(0, 120);
      return {
        ...e,
        name: name || e.name,
        description: description ?? e.description,
        keywords: name && !e.keywords.includes(name) ? [name, ...e.keywords].slice(0, 8) : e.keywords,
        updatedAt: nowIso,
      };
    }),
  };
}

function mentioned(entry: WorldEntry, text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  return [entry.name, ...entry.keywords].map(norm).some((k) => k.length >= 2 && t.includes(k));
}

const KIND_LABEL: Record<WorldEntryKind, string> = { place: '地点', object: '物品', pet: '宠物', person: '人物' };

/** 聊天提示词里的「你生活里的固定元素」：本轮提到的优先，再补几个最常提到的 */
export function buildWorldDirective(entries: WorldEntry[], text: string, limit = 6): string {
  const confirmed = entries.filter((e) => e.status === 'confirmed');
  if (confirmed.length === 0) return '';
  const hit = confirmed.filter((e) => mentioned(e, text));
  const top = [...confirmed].sort((a, b) => b.mentionCount - a.mentionCount).filter((e) => !hit.includes(e));
  const picked = [...hit, ...top].slice(0, limit);
  return [
    '## 你生活里的固定元素（之前聊天里出现过，说到时保持一致，别改设定）',
    ...picked.map((e) => `- ${KIND_LABEL[e.kind]}「${e.name}」${e.description ? `：${e.description}` : ''}`),
  ].join('\n');
}

/** 拍照时画面描述里出现的已收录设定（地点优先） */
export function matchWorldEntriesForCaption(entries: WorldEntry[], caption: string): WorldEntry[] {
  return entries
    .filter((e) => e.status === 'confirmed' && mentioned(e, caption))
    .sort((a, b) => (a.kind === 'place' ? -1 : 0) - (b.kind === 'place' ? -1 : 0));
}

/** 没有模型时的规则归纳：只认很明确的说法，宁缺毋滥 */
export function extractWorldMentionsByRules(text: string, source: WorldEntrySource): WorldMention[] {
  const out: WorldMention[] = [];
  const t = text || '';
  const push = (kind: WorldEntryKind, name: string, description?: string) => {
    const n = name.trim();
    if (n.length >= 2 && !out.some((o) => o.kind === kind && o.name === n)) {
      out.push({ kind, name: n, description, keywords: [n], source });
    }
  };

  for (const m of t.matchAll(/我(?:家|养)的?(猫|狗|兔子|仓鼠|鹦鹉)(?:叫|名叫)?([一-龥]{2,3})?/g)) {
    if (m[2] && !/的|了|在|也|又|都|很|太|呢|吗|啊/.test(m[2])) push('pet', m[2], `我养的${m[1]}`);
    else push('pet', `我家${m[1]}`, `我养的${m[1]}`);
  }
  for (const m of t.matchAll(/我(?:的|家的?)(房间|卧室|书桌|阳台|工位|小窝|工作室|画室)/g)) {
    push('place', `我的${m[1]}`);
  }
  for (const m of t.matchAll(/(楼下|公司楼下|家附近|常去的|老地方那家)(?:的|那家)?([一-龥]{1,8}?(?:咖啡店|咖啡馆|面馆|书店|酒吧|公园|奶茶店|小店|餐厅|便利店))/g)) {
    push('place', `${m[1].replace(/的$/, '')}的${m[2]}`.replace(/的的/g, '的'));
  }
  for (const m of t.matchAll(/我(?:的|那台|那个|那把)([一-龥]{0,4}(?:胶片机|相机|吉他|机械键盘|键盘|自行车|耳机|画板|保温杯|马克杯))/g)) {
    push('object', `我的${m[1]}`);
  }
  return out.slice(0, 6);
}
