import { LOCAL_GATEWAY_BASE_URL } from '@/lib/grok/models';
import { RuntimeSettings } from '@/lib/storage/types';

/**
 * 统一 LLM 客户端：对话、蒸馏、自进化、主动追问共用同一套 baseUrl / key / model 解析与「能否调用上游」判定，
 * 保证在本地网关（免 Key）下所有链路行为一致，未配置时统一走离线兜底。
 */
export const DEFAULT_CHAT_MODEL = 'gpt-5.6';

export interface LlmConfig {
  baseUrl: string;
  endpoint: string;
  apiKey: string;
  model: string;
  isLocalGateway: boolean;
  /** 是否可以真正调用上游（有有效 Key，或非测试环境下的本地网关） */
  canCall: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function isLocalGatewayUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test((url || '').trim());
}

export function hasUsableApiKey(apiKey: string): boolean {
  return Boolean(apiKey) && apiKey !== 'your-api-key';
}

export function resolveLlmConfig(
  settings: Partial<Pick<RuntimeSettings, 'llmBaseUrl' | 'llmApiKey' | 'llmModel'>>,
  overrides: { model?: string } = {}
): LlmConfig {
  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const baseUrl = (
    settings.llmBaseUrl ||
    process.env.LLM_BASE_URL ||
    LOCAL_GATEWAY_BASE_URL
  ).replace(/\/$/, '');
  const model =
    overrides.model || settings.llmModel || process.env.LLM_MODEL || DEFAULT_CHAT_MODEL;
  const isLocalGateway = isLocalGatewayUrl(baseUrl);
  const isVitest = Boolean(process.env.VITEST);
  return {
    baseUrl,
    endpoint: baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`,
    apiKey,
    model,
    isLocalGateway,
    canCall: hasUsableApiKey(apiKey) || (!isVitest && isLocalGateway),
  };
}

export function buildLlmHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (hasUsableApiKey(apiKey)) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/**
 * 非流式对话补全，返回 message.content（失败抛错，由调用方决定兜底）
 */
export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options: { temperature?: number; timeoutMs?: number } = {}
): Promise<string> {
  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: buildLlmHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: options.temperature ?? 0.7,
      messages,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * 宽松解析模型输出中的 JSON（兼容 ```json 代码块与前后解释文字）
 */
export function parseJsonFromLlmOutput<T = Record<string, unknown>>(raw: string): T | null {
  const stripped = (raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const objMatch = stripped.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      return null;
    }
  }
}
