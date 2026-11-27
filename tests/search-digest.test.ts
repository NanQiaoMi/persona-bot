import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  cleanTopicTitle,
  digestSources,
  heuristicDigest,
  normalizeModelDigest,
  buildSearchDigest,
} from '@/lib/grok/search-digest';
import { shouldAutoTriggerSearch, type DeepSearchResponse } from '@/lib/grok/deep-search';
import type { SearchResultItem } from '@/lib/storage/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function makeResp(results: SearchResultItem[], answer?: string): DeepSearchResponse {
  return {
    query: 'test',
    provider: 'gateway',
    results,
    timestamp: new Date().toISOString(),
    answer,
  };
}

const LIST_ANSWER =
  '本周三部新片值得关注。\n1. Hexed：迪士尼奇幻新片\n- 类型：动画\n2. The Cat in the Hat：华纳新作\n3. Wildwood：神秘森林冒险';

describe('cleanTopicTitle', () => {
  it('strips request wording and the persona-commentary clause', () => {
    expect(cleanTopicTitle('帮我联网整理一下今天全网最值得聊的科技圈热搜清单，用你的性格锐评一下')).toBe(
      '今天全网最值得聊的科技圈热搜清单'
    );
  });

  it('strips the leading search verb and trailing question mark', () => {
    expect(cleanTopicTitle('搜一下最近上映的动画电影？')).toBe('最近上映的动画电影');
  });

  it('clips long titles to at most 24 chars with an ellipsis', () => {
    const long = '帮我整理' + '一二三四五六七八九十'.repeat(5);
    const title = cleanTopicTitle(long);
    expect(title.length).toBeLessThanOrEqual(24);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('digestSources', () => {
  it('keeps only results that have a url', () => {
    const results: SearchResultItem[] = [
      { title: '有链接', snippet: 'a', url: 'https://example.com/a', source: 'Web' },
      { title: '无链接', snippet: 'b', source: 'Gateway' },
      { title: '空链接', snippet: 'c', url: '', source: 'Web' },
      { title: '另一条', snippet: 'd', url: 'https://example.com/d', source: 'Web' },
    ];
    const kept = digestSources(results);
    expect(kept.map((r) => r.title)).toEqual(['有链接', '另一条']);
  });
});

describe('heuristicDigest', () => {
  it('extracts numbered list items as highlights and skips sub-field lines', () => {
    const digest = heuristicDigest(makeResp([], LIST_ANSWER), '搜一下最近上映的动画电影？');
    expect(digest.highlights.map((h) => h.title)).toEqual(['Hexed', 'The Cat in the Hat', 'Wildwood']);
    expect(digest.highlights[0].detail).toBe('迪士尼奇幻新片');
    expect(digest.highlights[1].detail).toBe('华纳新作');
    expect(digest.highlights[2].detail).toBe('神秘森林冒险');
    expect(digest.highlights.some((h) => h.title.includes('类型'))).toBe(false);
    expect(digest.method).toBe('rules');
    expect(digest.title).toBe('最近上映的动画电影');
  });

  it('uses the first sentence of the answer as lede (at least 8 chars)', () => {
    const digest = heuristicDigest(makeResp([], LIST_ANSWER), '搜一下最近上映的动画电影？');
    expect(digest.lede).toBe('本周三部新片值得关注。');
    expect(digest.lede.length).toBeGreaterThanOrEqual(8);
  });

  it('falls back to source titles and snippets when the answer has no list items', () => {
    const resp = makeResp(
      [
        { title: '来源甲', snippet: '摘要甲', url: 'https://a.example/1', source: 'Web' },
        { title: '无链接条目', snippet: '汇总文本', source: 'Gateway' },
        { title: '来源乙', snippet: '摘要乙', url: 'https://c.example/2', source: 'Web' },
      ],
      '没有列表的纯文本摘要'
    );
    const digest = heuristicDigest(resp, '比特币现在币价多少');
    expect(digest.method).toBe('rules');
    expect(digest.highlights).toEqual([
      { title: '来源甲', detail: '摘要甲', sources: [1] },
      { title: '来源乙', detail: '摘要乙', sources: [2] },
    ]);
  });
});

describe('normalizeModelDigest', () => {
  it('accepts a valid object and marks it as model output', () => {
    const digest = normalizeModelDigest(
      {
        title: '本周新片',
        lede: '三部动画上映',
        highlights: [{ title: 'Hexed', detail: '迪士尼', sources: [1] }],
      },
      3
    );
    expect(digest).not.toBeNull();
    expect(digest?.method).toBe('model');
    expect(digest?.title).toBe('本周新片');
    expect(digest?.highlights).toEqual([{ title: 'Hexed', detail: '迪士尼', sources: [1] }]);
  });

  it('clips the title to at most 24 chars', () => {
    const digest = normalizeModelDigest(
      { title: 'a'.repeat(40), highlights: [{ title: 'X', detail: '', sources: [] }] },
      1
    );
    expect(digest?.title.length).toBeLessThanOrEqual(24);
    expect(digest?.title.endsWith('…')).toBe(true);
  });

  it('drops highlights without a title', () => {
    const digest = normalizeModelDigest(
      {
        title: '标题',
        highlights: [
          { title: '', detail: '没有标题的要点', sources: [1] },
          { title: 'Ok', detail: '', sources: [] },
        ],
      },
      1
    );
    expect(digest?.highlights.map((h) => h.title)).toEqual(['Ok']);
  });

  it('keeps only in-range, integer, deduplicated source refs', () => {
    const digest = normalizeModelDigest(
      {
        title: '标题',
        highlights: [{ title: 'X', detail: '', sources: [0, 1, 1, 2, 5, 'x', 2.5, -1] }],
      },
      3
    );
    expect(digest?.highlights[0].sources).toEqual([1, 2]);
  });

  it('caps highlights at 5', () => {
    const highlights = Array.from({ length: 7 }, (_, i) => ({ title: `要点${i + 1}`, detail: '', sources: [] }));
    const digest = normalizeModelDigest({ title: '标题', highlights }, 1);
    expect(digest?.highlights.length).toBe(5);
  });

  it('returns null when the title is missing', () => {
    expect(normalizeModelDigest({ highlights: [{ title: 'X' }] }, 1)).toBeNull();
  });

  it('returns null when highlights is not an array', () => {
    expect(normalizeModelDigest({ title: '标题', highlights: 'nope' }, 1)).toBeNull();
  });

  it('returns null when no highlight is valid', () => {
    expect(normalizeModelDigest({ title: '标题', highlights: [{ detail: '无标题' }, null] }, 1)).toBeNull();
  });
});

describe('buildSearchDigest', () => {
  const resp = makeResp([
    { title: 'Hexed 介绍', snippet: '迪士尼新片', url: 'https://example.com/hexed', source: 'Web' },
  ]);

  it('uses the model output when an API key is configured', async () => {
    const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '```json\n{"title":"本周新片","lede":"三部动画上映","highlights":[{"title":"Hexed","detail":"迪士尼","sources":[1]}]}\n```',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const digest = await buildSearchDigest(resp, '最近有什么新电影上映', {
      llmBaseUrl: 'http://llm.test/v1',
      llmApiKey: 'k',
      llmModel: 'm',
    });

    expect(digest.method).toBe('model');
    expect(digest.title).toBe('本周新片');
    expect(digest.highlights).toEqual([{ title: 'Hexed', detail: '迪士尼', sources: [1] }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://llm.test/v1/chat/completions');
  });

  it('falls back to rules when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network down'))));
    const digest = await buildSearchDigest(resp, '搜一下最近上映的动画电影？', {
      llmBaseUrl: 'http://llm.test/v1',
      llmApiKey: 'k',
      llmModel: 'm',
    });
    expect(digest.method).toBe('rules');
  });

  it('falls back to rules when the model returns invalid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '这不是 JSON' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const digest = await buildSearchDigest(resp, '搜一下最近上映的动画电影？', {
      llmBaseUrl: 'http://llm.test/v1',
      llmApiKey: 'k',
      llmModel: 'm',
    });
    expect(digest.method).toBe('rules');
  });

  it('falls back to rules without calling fetch when no key is configured under Vitest', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const digest = await buildSearchDigest(resp, '搜一下最近上映的动画电影？', {
      llmBaseUrl: 'http://llm.test/v1',
      llmApiKey: '',
    });
    expect(digest.method).toBe('rules');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('shouldAutoTriggerSearch', () => {
  it.each(['咋啦', '在吗', '你是谁呀', '你在干嘛呢', '抱抱我', '今天吃什么好呢', 'AI 你觉得怎么样'])(
    'does not trigger on casual chat: %s',
    (msg) => {
      expect(shouldAutoTriggerSearch(msg)).toBe(false);
    }
  );

  it.each(['今天热搜有什么大新闻？', '最近有什么新电影上映', '帮我查一下明天上海天气', '比特币现在币价多少', 'OpenAI 最新发布了什么'])(
    'triggers on real-time questions: %s',
    (msg) => {
      expect(shouldAutoTriggerSearch(msg)).toBe(true);
    }
  );
});
