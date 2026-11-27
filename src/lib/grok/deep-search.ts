import { RuntimeSettings, SearchResultItem } from '@/lib/storage/types';
import { chatCompletion, resolveLlmConfig } from '@/lib/llm/client';

export interface DeepSearchResponse {
  query: string;
  provider: 'gateway' | 'tavily' | 'serper' | 'builtin';
  results: SearchResultItem[];
  timestamp: string;
  /** 网关搜索返回的完整摘要（已清洗，最长 4000 字），供后续整理要点用；其它搜索方式没有 */
  answer?: string;
}

/**
 * 从用户口语消息中提炼用于检索的核心关键词
 */
export function extractSearchQuery(userMessage: string): string {
  const cleaned = userMessage
    .replace(/^(请问|帮我查一下|帮我搜一下|搜一下|查一下|你知道|聊聊|怎么看)/g, '')
    .replace(/[？?！!。，,~～]+$/g, '')
    .trim();
  return cleaned.slice(0, 80) || userMessage.trim().slice(0, 80);
}

export type SearchIntent = 'yes' | 'no' | 'maybe';

/**
 * 用规则给消息分三类（自动联网用）：
 * - 'no'：太短的寒暄（少于 4 个字，如「咋啦」）、问「你 / 我」本人的（「你是谁」「我该不该辞职」）、没有任何疑问意味的；
 * - 'yes'：明确的查询动作（搜一下、帮我查）或明确的实时线索（热搜、新闻、行情、天气、比分、汇率、最新发布…）；
 * - 'maybe'：像在问外面的事（带「吗 / 什么 / 多少 / 谁 / 哪 / 什么时候 / 原理」等），但规则拿不准，交给模型判断。
 */
export function classifySearchIntent(userMessage: string): SearchIntent {
  // 「你知道 / 你听说过 / 你了解…吗」其实是在问外面的事，去掉这个开头再判断
  const text = (userMessage || '').trim().replace(/^你(知道|听说过?|了解|晓得)(一下)?/, '');
  if (text.replace(/[\s\p{P}\p{S}]/gu, '').length < 4) return 'no';
  if (/(搜一下|搜搜|查一下|查查|帮我(搜|查)|联网|上网查|百度一下|谷歌一下)/.test(text)) return 'yes';
  if (/^(你|我)|(你|我)(是谁|是什么|在干嘛|在做什么|怎么样|觉得)/.test(text)) return 'no';
  const realtime = [
    /热搜|新闻|头条|快讯|大事件?|发生了什么|出什么事/,
    /行情|股价|汇率|币价|油价|金价|比分|赛果|天气|气温|台风|地震/,
    /(最新|最近|今天|今日|昨天|昨晚|本周|这周|刚刚).{0,8}(消息|动态|发布|上映|新品|政策|新闻|热点|热门|进展|版本|比赛|赛季)/,
    /(发布会|上市|开售|上映|官宣|更新了什么)/,
    /(得了多少分|多少分|赢了吗|输了吗|换多少(人民币|美元|日元|欧元|港币))/,
  ];
  if (realtime.some((p) => p.test(text))) return 'yes';
  if (
    /[吗么？?]$|吗[？?。！!]?$|什么|多少|几[个点号月年天岁]|哪[个里儿些年]|是谁|谁是|怎么样|如何|为什么|是不是|有没有|原理|结果|什么时候|叫啥|知道.{0,12}吗/.test(
      text
    )
  ) {
    return 'maybe';
  }
  return 'no';
}

/** 规则判断「明确要搜」（兼容旧调用） */
export function shouldAutoTriggerSearch(userMessage: string): boolean {
  return classifySearchIntent(userMessage) === 'yes';
}

const SEARCH_INTENT_SYSTEM_PROMPT = `判断用户发给聊天伙伴的这句话，是否需要联网查询实时信息或外部事实才能准确回答。
需要：新闻时事、比赛结果、价格汇率、天气、产品发布、作品信息（专辑、电影、游戏版本）、人物近况、科普知识等事实性问题。
不需要：闲聊寒暄、情绪倾诉、观点讨论、请求陪伴或建议、关于聊天双方自己的问题、角色扮演。
只输出 yes 或 no。`;

/**
 * 自动联网的最终判断：规则明确的直接给结论；拿不准的（'maybe'）再问模型（实测网关约 4–5 秒，限时 8 秒）。
 * 模型不可用、超时或回答看不懂时按「不搜」处理。
 */
