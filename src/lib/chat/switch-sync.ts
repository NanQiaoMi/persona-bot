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

  const isSameUserMessage = (a: ConversationMessage, b: ConversationMessage) =>
    a.id === b.id ||
    (a.role === 'user' &&
      b.role === 'user' &&
      a.content === b.content &&
      (!a.timestamp || !b.timestamp || a.timestamp === b.timestamp));

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
