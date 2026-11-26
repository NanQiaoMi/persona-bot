import { describe, expect, it } from 'vitest';
import { inferProvider, isValidPort, joinBaseUrl, splitBaseUrl } from '@/lib/settings/endpoint';

describe('网关地址拆分与拼回', () => {
  it('本地网关拆出主机、端口、路径，改端口后拼回', () => {
    const p = splitBaseUrl('http://127.0.0.1:18630/v1');
    expect(p).toEqual({ protocol: 'http', host: '127.0.0.1', port: '18630', path: '/v1' });
    expect(joinBaseUrl({ ...p, port: '19000' })).toBe('http://127.0.0.1:19000/v1');
  });
  it('https 默认端口留空，主机里误带协议或路径也能清理', () => {
    expect(splitBaseUrl('https://api.x.ai/v1').port).toBe('');
    expect(joinBaseUrl({ protocol: 'http', host: 'http://localhost/abc', port: '11434', path: 'v1' })).toBe(
      'http://localhost:11434/v1'
    );
  });
  it('空值或乱写时回到默认本地网关', () => {
    expect(splitBaseUrl('').port).toBe('18630');
  });
  it('端口校验', () => {
    expect(isValidPort('')).toBe(true);
    expect(isValidPort('18630')).toBe(true);
    expect(isValidPort('0')).toBe(false);
    expect(isValidPort('70000')).toBe(false);
    expect(isValidPort('12a')).toBe(false);
  });
  it('按地址推断服务商', () => {
    expect(inferProvider('http://127.0.0.1:18630/v1')).toBe('local_gateway');
    expect(inferProvider('http://localhost:11434/v1')).toBe('ollama');
    expect(inferProvider('http://192.168.1.5:8080/v1')).toBe('custom');
  });
});