export async function decideAutoSearch(
  userMessage: string,
  settings: Partial<RuntimeSettings>,
  options: { timeoutMs?: number; onAskModel?: () => void } = {}
): Promise<{ search: boolean; via: 'rules' | 'model' }> {
  const intent = classifySearchIntent(userMessage);
  if (intent !== 'maybe') return { search: intent === 'yes', via: 'rules' };
  const config = resolveLlmConfig(settings);
  if (!config.canCall) return { search: false, via: 'rules' };
  options.onAskModel?.();
  try {
    const raw = await chatCompletion(
      config,
      [
        { role: 'system', content: SEARCH_INTENT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage.trim().slice(0, 300) },
      ],
      { temperature: 0, timeoutMs: options.timeoutMs ?? 8_000 }
    );
    const answer = raw.trim().toLowerCase();
    const search = /^(yes|是|需要)/.test(answer);
    return { search, via: 'model' };
  } catch {
    return { search: false, via: 'model' };
  }
}

/** 模型网关联网搜索的超时：网关背后是真实网页搜索，实测 15–30 秒不等 */
export const GATEWAY_SEARCH_TIMEOUT_MS = 40_000;
const GATEWAY_CACHE_TTL_MS = 5 * 60_000;
const GATEWAY_CACHE_MAX = 50;
interface GatewaySearchOutcome {
  results: SearchResultItem[];
  answer: string;
}
const gatewayCache = new Map<string, { at: number; outcome: GatewaySearchOutcome }>();

/** 搜索接口地址：优先用设置里填的；没填就用模型网关地址 + /search（如 http://127.0.0.1:8000/v1/search） */
export function resolveGatewaySearchUrl(settings?: Partial<RuntimeSettings>): string {
  const explicit = (settings?.searchGatewayUrl || '').trim();
  if (explicit) return explicit;
  const base = (settings?.llmBaseUrl || '').trim().replace(/\/+$/, '');
  return base ? `${base}/search` : '';
}

