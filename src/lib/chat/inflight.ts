/**
 * 正在生成中的对话登记（进程内）：你中途切走再切回来时，前端据此显示「正在输入」并等它写完。
 * 用 globalThis 保存，开发模式下不同路由的模块副本也能共享同一份登记。
 */
export interface InflightInfo {
  key: string;
  label: string;
  startedAt: string;
  token: string;
}

type Registry = Map<string, InflightInfo>;

const GLOBAL_KEY = '__personabotInflight';

function registry(): Registry {
  const g = globalThis as unknown as Record<string, Registry | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY]!;
}

/** 单聊频道用 chat:<slug>，群聊用 group:<id> */
export function inflightKey(params: { slug?: string; groupId?: string }): string | null {
  if (params.groupId) return `group:${params.groupId}`;
  if (params.slug) return `chat:${params.slug}`;
  return null;
}

export function beginInflight(key: string, label: string): string {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  registry().set(key, { key, label, startedAt: new Date().toISOString(), token });
  return token;
}

/** 只结束自己登记的那一次（避免较早的一轮把较新的一轮标记成结束） */
export function endInflight(key: string, token: string): void {
  const current = registry().get(key);
  if (current && current.token === token) registry().delete(key);
}

/** 超过 3 分钟还没结束的登记视为异常残留，不再报告为生成中 */
export function getInflight(key: string, now = Date.now()): InflightInfo | null {
  const info = registry().get(key);
  if (!info) return null;
  if (now - new Date(info.startedAt).getTime() > 3 * 60_000) {
    registry().delete(key);
    return null;
  }
  return info;
}
