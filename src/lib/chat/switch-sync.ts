import type { ConversationMessage, PersonaMode } from '@/lib/storage/types';

export interface PendingBurstSnapshot {
  slug: string;
  groupId: string | null;
  mode: PersonaMode;
  thinkMode: boolean;
  deepSearch: boolean;
  messages: ConversationMessage[];
}

export function buildStreamRequestBody(snapshot: PendingBurstSnapshot) {
  return {
    slug: snapshot.slug,
    groupId: snapshot.groupId || undefined,
    messages: snapshot.messages.map((m) => ({
      role: m.role,
      content: m.content,
      imageUrl: m.imageUrl,
      timestamp: m.timestamp,
    })),
    mode: snapshot.mode,
    thinkMode: snapshot.thinkMode,
    deepSearch: snapshot.deepSearch,
  };
}

export function channelKey(target: { slug?: string | null; groupId?: string | null }): string {
  if (target.groupId) return `group:${target.groupId}`;
  return `chat:${target.slug || ''}`;
}

function isSameUserMessage(a: ConversationMessage, b: ConversationMessage): boolean {
  return (
    a.id === b.id ||
    (a.role === 'user' &&
      b.role === 'user' &&
      a.content === b.content &&
      (!a.timestamp || !b.timestamp || a.timestamp === b.timestamp))
  );
}

/**
 * 过滤掉已落盘到服务端的本地待确认消息，并丢弃超时条目，避免异常残留。
 */
export function pruneSavedPendingMessages(
  pending: ConversationMessage[],
  serverMessages: ConversationMessage[],
  nowMs = Date.now(),
  maxAgeMs = 120_000
): ConversationMessage[] {
  if (pending.length === 0) return [];
  const recentServer = serverMessages.slice(-40);
  return pending.filter((msg) => {
    const ts = msg.timestamp ? Date.parse(msg.timestamp) : NaN;
    if (Number.isFinite(ts) && nowMs - ts > maxAgeMs) return false;
    return !recentServer.some((s) => isSameUserMessage(msg, s));
  });
}

/**
 * 把服务端权威消息与本地尚未落盘的用户消息合并，避免切回或历史加载晚到时覆盖刚发出的消息。
 */
export function mergeServerWithLocalPending(
  prev: ConversationMessage[],
  serverMessages: ConversationMessage[],
  pendingLocal: ConversationMessage[]
): ConversationMessage[] {
  const unsaved = pruneSavedPendingMessages(pendingLocal, serverMessages);
  const next = unsaved.length > 0 ? [...serverMessages, ...unsaved] : serverMessages;
  if (
    prev.length === next.length &&
    prev.every((m, idx) => JSON.stringify(m) === JSON.stringify(next[idx]))
  ) {
    return prev;
  }
  return next;
}

/**
 * 把后台拉取到的服务端消息合并到当前列表：
 * - 以服务端消息为权威基准（更新既有消息的 mediaCards 状态，并合入后台新落盘的回复）；
 * - 保留尚未落盘到服务端、刚在本地发出的末尾用户消息（避免闪烁消失）；
 * - 若合并结果与 prev 完全一致，返回 prev 引用以避免多余重渲染。
 */
export function mergePolledMessages(
  prev: ConversationMessage[],
  serverMessages: ConversationMessage[]
): ConversationMessage[] {
  if (serverMessages.length === 0) return prev;

  const recentServer = serverMessages.slice(-40);
  const unsavedTailUsers: ConversationMessage[] = [];
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    const m = prev[i];
    if (m.role !== 'user') break;
    if (!recentServer.some((s) => isSameUserMessage(m, s))) {
      unsavedTailUsers.unshift(m);
    } else {
      break;
    }
  }

  const next = unsavedTailUsers.length > 0 ? [...serverMessages, ...unsavedTailUsers] : serverMessages;
  if (
    prev.length === next.length &&
    prev.every((m, idx) => JSON.stringify(m) === JSON.stringify(next[idx]))
  ) {
    return prev;
  }
  return next;
}
