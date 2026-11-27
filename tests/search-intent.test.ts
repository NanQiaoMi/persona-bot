import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  classifySearchIntent,
  shouldAutoTriggerSearch,
  decideAutoSearch,
} from '@/lib/grok/deep-search';

const MODEL_SETTINGS = {
  llmBaseUrl: 'http://llm.test/v1',
  llmApiKey: 'k',
  llmModel: 'm',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function modelReply(content: string): Response {
  return jsonResponse({ choices: [{ message: { content } }] });
}

beforeEach(() => {
  // 避免本机环境变量让 resolveLlmConfig 意外拿到 Key 或地址
  vi.stubEnv('LLM_API_KEY', '');
  vi.stubEnv('LLM_BASE_URL', '');
  vi.stubEnv('LLM_MODEL', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('classifySearchIntent -> no', () => {
  const cases = [
    '咋啦',
    '在吗',
    '想你了',
    '你是谁呀',
    '我该不该辞职呢',
    '晚上吃火锅还是烧烤',
    '给我讲个笑话吧',
    '今天好累，不想上班',
  ];
  it.each(cases)('%s', (text) => {
    expect(classifySearchIntent(text)).toBe('no');
  });
});

describe('classifySearchIntent -> yes', () => {
  const cases = [
    '帮我查一下 iPhone 18 的价格',
    '最近有什么新闻',
    '明天北京天气怎么样',
    '特斯拉股价今天涨了吗',
    '詹姆斯昨晚得了多少分',
    '现在一美元换多少人民币',
    '你知道王者荣耀最新赛季吗',
    // 「帮我查 / 搜一下」优先于以「你 / 我」开头的否定规则
    '你帮我查一下明天天气',
  ];
  it.each(cases)('%s', (text) => {
    expect(classifySearchIntent(text)).toBe('yes');
  });
});

describe('classifySearchIntent -> maybe', () => {
  const cases = [
    '周杰伦新专辑叫什么',
    'GPT-6 是什么时候出的',
    '量子计算是什么原理',
    '美国大选结果出来了吗',
  ];
  it.each(cases)('%s', (text) => {
    expect(classifySearchIntent(text)).toBe('maybe');
  });
});

describe('shouldAutoTriggerSearch', () => {
  it('is true only for yes-intent messages', () => {
    expect(shouldAutoTriggerSearch('帮我查一下 iPhone 18 的价格')).toBe(true);
    expect(shouldAutoTriggerSearch('最近有什么新闻')).toBe(true);
    expect(shouldAutoTriggerSearch('周杰伦新专辑叫什么')).toBe(false);
    expect(shouldAutoTriggerSearch('咋啦')).toBe(false);
    expect(shouldAutoTriggerSearch('我该不该辞职呢')).toBe(false);
  });
});

describe('decideAutoSearch', () => {
  it('decides yes/no by rules without fetch or model, even with an API key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onAskModel = vi.fn();

    await expect(
      decideAutoSearch('最近有什么新闻', MODEL_SETTINGS, { onAskModel })
    ).resolves.toEqual({ search: true, via: 'rules' });
    await expect(
      decideAutoSearch('咋啦', MODEL_SETTINGS, { onAskModel })
    ).resolves.toEqual({ search: false, via: 'rules' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAskModel).not.toHaveBeenCalled();
  });

  it('maybe without API key under Vitest returns false by rules without fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onAskModel = vi.fn();

    await expect(
      decideAutoSearch('周杰伦新专辑叫什么', {}, { onAskModel })
    ).resolves.toEqual({ search: false, via: 'rules' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAskModel).not.toHaveBeenCalled();
  });

  it('maybe with key asks the model once with temperature 0 and the user text', async () => {
    const fetchMock = vi.fn(async () => modelReply('yes'));
    vi.stubGlobal('fetch', fetchMock);
    const onAskModel = vi.fn();

    const result = await decideAutoSearch('周杰伦新专辑叫什么', MODEL_SETTINGS, { onAskModel });

    expect(result).toEqual({ search: true, via: 'model' });
    expect(onAskModel).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body.temperature).toBe(0);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[messages.length - 1].content).toBe('周杰伦新专辑叫什么');
  });

  it.each([
    ['No', false],
    ['是', true],
    ['需要联网', true],
    ['maybe?', false],
  ])('model answer %j -> search %s', async (content, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => modelReply(content))
    );
    await expect(decideAutoSearch('美国大选结果出来了吗', MODEL_SETTINGS)).resolves.toEqual({
      search: expected,
      via: 'model',
    });
  });

  it('treats a rejected fetch as no search via model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    await expect(decideAutoSearch('美国大选结果出来了吗', MODEL_SETTINGS)).resolves.toEqual({
      search: false,
      via: 'model',
    });
  });

  it('treats an HTTP 500 response as no search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'boom' }, 500))
    );
    await expect(decideAutoSearch('美国大选结果出来了吗', MODEL_SETTINGS)).resolves.toEqual({
      search: false,
      via: 'model',
    });
  });
});
