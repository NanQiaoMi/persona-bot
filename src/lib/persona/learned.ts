import {
  inferStyleDimension,
  LearnedItem,
  LearnedKind,
  LearnedSource,
  LearnedStatus,
  newLearnedId,
  normalizeLearnedText,
  PersonaSpec,
} from '@/lib/persona/spec';

/** 2 字片段集合（用于中文语义近似去重） */
function bigrams(text: string): Set<string> {
  const norm = normalizeLearnedText(text);
  const set = new Set<string>();
  for (let i = 0; i < norm.length - 1; i += 1) set.add(norm.slice(i, i + 2));
  if (norm.length === 1) set.add(norm);
  return set;
}

export function textSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export const SIMILARITY_THRESHOLD = 0.55;

export function findSimilarItem(
  items: LearnedItem[],
  kind: LearnedKind,
  text: string,
  threshold = SIMILARITY_THRESHOLD
): LearnedItem | undefined {
  const norm = normalizeLearnedText(text);
  let best: { item: LearnedItem; score: number } | undefined;
  for (const it of items) {
    if (it.kind !== kind) continue;
    const score = normalizeLearnedText(it.text) === norm ? 1 : textSimilarity(it.text, text);
    if (score >= threshold && (!best || score > best.score)) best = { item: it, score };
  }
  return best?.item;
}

export interface LearnedCandidate {
  kind: LearnedKind;
  text: string;
  source: LearnedSource;
  confidence?: number;
  evidenceMsgIds?: string[];
}

export interface MergeLearnedResult {
  spec: PersonaSpec;
  added: LearnedItem[];
  reinforced: LearnedItem[];
}

/**
 * 把候选条目合并进 spec.learned：语义近似的条目只增加印证次数与置信度，不重复堆积；
 * 已被淘汰(retired)的近似条目不会被同一条低置信候选立即复活。
 */
export function mergeLearnedCandidates(
  spec: PersonaSpec,
  candidates: LearnedCandidate[],
  options: { initialStatus?: LearnedStatus; now?: string } = {}
): MergeLearnedResult {
  const now = options.now ?? new Date().toISOString();
  const learned = [...spec.learned];
  const added: LearnedItem[] = [];
  const reinforced: LearnedItem[] = [];

  for (const c of candidates) {
    const text = (c.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 120) continue;
    const similar = findSimilarItem(learned, c.kind, text);
    if (similar) {
      if (similar.status === 'retired') continue;
      const idx = learned.indexOf(similar);
      const updated: LearnedItem = {
        ...similar,
        hitCount: similar.hitCount + 1,
        confidence: Math.min(1, Number((similar.confidence + 0.1).toFixed(2))),
        evidenceMsgIds: Array.from(new Set([...similar.evidenceMsgIds, ...(c.evidenceMsgIds || [])])).slice(-10),
        updatedAt: now,
      };
      learned[idx] = updated;
      if (!reinforced.some((r) => r.id === updated.id)) reinforced.push(updated);
      continue;
    }
    const item: LearnedItem = {
      id: newLearnedId(),
      kind: c.kind,
      text,
      dimension: c.kind === 'style' ? inferStyleDimension(text) : undefined,
      source: c.source,
      evidenceMsgIds: (c.evidenceMsgIds || []).slice(-10),
      confidence: c.confidence ?? (c.source === 'llm' ? 0.6 : 0.5),
      status: options.initialStatus ?? 'active',
      hitCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    learned.push(item);
    added.push(item);
  }

  return { spec: { ...spec, learned }, added, reinforced };
}

export type LearnedAction = 'retire' | 'restore' | 'lock' | 'unlock' | 'edit';

/**
 * 成长日志面板上的手动操作：撤销 / 恢复 / 锁定 / 解锁 / 编辑。
 * 用户亲手改过的条目视为用户意志：编辑后自动锁定，自进化不会再淘汰或覆盖它。
 */
export function applyLearnedAction(
  spec: PersonaSpec,
  id: string,
  action: LearnedAction,
  options: { text?: string; now?: string } = {}
): { spec: PersonaSpec; item: LearnedItem | null; error?: string } {
  const now = options.now ?? new Date().toISOString();
  const idx = spec.learned.findIndex((it) => it.id === id);
  if (idx === -1) return { spec, item: null, error: '条目不存在' };
  const current = spec.learned[idx];
  let next: LearnedItem;

  switch (action) {
    case 'retire':
      next = { ...current, status: 'retired', retiredReason: '你在成长日志里撤销了它', updatedAt: now };
      break;
    case 'restore':
      next = { ...current, status: 'active', retiredReason: undefined, supersedes: undefined, updatedAt: now };
      break;
    case 'lock':
      next = { ...current, status: 'locked', retiredReason: undefined, updatedAt: now };
      break;
    case 'unlock':
      next = { ...current, status: 'active', updatedAt: now };
      break;
    case 'edit': {
      const text = (options.text || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2 || text.length > 160) {
        return { spec, item: null, error: '内容需要 2~160 个字' };
      }
      next = {
        ...current,
        text,
        dimension: current.kind === 'style' ? inferStyleDimension(text) : current.dimension,
        source: 'user-edit',
        status: 'locked',
        confidence: 1,
        retiredReason: undefined,
        updatedAt: now,
      };
      break;
    }
    default:
      return { spec, item: null, error: '不支持的操作' };
  }

  const learned = [...spec.learned];
  learned[idx] = next;
  return { spec: { ...spec, learned }, item: next };
}
