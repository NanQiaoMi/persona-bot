/**
 * 每轮对话后的长记忆维护（不阻塞回复）：
 * 1. 从用户这轮话里提取「之后值得关心的事」（面试、考试、搬家…）
 * 2. 角色这轮如果已经问过某件事，标记为已问，避免反复追问
 * 3. 聊天记录滑出模型窗口足够多时，更新滚动摘要
 * 以及每轮回复前，把摘要 / 待关心的事组装成提示词片段。
 */
import { LlmConfig } from '@/lib/llm/client';
import {
  buildSummaryDirective,
  computeNextSummary,
} from '@/lib/persona/conversation-summary';
import {
  buildPendingTopicDirective,
  extractPendingTopics,
  getDueTopics,
  markAskedTopics,
  mergePendingTopics,
} from '@/lib/persona/pending-topics';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMemoryState } from '@/lib/storage/types';

export function buildConversationMemoryDirectives(
  state: ConversationMemoryState,
  now: Date = new Date()
): string {
  const due = getDueTopics(state.pendingTopics || [], now);
  return [buildSummaryDirective(state.summary), buildPendingTopicDirective(due)]
    .filter((s) => s && s.trim())
    .join('\n\n');
}

export async function refreshConversationMemory(params: {
  slug: string;
  personaName: string;
  userText: string;
  reply: string;
  llm?: LlmConfig | null;
  now?: Date;
}): Promise<ConversationMemoryState> {
  const now = params.now || new Date();
  const all = await storageRepo.getConversation(params.slug, 0);

  // 摘要可能要调模型，放在锁外先算好，再在锁内合并写入
  const current = await storageRepo.getMemoryState(params.slug);
  const nextSummary = await computeNextSummary({
    all,
    state: current.summary,
    personaName: params.personaName,
    llm: params.llm,
    now,
  });

  return storageRepo.updateMemoryState(params.slug, (state) => {
    let topics = state.pendingTopics || [];
    topics = markAskedTopics(topics, params.reply, now);
    const incoming = extractPendingTopics(params.userText, now);
    // 即使这轮没有新事件也跑一遍合并，让过期的事自动清理
    topics = mergePendingTopics(topics, incoming, now);
    return {
      ...state,
      summary: nextSummary || state.summary,
      pendingTopics: topics,
    };
  });
}
