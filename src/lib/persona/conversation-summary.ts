/**
 * 长对话记忆：模型每轮只看最近 PROMPT_WINDOW 条消息，更早的内容压缩成一段滚动摘要，
 * 让角色聊到第 30 条时还接得上开头说过的事。
 * - 每新增 SUMMARY_REFRESH_EVERY 条「滑出窗口」的消息才更新一次，避免每轮都多一次模型调用
 * - 有模型时让模型写摘要；没有模型或调用失败时用规则抽取对方说过的关键句兜底
 */
import { chatCompletion, LlmConfig } from '@/lib/llm/client';
import type { ConversationMessage } from '@/lib/storage/types';

export const PROMPT_WINDOW = 16;
export const SUMMARY_REFRESH_EVERY = 12;
const SUMMARY_MAX_CHARS = 900;
const EXTRACT_MAX_LINES = 14;

export interface ConversationSummaryState {
  text: string;
  /** 摘要已覆盖到的最后一条消息 id */
  coveredUntilId?: string;
  updatedAt: string;
  source: 'llm' | 'extractive';
}

export interface SummaryPlan {
  /** 需要并入摘要的新消息（已滑出模型窗口、且还没被摘要覆盖） */
  toSummarize: ConversationMessage[];
  shouldRefresh: boolean;
}

/** 算出哪些消息该并入摘要；all 是按时间顺序的完整聊天记录 */
export function planSummaryRefresh(
  all: ConversationMessage[],
  state: ConversationSummaryState | null | undefined,
  window = PROMPT_WINDOW,
  refreshEvery = SUMMARY_REFRESH_EVERY
): SummaryPlan {
  const older = all.slice(0, Math.max(0, all.length - window));
  if (older.length === 0) return { toSummarize: [], shouldRefresh: false };

  const coveredIdx = state?.coveredUntilId
    ? older.findIndex((m) => m.id === state.coveredUntilId)
    : -1;
  // 覆盖点找不到（比如记录被清空重来）时，从头重新摘要
  const toSummarize = older.slice(coveredIdx + 1);
  const threshold = state?.text ? refreshEvery : Math.min(refreshEvery, 4);
  return { toSummarize, shouldRefresh: toSummarize.length >= threshold };
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 规则兜底：保留对方说过的、有信息量的句子（近况、计划、感受），按时间追加，超长时丢最早的 */
export function buildExtractiveSummary(
  prevText: string,
  newMessages: ConversationMessage[]
): string {
  const lines = prevText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '));

  for (const m of newMessages) {
    if (m.role !== 'user') continue;
    const content = (m.content || '').trim();
    if (content.length < 6) continue;
    if (/^(哈+|嗯+|好的?|ok|行吧?|晚安|早安?|在吗|你好)[!！。.~～]*$/i.test(content)) continue;
    lines.push(`- 对方说过：${clip(content, 48)}`);
  }

  let kept = lines.slice(-EXTRACT_MAX_LINES);
  while (kept.join('\n').length > SUMMARY_MAX_CHARS && kept.length > 1) kept = kept.slice(1);
  return kept.join('\n');
}

function renderTranscript(messages: ConversationMessage[], personaName: string): string {
  return messages
    .filter((m) => (m.content || '').trim())
    .map((m) => `${m.role === 'user' ? '对方' : personaName}：${clip(m.content, 160)}`)
    .join('\n');
}

/** 让模型把旧摘要和新滑出窗口的聊天合并成一段新摘要 */
export async function summarizeWithLlm(
  config: LlmConfig,
  params: { personaName: string; prevText: string; newMessages: ConversationMessage[] }
): Promise<string> {
  const prompt = [
    `你在帮「${params.personaName}」整理和对方的聊天记忆。把「旧摘要」和「新的聊天片段」合并成一份新的摘要。`,
    '要求：',
    '- 用简短的要点（每行以「- 」开头），总共不超过 10 行、300 字',
    '- 只保留以后聊天用得上的：对方的近况、情绪、计划和待办、喜好与雷区、你们之间的约定、玩笑和梗、你答应过的事',
    '- 客套话、寒暄、已经过时的小事不要写；不要编造聊天里没有的内容',
    '- 直接输出要点，不要标题和解释',
    '',
    '【旧摘要】',
    params.prevText || '（暂无）',
    '',
    '【新的聊天片段】',
    renderTranscript(params.newMessages, params.personaName),
  ].join('\n');

  const raw = await chatCompletion(config, [{ role: 'user', content: prompt }], {
    temperature: 0.3,
    timeoutMs: 25000,
  });
  const text = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('- ') ? l : `- ${l.replace(/^[-*•\d.、\s]+/, '')}`))
    .slice(0, 12)
    .join('\n');
  if (!text) throw new Error('empty summary');
  return text.slice(0, SUMMARY_MAX_CHARS);
}

/** 生成新的摘要状态；模型不可用或失败时用规则兜底，永不抛错 */
export async function computeNextSummary(params: {
  all: ConversationMessage[];
  state: ConversationSummaryState | null | undefined;
  personaName: string;
  llm?: LlmConfig | null;
  now?: Date;
}): Promise<ConversationSummaryState | null> {
  const plan = planSummaryRefresh(params.all, params.state);
  if (!plan.shouldRefresh) return null;

  const coveredBroken =
    Boolean(params.state?.coveredUntilId) &&
    !params.all.some((m) => m.id === params.state?.coveredUntilId);
  const prevText = coveredBroken ? '' : params.state?.text || '';
  const lastCovered = plan.toSummarize[plan.toSummarize.length - 1];
  const nowIso = (params.now || new Date()).toISOString();

  if (params.llm?.canCall) {
    try {
      const text = await summarizeWithLlm(params.llm, {
        personaName: params.personaName,
        prevText,
        newMessages: plan.toSummarize,
      });
      return { text, coveredUntilId: lastCovered?.id, updatedAt: nowIso, source: 'llm' };
    } catch {
      // 落到规则兜底
    }
  }
  return {
    text: buildExtractiveSummary(prevText, plan.toSummarize),
    coveredUntilId: lastCovered?.id,
    updatedAt: nowIso,
    source: 'extractive',
  };
}

export function buildSummaryDirective(state: ConversationSummaryState | null | undefined): string {
  if (!state?.text?.trim()) return '';
  return [
    '## 更早之前你们聊过的（摘要；最近的聊天在后面的对话里）',
    state.text.trim(),
    '- 这些是你本来就记得的事：自然地接上就好，不要突然复述或背诵出来。',
  ].join('\n');
}
