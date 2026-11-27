/**
 * 记忆检索：中文友好的相关性打分 + 同义词簇扩展 + memoryStats 重要度重排 + Prompt 长度预算。
 * - 中文连续片段切成 2 字词（权重 1）与单字（权重 0.6，过滤高频虚字）
 * - 英文/数字按单词切分
 * - 命中同义词簇时把同簇兄弟词以折减权重加入查询，提升跨词回忆率（如“失眠”召回“熬夜”）
 * - 结合 memoryStats（importance 与 recallCount）重排，核心事实优先浮现并抗预算裁剪
 */
import type { MemoryStat } from '@/lib/persona/spec';

const CJK_RUN = /[一-鿿]+/g;
const LATIN_WORD = /[a-z0-9][a-z0-9_-]+/gi;

const STOP_CHARS = new Set(
  '我你他她它们的了是在不有吗呢吧啊呀哦嘛就都也还和与及或这那个一只些么什怎很太好要会能想说看去来到得着过又再被把让给对从最已经但如果因为所以而且当然其实刚才些'.split('')
);
const STOP_BIGRAMS = new Set([
  '我们', '你们', '他们', '什么', '一个', '这个', '那个', '就是', '然后', '还是',
  '不是', '没有', '可以', '怎么', '知道', '觉得', '时候', '现在', '今天', '自己',
  '记得', '是不', '一下', '有点', '真的',
]);

export const SYNONYM_CLUSTERS: string[][] = [
  ['失眠', '熬夜', '睡不着', '晚睡', '通宵', '睡眠'],
  ['咖啡', '美式', '冰美式', '拿铁', '手冲', '提神'],
  ['累', '疲惫', '加班', '压力', '崩溃', '撑不住', '赶工'],
  ['旅行', '旅游', '海边', '日落', '晚霞', '拍照', '胶片', '风景'],
  ['美食', '火锅', '烧烤', '夜宵', '外卖', '探店', '好吃'],
  ['游戏', '开黑', '排位', '双排', '副本', '上号'],
  ['电影', '追剧', '歌单', '音乐', '听歌', '散文', '看书'],
  ['开心', '高兴', '兴奋', '满足', '快乐'],
  ['生气', '闹别扭', '委屈', '难过', '吵架', '冷战'],
  ['猫', '橘猫', '小狗', '宠物', '猫咪'],
  ['工作', '周会', '方案', '老板', '面试', '需求'],
  ['考试', '复习', '考研', '自习', '论文', '作业'],
];

export interface WeightedTokens {
  tokens: Map<string, number>;
  size: number;
}

export function tokenizeForRecall(text: string): WeightedTokens {
  const tokens = new Map<string, number>();
  const add = (t: string, w: number) => tokens.set(t, Math.max(tokens.get(t) || 0, w));
  const lower = (text || '').toLowerCase();

  for (const run of lower.match(CJK_RUN) || []) {
    for (let i = 0; i < run.length; i += 1) {
      const ch = run[i];
      if (!STOP_CHARS.has(ch)) add(ch, 0.6);
      if (i + 1 < run.length) {
        const bi = run.slice(i, i + 2);
        if (!STOP_BIGRAMS.has(bi)) add(bi, 1);
      }
    }
  }
  for (const w of lower.match(LATIN_WORD) || []) {
    add(w, 1);
  }
  return { tokens, size: tokens.size };
}

/** 查询词同义词簇扩展（保留原词全权重，兄弟词以 0.55 权重补充召回） */
export function expandQueryWithSynonyms(query: string): WeightedTokens {
  const base = tokenizeForRecall(query);
  const lower = (query || '').toLowerCase();
  if (!lower.trim()) return base;

  const tokens = new Map(base.tokens);
  const addExpanded = (t: string, w: number) =>
    tokens.set(t, Math.max(tokens.get(t) || 0, w));

  for (const cluster of SYNONYM_CLUSTERS) {
    if (!cluster.some((word) => lower.includes(word))) continue;
    for (const sibling of cluster) {
      const sibTokens = tokenizeForRecall(sibling);
      for (const [tok, w] of sibTokens.tokens) {
        addExpanded(tok, w * 0.55);
      }
    }
  }

  return { tokens, size: tokens.size };
}