/** 去掉网关答案里夹带的界面标记（<box>、<AsyncImage …/> 等）、Markdown 标题 / 表格 / 加粗和多余空白 */
export function cleanGatewayAnswer(answer: string): string {
  return String(answer || '')
    // <Entity value="电影名" …/> 这类标签里装着正文（片名、人名），先把 value 取出来
    .replace(/<Entity\b[^>]*?\bvalue="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<[^>]*\/>/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*\|\s*|\s*\|\s*$/gm, '')
    .replace(/\s*\|\s*/g, '：')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

interface GatewaySearchPayload {
  answer?: string;
  sources?: Array<{ title?: string; url?: string; snippet?: string }>;
}

/** 把网关 /v1/search 的返回（answer + sources）整理成搜索结果卡片：第一张是摘要，后面是来源 */
export function mapGatewaySearchResult(data: GatewaySearchPayload): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  const answer = cleanGatewayAnswer(data.answer || '');
  if (answer) {
    results.push({ title: '联网搜索摘要', snippet: answer.slice(0, 600), source: '联网搜索' });
  }
  for (const src of data.sources || []) {
    if (!src?.url) continue;
    const url = stripTrackingParams(src.url);
    const host = hostOf(url);
    results.push({
      title: (src.title || '').trim() || host || url,
      snippet: (src.snippet || '').trim().slice(0, 220),
      url,
      source: host || '网页',
    });
    if (results.length >= 6) break;
  }
  return results;
}

async function searchWithGateway(
  rawInput: string,
  settings?: Partial<RuntimeSettings>
): Promise<GatewaySearchOutcome> {
  const url = resolveGatewaySearchUrl(settings);
  if (!url) throw new Error('Gateway search URL not configured');
  const prompt = rawInput.trim().slice(0, 200);
  const cacheKey = `${url}|${prompt}`;
  const cached = gatewayCache.get(cacheKey);
  if (cached && Date.now() - cached.at < GATEWAY_CACHE_TTL_MS) return cached.outcome;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = (settings?.llmApiKey || '').trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(GATEWAY_SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gateway search status ${res.status}`);
  const payload = (await res.json()) as GatewaySearchPayload;
  const outcome: GatewaySearchOutcome = {
    results: mapGatewaySearchResult(payload),
    answer: cleanGatewayAnswer(payload.answer || '').slice(0, 4000),
  };
  if (outcome.results.length > 0) {
    if (gatewayCache.size >= GATEWAY_CACHE_MAX) {
      const oldest = gatewayCache.keys().next().value;
      if (oldest !== undefined) gatewayCache.delete(oldest);
    }
    gatewayCache.set(cacheKey, { at: Date.now(), outcome });
  }
  return outcome;
}

/** 仅供测试：清空网关搜索缓存 */
export function clearGatewaySearchCache(): void {
  gatewayCache.clear();
}

async function searchWithTavily(query: string, apiKey: string): Promise<SearchResultItem[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 4,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Tavily status ${res.status}`);
  const data = await res.json();
  return (data.results || []).slice(0, 4).map((item: { title?: string; content?: string; url?: string }) => ({
    title: item.title || query,
    snippet: (item.content || '').slice(0, 220),
    url: item.url,
    source: 'Tavily Live',
  }));
}

async function searchWithSerper(query: string, apiKey: string): Promise<SearchResultItem[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: 4 }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Serper status ${res.status}`);
  const data = await res.json();
  return (data.organic || []).slice(0, 4).map((item: { title?: string; snippet?: string; link?: string }) => ({
    title: item.title || query,
    snippet: (item.snippet || '').slice(0, 220),
    url: item.link,
    source: 'Serper Search',
  }));
}

async function searchBuiltinFree(query: string): Promise<SearchResultItem[]> {
  const results: SearchResultItem[] = [];

  // 1. Try Wikipedia Chinese API (Fast, free, zero API key required)
  try {
    const wikiUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&utf8=&format=json&origin=*&srlimit=3`;
    const res = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'PersonaBot-GrokEdition/2.0' },
      signal: AbortSignal.timeout(2800),
    });
    if (res.ok) {
      const data = await res.json();
      const hits = data?.query?.search || [];
      for (const hit of hits) {
        const cleanSnippet = String(hit.snippet || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .trim();
        if (hit.title && cleanSnippet) {
          results.push({
            title: String(hit.title),
            snippet: cleanSnippet,
            url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(String(hit.title))}`,
            source: 'Wikipedia 实时知识库',
          });
        }
      }
    }
  } catch {
    // Ignore network timeout in restricted/offline CI environments
  }

  // 2. Try DuckDuckGo Instant Answer API
  if (results.length < 2) {
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query
      )}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(ddgUrl, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.AbstractText) {
          results.push({
            title: data.Heading || query,
            snippet: String(data.AbstractText).slice(0, 220),
            url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            source: 'DuckDuckGo Instant',
          });
        }
      }
    } catch {
      // Fallback below
    }
  }

  // 都没结果就如实返回空：不再编造「热度上升」「网友热评」之类的假结果交给模型
  return results.slice(0, 4);
}

/**
 * 执行 DeepSearch 联网搜索：模型网关搜索 → Tavily → Serper → 维基百科 / DuckDuckGo，逐级兜底；全部失败时返回空结果
 */
export async function performDeepSearch(
  rawInput: string,
  settings?: Partial<RuntimeSettings>
): Promise<DeepSearchResponse> {
  const query = extractSearchQuery(rawInput);

  if (settings?.searchProvider === 'gateway') {
    try {
      const { results, answer } = await searchWithGateway(rawInput, settings);
      if (results.length > 0) {
        return {
          query: rawInput.trim().slice(0, 80),
          provider: 'gateway',
          results,
          answer,
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // 网关没开、超时或报错：退回下面的方式
    }
  }

  const tavilyKey = settings?.tavilyApiKey || process.env.TAVILY_API_KEY || '';
  const serperKey = settings?.serperApiKey || process.env.SERPER_API_KEY || '';

  if ((settings?.searchProvider === 'tavily' || (!settings?.searchProvider && tavilyKey)) && tavilyKey) {
    try {
      const results = await searchWithTavily(query, tavilyKey);
      if (results.length > 0) {
        return { query, provider: 'tavily', results, timestamp: new Date().toISOString() };
      }
    } catch {
      // Fall through to builtin
    }
  }

  if ((settings?.searchProvider === 'serper' || (!settings?.searchProvider && serperKey)) && serperKey) {
    try {
      const results = await searchWithSerper(query, serperKey);
      if (results.length > 0) {
        return { query, provider: 'serper', results, timestamp: new Date().toISOString() };
      }
    } catch {
      // Fall through to builtin
    }
  }

  const results = await searchBuiltinFree(query);
  return {
    query,
    provider: 'builtin',
    results,
    timestamp: new Date().toISOString(),
  };
}

export function formatSearchContextForPrompt(searchResp?: DeepSearchResponse | null): string {
  if (!searchResp || searchResp.results.length === 0) return '';
  const lines = searchResp.results.map(
    (item, idx) => `${idx + 1}. 【${item.title}】(${item.source}): ${item.snippet}`
  );
  return `## 🌐 DeepSearch 实时联网检索结果（查询词：「${searchResp.query}」）
以下是你刚刚在手机/电脑上顺手刷到的实时信息：
${lines.join('\n')}

**表达铁律**：
- 必须把上述信息消化后，用**你自己的性格、情绪和口头禅**自然聊出来（比如“我刚刷到…”、“笑死，刚看了一眼…”）。
- 严禁像新闻播音员或 AI 助手一样罗列 1. 2. 3. 或照抄原文摘要！`;
}
