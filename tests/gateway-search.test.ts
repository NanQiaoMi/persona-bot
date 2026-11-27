import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GATEWAY_SEARCH_TIMEOUT_MS,
  cleanGatewayAnswer,
  clearGatewaySearchCache,
  extractSearchQuery,
  mapGatewaySearchResult,
  performDeepSearch,
  resolveGatewaySearchUrl,
} from '@/lib/grok/deep-search';
import type { RuntimeSettings } from '@/lib/storage/types';

/** 构造一个最小的 fetch Response 替身（只用到 ok / status / json） */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

type FetchInit = RequestInit & { headers: Record<string, string> };

function gatewaySettings(extra: Partial<RuntimeSettings> = {}): Partial<RuntimeSettings> {
  const settings: Partial<RuntimeSettings> = {
    searchProvider: 'gateway',
    llmBaseUrl: 'http://gw.test/v1',
    llmApiKey: 'k',
    tavilyApiKey: '',
    serperApiKey: '',
    ...extra,
  };
  return settings;
}

const gatewayPayload = {
  answer: '今天的新闻摘要',
  sources: [{ title: '新闻标题', url: 'https://www.example.com/news?utm_source=x&id=1', snippet: '正文片段' }],
};

beforeEach(() => {
  clearGatewaySearchCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveGatewaySearchUrl', () => {
  it('优先使用显式配置的 searchGatewayUrl', () => {
    const settings: Partial<RuntimeSettings> = {
      searchGatewayUrl: 'http://search.test/custom',
      llmBaseUrl: 'http://127.0.0.1:8000/v1/',
    };
    expect(resolveGatewaySearchUrl(settings)).toBe('http://search.test/custom');
  });

  it('未配置时用 llmBaseUrl + /search，并去掉末尾斜杠', () => {
    const settings: Partial<RuntimeSettings> = { llmBaseUrl: 'http://127.0.0.1:8000/v1/' };
    expect(resolveGatewaySearchUrl(settings)).toBe('http://127.0.0.1:8000/v1/search');
  });

  it('两者都没配置时返回空字符串', () => {
    expect(resolveGatewaySearchUrl({})).toBe('');
    expect(resolveGatewaySearchUrl(undefined)).toBe('');
  });
});

describe('cleanGatewayAnswer', () => {
  it('去掉自闭合标签（如 AsyncImage）', () => {
    const input = '前文\n<AsyncImage query="x" aspectRatio="5:4"/>\n后文';
    expect(cleanGatewayAnswer(input)).toBe('前文\n后文');
  });

  it('去掉成对标签但保留内部文字', () => {
    expect(cleanGatewayAnswer('<box gap={3}>内容</box>')).toBe('内容');
    expect(cleanGatewayAnswer('<row align=start>文字</row>')).toBe('文字');
  });

  it('去掉 markdown 图片', () => {
    expect(cleanGatewayAnswer('see ![cat](http://x/a.png) here')).toBe('see here');
  });

  it('把连续空行压成单个换行', () => {
    expect(cleanGatewayAnswer('a\n\n\n\nb')).toBe('a\nb');
  });
});

describe('mapGatewaySearchResult', () => {
  it('第一项是摘要，且摘要不超过 600 字', () => {
    const results = mapGatewaySearchResult({ answer: '字'.repeat(1000) });
    expect(results[0]).toMatchObject({ title: '联网搜索摘要', source: '联网搜索' });
    expect(results[0].snippet.length).toBeLessThanOrEqual(600);
  });

  it('来源映射为标题、去掉 utm 参数、source 为去掉 www 的域名', () => {
    const results = mapGatewaySearchResult(gatewayPayload);
    expect(results[1]).toMatchObject({
      title: '新闻标题',
      snippet: '正文片段',
      source: 'example.com',
    });
    expect(results[1].url).not.toContain('utm_source');
    expect(results[1].url).toContain('id=1');
  });

  it('标题为空时回退为域名', () => {
    const results = mapGatewaySearchResult({
      answer: '',
      sources: [{ title: '   ', url: 'https://www.foo.org/page' }],
    });
    expect(results[0].title).toBe('foo.org');
  });

  it('没有 url 的来源被跳过', () => {
    const results = mapGatewaySearchResult({
      answer: '',
      sources: [{ title: '无链接' }, { title: '有链接', url: 'https://a.test/x' }],
    });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('有链接');
  });

  it('总数最多 6 项（含摘要）', () => {
    const sources = Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, url: `https://s${i}.test/` }));
    const results = mapGatewaySearchResult({ answer: '摘要', sources });
    expect(results).toHaveLength(6);
  });

  it('答案为空时不生成摘要项', () => {
    const results = mapGatewaySearchResult({ answer: '   ', sources: [{ title: 'A', url: 'https://a.test/' }] });
    expect(results.some((r) => r.title === '联网搜索摘要')).toBe(false);
    expect(results).toHaveLength(1);
  });
});