/** 相关性分数：命中权重之和，按记忆行长度做温和惩罚，避免长行天然占优 */
export function relevanceScore(query: WeightedTokens, line: WeightedTokens): number {
  if (query.size === 0 || line.size === 0) return 0;
  let hit = 0;
  for (const [t, w] of query.tokens) {
    if (line.tokens.has(t)) hit += Math.min(w, line.tokens.get(t) || 0);
  }
  return hit / (1 + line.size / 40);
}

/** 去掉列表符号、日期标签与「偏好习惯：」这类分类前缀，只对记忆正文打分 */
export function memoryBody(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+\.)\s*/, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .replace(/^[^：:\s]{1,8}[：:]\s*/, '')
    .trim();
}

export interface RetrievalOptions {
  topK?: number;
  budgetChars?: number;
  minScore?: number;
  /** 记忆条目的重要度与被想起次数（key 为规范化后的记忆正文） */
  memoryStats?: Record<string, MemoryStat>;
}

export interface MemoryRetrievalResult {
  relevant: string[];
  context: string;
  truncated: boolean;
}

const isHeading = (line: string) => /^\s*#{1,6}\s/.test(line);
const isEntry = (line: string) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line) || line.trim().length > 0;

function statLookupKey(line: string): string {
  return memoryBody(line).replace(/\s+/g, '').toLowerCase();
}

export function retrieveRelevantMemories(
  memoriesMd: string,
  query: string | undefined,
  options: RetrievalOptions = {}
): MemoryRetrievalResult {
  const topK = options.topK ?? 6;
  const budget = options.budgetChars ?? 1500;
  const minScore = options.minScore ?? 0.4;
  const md = (memoriesMd || '').trim();
  if (!md) return { relevant: [], context: '', truncated: false };

  const lines = md.split('\n');
  const q = expandQueryWithSynonyms(query || '');

  const scored = lines.map((line, idx) => {
    const heading = isHeading(line);
    const entry = !heading && isEntry(line);
    const body = !heading && line.trim() ? memoryBody(line) : '';
    const baseScore = body ? relevanceScore(q, tokenizeForRecall(body)) : 0;
    const stat = body ? options.memoryStats?.[statLookupKey(line)] : undefined;
    const importance = stat?.importance ?? 0.5;
    const recallBonus = stat?.recallCount
      ? Math.min(0.25, Math.log1p(stat.recallCount) * 0.08)
      : 0;
    // 只有命中语义相关性时才叠加重要度与召回加成，避免高重要度记忆在无关话题强行抢占
    const score =
      baseScore > 0
        ? baseScore * (1 + (importance - 0.5) * 0.45) + recallBonus
        : 0;

    return {
      idx,
      line,
      heading,
      entry,
      score,
      budgetRank: score + importance * 0.15,
    };
  });

  const relevant = scored
    .filter((s) => s.entry && s.score >= minScore)
    .sort((a, b) => b.score - a.score || b.idx - a.idx)
    .slice(0, topK);
  const relevantIdx = new Set(relevant.map((r) => r.idx));

  let base = md;
  let truncated = false;
  if (md.length > budget) {
    truncated = true;
    // 标题始终保留；条目按 (相关性 + 重要度保护) > 新近度(行号越靠后越新) 贪心装入预算
    const keep = new Set<number>(scored.filter((s) => s.heading).map((s) => s.idx));
    let used = scored.filter((s) => s.heading).reduce((n, s) => n + s.line.length + 1, 0);
    const candidates = scored
      .filter((s) => s.entry && !relevantIdx.has(s.idx))
      .sort((a, b) => b.budgetRank - a.budgetRank || b.idx - a.idx);
    for (const c of candidates) {
      if (used + c.line.length + 1 > budget) continue;
      keep.add(c.idx);
      used += c.line.length + 1;
    }
    base = scored
      .filter((s) => keep.has(s.idx))
      .map((s) => s.line)
      // 去掉因条目被裁剪而变空的标题
      .filter((line, i, arr) => !(isHeading(line) && (i === arr.length - 1 || isHeading(arr[i + 1]))))
      .join('\n');
  }

  const relevantLines = relevant
    .sort((a, b) => a.idx - b.idx)
    .map((r) => r.line.trim());

  const context = relevantLines.length
    ? `### 当前话题触发的高相关记忆\n${relevantLines.join('\n')}\n\n### 记忆底色\n${base}`
    : base;

  return { relevant: relevantLines, context, truncated };
}
