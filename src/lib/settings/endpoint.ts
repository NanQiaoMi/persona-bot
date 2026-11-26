import { LOCAL_GATEWAY_BASE_URL } from '@/lib/grok/models';

/** 网关地址拆成「协议 / 主机 / 端口 / 路径」，方便单独改端口 */
export interface EndpointParts {
  protocol: 'http' | 'https';
  host: string;
  /** 空字符串表示用协议默认端口 */
  port: string;
  path: string;
}

export function splitBaseUrl(raw: string | undefined): EndpointParts {
  const text = (raw || '').trim() || LOCAL_GATEWAY_BASE_URL;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
    return {
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port,
      path: url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''),
    };
  } catch {
    return splitBaseUrl(LOCAL_GATEWAY_BASE_URL);
  }
}

export function joinBaseUrl(parts: EndpointParts): string {
  const host = parts.host.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '') || '127.0.0.1';
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const port = parts.port.trim();
  const path = parts.path.trim() ? `/${parts.path.trim().replace(/^\/+|\/+$/g, '')}` : '';
  return `${parts.protocol}://${hostPart}${port ? `:${port}` : ''}${path}`;
}

/** 端口留空（默认）或 1–65535 的整数 */
export function isValidPort(port: string): boolean {
  const p = port.trim();
  if (!p) return true;
  if (!/^\d{1,5}$/.test(p)) return false;
  const n = Number(p);
  return n >= 1 && n <= 65535;
}

/** 按地址推断服务商标签（只影响设置页里高亮哪个预设） */
export function inferProvider(
  baseUrl: string
): 'local_gateway' | 'xai' | 'deepseek' | 'openai' | 'ollama' | 'custom' {
  const { host, port } = splitBaseUrl(baseUrl);
  const local = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (local && port === '18630') return 'local_gateway';
  if (local && port === '11434') return 'ollama';
  if (host === 'api.x.ai') return 'xai';
  if (host === 'api.deepseek.com') return 'deepseek';
  if (host === 'api.openai.com') return 'openai';
  return 'custom';
}
