import type { RuntimeSettings, SearchResultItem } from '@/lib/storage/types';
import { chatCompletion, parseJsonFromLlmOutput, resolveLlmConfig } from '@/lib/llm/client';
import type { DeepSearchResponse } from './deep-search';

/** 搜索总结卡片的结构化内容 */
export interface SearchDigestHighlight {
  title: string;
  detail: string;
  /** 引用的来源编号（从 1 开始，对应 digestSources 的顺序） */
  sources: number[];
}

export interface SearchDigest {
  title: string;
  lede: string;
  highlights: SearchDigestHighlight[];
  /** 'model'：模型整理；'rules'：规则兜底 */
  method: 'model' | 'rules';
}

const MAX_HIGHLIGHTS = 5;

/** 卡片要列出的来源：只要带链接的真实网页，去掉「联网搜索摘要」这种汇总条目 */
export function digestSources(results: SearchResultItem[]): SearchResultItem[] {
  return results.filter((r) => Boolean(r.url));
}

function clip(text: string, max: number): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * 把用户的提问整理成短标题：去掉「帮我联网整理一下」「用你的性格锐评一下」这类请求措辞。
 * 例：「帮我联网整理一下今天全网最值得聊的科技圈热搜清单，用你的性格锐评一下」→「今天全网最值得聊的科技圈热搜清单」
 */
export function cleanTopicTitle(userMessage: string): string {
  let t = (userMessage || '').trim();
  t = t.split(/[，,。；;！!\n]/)[0] || t;
  t = t
    .replace(/^(请|麻烦)?(你)?(帮我|给我|替我)?(联网|上网)?(搜一下|搜搜|查一下|查查|整理一下|整理|盘点一下|盘点|总结一下|总结|看看|找找|讲讲|说说|聊聊)?/, '')
    .replace(/^(一下|下)/, '')
    .replace(/[？?]+$/, '')
    .trim();
  return clip(t || userMessage.trim(), 24);
}

/** 从网关摘要里拆出列表项作为要点（规则兜底用） */
function extractListItems(answer: string): string[] {
  const items: string[] = [];
  for (const raw of (answer || '').split('\n')) {
    const line = raw.trim();
    const m = line.match(/^(?:\d{1,2}[.、)）]|[-•·*])\s*(.+)$/);
    if (!m) continue;
    const text = m[1].trim();
    // 跳过「类型：xx」「上映：xx」这类附属字段，只要条目本身
    if (/^[一-龥A-Za-z]{1,4}[：:]/.test(text) && text.length < 30) continue;
    if (text.length < 4) continue;
    items.push(text);
  }
  return items;
}

/** 规则兜底：模型不可用或整理失败时，从摘要和来源里拼出要点 */
export function heuristicDigest(searchResp: DeepSearchResponse, userMessage: string): SearchDigest {
  const sources = digestSources(searchResp.results);
  const answer = searchResp.answer || searchResp.results.find((r) => !r.url)?.snippet || '';
  const firstSentence = (answer.split(/(?<=[。！？!?])\s*|\n/).find((s) => s.trim().length >= 8) || '').trim();

  let highlights: SearchDigestHighlight[] = extractListItems(answer)
    .slice(0, MAX_HIGHLIGHTS)
    .map((text) => {
      const [head, ...rest] = text.split(/[：:—–-]\s*/);
      const hasSplit = rest.length > 0 && head.length <= 24;
      return {
        title: clip(hasSplit ? head : text, 24),
        detail: hasSplit ? clip(rest.join('：'), 70) : '',
        sources: [],
      };
    });

  if (highlights.length < 2) {
    highlights = sources.slice(0, MAX_HIGHLIGHTS).map((s, i) => ({
      title: clip(s.title, 28),
      detail: clip(s.snippet, 70),
      sources: [i + 1],
    }));
  }

  return {
    title: cleanTopicTitle(userMessage),
    lede: clip(firstSentence, 70),
    highlights,
    method: 'rules',
  };
}