describe('performDeepSearch via gateway', () => {
  it('向 /search 发起 POST，携带原始文本与 Bearer 鉴权，并返回 gateway 结果', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayPayload));
    vi.stubGlobal('fetch', fetchMock);

    const resp = await performDeepSearch('  最近有什么新闻？  ', gatewaySettings());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, FetchInit];
    expect(url).toBe('http://gw.test/v1/search');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(String(init.body))).toEqual({ prompt: '最近有什么新闻？' });
    expect(init.signal).toBeDefined();
    expect(GATEWAY_SEARCH_TIMEOUT_MS).toBe(40000);

    expect(resp.provider).toBe('gateway');
    expect(resp.results[0].title).toBe('联网搜索摘要');
    expect(resp.results[1]).toMatchObject({ title: '新闻标题', source: 'example.com' });
  });

  it('llmApiKey 为空时不带 Authorization 头', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayPayload));
    vi.stubGlobal('fetch', fetchMock);

    await performDeepSearch('最近新闻', gatewaySettings({ llmApiKey: '' }));

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, FetchInit];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('TTL 内相同请求命中缓存，不同文本重新请求', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(gatewayPayload));
    vi.stubGlobal('fetch', fetchMock);

    await performDeepSearch('最近新闻A', gatewaySettings());
    await performDeepSearch('最近新闻A', gatewaySettings());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await performDeepSearch('最近新闻B', gatewaySettings());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('网关请求 reject 时回退到 builtin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith('http://gw.test')) throw new Error('gateway down');
        if (url.includes('zh.wikipedia.org')) {
          return jsonResponse({ query: { search: [{ title: '测试词条', snippet: '<span>片段</span>' }] } });
        }
        if (url.includes('duckduckgo.com')) return jsonResponse({});
        throw new Error(`unexpected url ${url}`);
      })
    );

    const resp = await performDeepSearch('是什么测试', gatewaySettings());

    expect(resp.provider).toBe('builtin');
    expect(resp.results.some((r) => r.title === '测试词条' && r.snippet === '片段')).toBe(true);
  });

  it('网关返回 500 时回退到 builtin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith('http://gw.test')) return jsonResponse({ error: 'boom' }, 500);
        if (url.includes('zh.wikipedia.org')) {
          return jsonResponse({ query: { search: [{ title: '测试词条', snippet: '<span>片段</span>' }] } });
        }
        if (url.includes('duckduckgo.com')) return jsonResponse({});
        throw new Error(`unexpected url ${url}`);
      })
    );

    const resp = await performDeepSearch('是什么测试', gatewaySettings());

    expect(resp.provider).toBe('builtin');
    expect(resp.results.some((r) => r.title === '测试词条')).toBe(true);
  });

  it('所有请求都失败时结果为空数组，不编造假结果', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    const resp = await performDeepSearch('最近热搜', gatewaySettings());

    expect(Array.isArray(resp.results)).toBe(true);
    expect(resp.results).toHaveLength(0);
    expect(resp.results.some((r) => r.source === 'Grok DeepSearch Pulse')).toBe(false);
    expect(resp.results.some((r) => r.source === 'Social Trend Radar')).toBe(false);
  });
});

describe('extractSearchQuery', () => {
  it('保留时间词「最近」', () => {
    expect(extractSearchQuery('最近有什么新闻？')).toContain('最近');
  });

  it('去掉开头的「帮我查一下」', () => {
    expect(extractSearchQuery('帮我查一下苹果手机')).toBe('苹果手机');
  });
});

describe('cleanGatewayAnswer markdown cleanup', () => {
  it('flattens headings, bold and tables into plain text', () => {
    const raw = '## 今日要闻\n**重点**：芯片新规\n| 领域 | 新闻 |\n|---|---|\n| 手机 | 厂商取消 Air 机型 |';
    const out = cleanGatewayAnswer(raw);
    expect(out).not.toMatch(/[#|*]/);
    expect(out).not.toContain('---');
    expect(out).toContain('今日要闻');
    expect(out).toContain('重点：芯片新规');
    expect(out).toContain('手机：厂商取消 Air 机型');
  });
});

describe('cleanGatewayAnswer entity tags', () => {
  it('keeps the value of <Entity …/> tags (titles, names)', () => {
    const raw = '**1. <Entity value="The Hunger Games: Sunrise on the Reaping" category="movie"/>**\n<badge color="success">优先推荐</badge>';
    const out = cleanGatewayAnswer(raw);
    expect(out).toContain('1. The Hunger Games: Sunrise on the Reaping');
    expect(out).toContain('优先推荐');
    expect(out).not.toMatch(/[<>]/);
  });
});
