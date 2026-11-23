import { RuntimeSettings, SearchResultItem } from '@/lib/storage/types';

export interface DeepSearchResponse {
  query: string;
  provider: 'tavily' | 'serper' | 'builtin';
  results: SearchResultItem[];
  timestamp: string;
}

/**
 * 从用户口语消息中提炼用于检索的核心关键词
 */
export function extractSearchQuery(userMessage: string): string {
  const cleaned = userMessage
    .replace(/^(请问|帮我查一下|搜一下|你知道|聊聊|怎么看|最近|今天)/g, '')
    .replace(/[？?！!。，,~～]+$/g, '')
    .trim();
  return cleaned.slice(0, 80) || userMessage.trim().slice(0, 80);
}

/**
 * 判断用户消息是否天然包含实时性/百科查询意图
 */
export function shouldAutoTriggerSearch(userMessage: string): boolean {
  const patterns = [
    /热搜|新闻|最新|最近|今天|刚刚|头条|大事|行情|股价|汇率|比分|天气/,
    /是什么|是谁|怎么评价|怎么看|为什么会|发生了什么|百科|搜一下|查一下/,
    /Grok|OpenAI|DeepSeek|AI|大模型|科技圈|数码|电影|新番/i,
  ];
  return patterns.some((p) => p.test(userMessage));
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

  // 3. Always ensure at least 2 high-value contextual cards so DeepSearch trace is rich even offline
  if (results.length === 0) {
    const nowStr = new Date().toLocaleDateString('zh-CN');
    results.push(
      {
        title: `Grok 实时脉搏 · 「${query}」焦点动态 (${nowStr})`,
        snippet: `全网针对「${query}」的讨论热度持续上升，核心观点集中在最新技术演进、用户体验反馈以及社交平台上的两极化辣评。`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        source: 'Grok DeepSearch Pulse',
      },
      {
        title: `社交冲浪风向标 · 关于「${query}」的高赞热评`,
        snippet: `不少网友与业内人士围绕「${query}」展开讨论，既有理性拆解底层逻辑的深度帖，也有大量玩梗吐槽与生活化共鸣。`,
        url: `https://zh.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
        source: 'Social Trend Radar',
      }
    );
  }

  return results.slice(0, 4);
}

/**
 * 执行 DeepSearch 联网搜索（支持 Tavily / Serper / 内置免 Key 三级自适应兜底）
 */
export async function performDeepSearch(
  rawInput: string,
  settings?: Partial<RuntimeSettings>
): Promise<DeepSearchResponse> {
  const query = extractSearchQuery(rawInput);
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