interface RawDigest {
  title?: unknown;
  lede?: unknown;
  highlights?: unknown;
}

/** 校验并规整模型返回的 JSON；不合格返回 null */
export function normalizeModelDigest(raw: RawDigest | null, sourceCount: number): SearchDigest | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? clip(raw.title, 24) : '';
  const lede = typeof raw.lede === 'string' ? clip(raw.lede, 80) : '';
  if (!title || !Array.isArray(raw.highlights)) return null;
  const highlights: SearchDigestHighlight[] = [];
  for (const h of raw.highlights) {
    if (!h || typeof h !== 'object') continue;
    const item = h as Record<string, unknown>;
    const hTitle = typeof item.title === 'string' ? clip(item.title, 28) : '';
    if (!hTitle) continue;
    const detail = typeof item.detail === 'string' ? clip(item.detail, 80) : '';
    const refs = Array.isArray(item.sources) ? item.sources : [];
    const sources = [...new Set(refs.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= sourceCount))];
    highlights.push({ title: hTitle, detail, sources });
    if (highlights.length >= MAX_HIGHLIGHTS) break;
  }
  if (highlights.length === 0) return null;
  return { title, lede, highlights, method: 'model' };
}

function buildDigestPrompt(searchResp: DeepSearchResponse, userMessage: string): string {
  const sources = digestSources(searchResp.results);
  const sourceLines = sources
    .map((s, i) => `[${i + 1}] ${s.title}（${s.source}）${s.snippet ? `：${clip(s.snippet, 160)}` : ''}`)
    .join('\n');
  const answer = clip(searchResp.answer || searchResp.results.find((r) => !r.url)?.snippet || '', 3000);
  return [
    `用户的问题：${userMessage.trim().slice(0, 200)}`,
    '',
    '搜索摘要：',
    answer || '（无）',
    '',
    '来源列表：',
    sourceLines || '（无）',
  ].join('\n');
}

const DIGEST_SYSTEM_PROMPT = `你是资讯编辑，把联网搜索结果整理成一张简洁的资讯卡片。
要求：
- 只依据给出的搜索摘要和来源，不编造任何事实、数字或日期。
- title：概括这次搜索的主题，不超过 16 个字，不要照抄用户的请求措辞（如「帮我整理一下」）。
- lede：一句话导语，说清最重要的结论，不超过 50 个字。
- highlights：3–5 条要点，按重要性排序；每条 title 不超过 18 个字，detail 用一句话补充关键信息，不超过 50 个字；sources 填支撑这条要点的来源编号（来源列表里的方括号数字），找不到对应来源就填空数组。
- 用简体中文，语气客观，不加表情。
只输出 JSON：{"title":"","lede":"","highlights":[{"title":"","detail":"","sources":[1]}]}`;

/**
 * 生成搜索总结：优先让模型整理（约 3–8 秒），模型不可用 / 超时 / 输出不合格时退回规则兜底。
 */
export async function buildSearchDigest(
  searchResp: DeepSearchResponse,
  userMessage: string,
  settings: Partial<RuntimeSettings>,
  options: { timeoutMs?: number } = {}
): Promise<SearchDigest> {
  const fallback = () => heuristicDigest(searchResp, userMessage);
  const config = resolveLlmConfig(settings);
  if (!config.canCall) return fallback();
  try {
    const raw = await chatCompletion(
      config,
      [
        { role: 'system', content: DIGEST_SYSTEM_PROMPT },
        { role: 'user', content: buildDigestPrompt(searchResp, userMessage) },
      ],
      { temperature: 0.3, timeoutMs: options.timeoutMs ?? 20_000 }
    );
    const digest = normalizeModelDigest(
      parseJsonFromLlmOutput<RawDigest>(raw),
      digestSources(searchResp.results).length
    );
    return digest || fallback();
  } catch {
    return fallback();
  }
}
