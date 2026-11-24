import { isLocalGatewayUrl, LOCAL_GATEWAY_BASE_URL } from '@/lib/grok/image-generator';
import {
  extractMemorableFactFromTurn,
  mergeMemoryIntoMarkdown,
} from '@/lib/persona/auto-memory';
import { analyzeUserChatStyle } from '@/lib/persona/style-loop';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaRecord, SnapshotKind } from '@/lib/storage/types';

export const LEARNED_HABITS_HEADING = '## 6. 相处中习得的习惯与偏好';
export const STYLE_LOOP_HEADING = '## 7. 对话方式自学习循环 (Style Loop)';

export interface EvolutionResult {
  evolved: boolean;
  snapshotId?: string;
  addedMemories: string[];
  addedHabits: string[];
  addedStyleRules: string[];
  prunedSchedules: number;
  usedLLM: boolean;
  summary: string;
  persona?: PersonaRecord;
}

function mergePersonaSectionEntries(
  personaMd: string,
  heading: string,
  entries: string[],
  maxEntries: number,
  dateLabel = new Date().toLocaleDateString('zh-CN')
): { updated: boolean; addedCount: number; addedItems: string[]; personaMd: string } {
  const cleanedIncoming = entries
    .map((h) => h.replace(/\s+/g, ' ').trim())
    .filter((h) => h.length >= 3 && h.length <= 120);

  if (cleanedIncoming.length === 0) {
    return { updated: false, addedCount: 0, addedItems: [], personaMd };
  }

  let working = (personaMd || '').trimEnd();
  let existingSectionLines: string[] = [];

  if (working.includes(heading)) {
    const idx = working.indexOf(heading);
    const after = working.slice(idx + heading.length);
    const nextHeadingMatch = after.match(/\n##\s+/);
    const body = nextHeadingMatch ? after.slice(0, nextHeadingMatch.index) : after;
    existingSectionLines = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  const newEntries: string[] = [];
  const addedItems: string[] = [];
  for (const item of cleanedIncoming) {
    const core = item.replace(/^[-*]\s*/, '').replace(/^\[[^\]]+\]\s*/, '').trim();
    const alreadyExists =
      existingSectionLines.some((line) => line.includes(core)) ||
      newEntries.some((line) => line.includes(core));
    if (!alreadyExists && core.length >= 3) {
      newEntries.push(`- [${dateLabel}] ${core}`);
      addedItems.push(core);
    }
  }

  if (newEntries.length === 0) {
    return { updated: false, addedCount: 0, addedItems: [], personaMd };
  }

  const mergedLines = [...existingSectionLines, ...newEntries].slice(-maxEntries);
  const sectionBlock = `${heading}\n${mergedLines.join('\n')}\n`;

  if (working.includes(heading)) {
    const idx = working.indexOf(heading);
    const before = working.slice(0, idx).trimEnd();
    const after = working.slice(idx + heading.length);
    const nextHeadingMatch = after.match(/\n##\s+/);
    const rest = nextHeadingMatch ? after.slice(nextHeadingMatch.index).trimStart() : '';

    working = [before, sectionBlock.trimEnd(), rest].filter(Boolean).join('\n\n') + '\n';
  } else if (working.includes('## Correction 记录')) {
    const corrIdx = working.indexOf('## Correction 记录');
    const before = working.slice(0, corrIdx).trimEnd();
    const rest = working.slice(corrIdx).trimStart();
    working = [before, sectionBlock.trimEnd(), rest].filter(Boolean).join('\n\n') + '\n';
  } else {
    working = working ? `${working}\n\n${sectionBlock}` : sectionBlock;
  }

  return {
    updated: true,
    addedCount: newEntries.length,
    addedItems,
    personaMd: working,
  };
}

/**
 * 仅在独立「## 6. 相处中习得的习惯与偏好」小节内增量追加习惯，绝不覆写原始五层人设（Layers 0-5）
 */
export function mergeLearnedHabitsIntoPersona(
  personaMd: string,
  habits: string[],
  dateLabel = new Date().toLocaleDateString('zh-CN')
): { updated: boolean; addedCount: number; personaMd: string } {
  const res = mergePersonaSectionEntries(
    personaMd,
    LEARNED_HABITS_HEADING,
    habits,
    20,
    dateLabel
  );
  return {
    updated: res.updated,
    addedCount: res.addedCount,
    personaMd: res.personaMd,
  };
}

/**
 * 仅在独立「## 7. 对话方式自学习循环 (Style Loop)」小节内沉淀口语/emoji/节奏迭代规则，不破坏 Layers 0-5
 */
export function mergeStyleLoopIntoPersona(
  personaMd: string,
  styleRules: string[],
  dateLabel = new Date().toLocaleDateString('zh-CN')
): { updated: boolean; addedCount: number; addedItems: string[]; personaMd: string } {
  return mergePersonaSectionEntries(
    personaMd,
    STYLE_LOOP_HEADING,
    styleRules,
    12,
    dateLabel
  );
}

/**
 * 清理超过 7 天的一次性相对时间日程（如“明天/后天/今晚”），保留长期偏好与近况事实
 */
export function pruneExpiredScheduleLines(
  memoriesMd: string,
  now = new Date()
): { prunedCount: number; memoriesMd: string } {
  const lines = (memoriesMd || '').split('\n');
  let prunedCount = 0;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const kept = lines.filter((line) => {
    const dateMatch = line.match(/^-\s*\[(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})\]\s*(.+)$/);
    if (!dateMatch) return true;

    const [, y, m, d, body] = dateMatch;
    const isOneOffSchedule =
      body.includes('近期日程') &&
      /(?:明天|后天|大后天|今晚|今早|待会|这周末)/.test(body);
    if (!isOneOffSchedule) return true;

    const entryDate = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(entryDate.getTime())) return true;

    if (now.getTime() - entryDate.getTime() > sevenDaysMs) {
      prunedCount += 1;
      return false;
    }
    return true;
  });

  if (prunedCount === 0) {
    return { prunedCount: 0, memoriesMd };
  }

  return {
    prunedCount,
    memoriesMd: kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
  };
}

function parseJsonFromLlmOutput(raw: string): {
  memories?: string[];
  habits?: string[];
  styleRules?: string[];
  summary?: string;
} | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(stripped) as {
      memories?: string[];
      habits?: string[];
      styleRules?: string[];
      summary?: string;
    };
  } catch {
    const objMatch = stripped.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try {
      return JSON.parse(objMatch[0]) as {
        memories?: string[];
        habits?: string[];
        styleRules?: string[];
        summary?: string;
      };
    } catch {
      return null;
    }
  }
}

/**
 * 执行一次完整的记忆整理、习惯与说话方式自省循环及版本快照存档（支持本地网关 LLM 总结与纯 TS 规则兜底）
 */
export async function consolidatePersonaEvolution(
  slug: string,
  options?: {
    force?: boolean;
    reason?: string;
    snapshotKind?: SnapshotKind;
    /** 自动触发时记录的用户轮次游标（持久化，重启不重复整理） */
    userTurnCursor?: number;
  }
): Promise<EvolutionResult> {
  const persona = await storageRepo.getPersona(slug);
  if (!persona) {
    return {
      evolved: false,
      addedMemories: [],
      addedHabits: [],
      addedStyleRules: [],
      prunedSchedules: 0,
      usedLLM: false,
      summary: '未找到对应角色',
    };
  }

  const [recentMessages, settings] = await Promise.all([
    storageRepo.getConversation(slug, 24),
    storageRepo.getSettings(),
  ]);

  const userStyle = analyzeUserChatStyle(recentMessages);
  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const baseUrl = (
    settings.llmBaseUrl ||
    process.env.LLM_BASE_URL ||
    LOCAL_GATEWAY_BASE_URL
  ).replace(/\/$/, '');
  const model = settings.llmModel || process.env.LLM_MODEL || 'gpt-5.6';
  const isVitest = Boolean(process.env.VITEST);
  const canCallUpstream =
    ((Boolean(apiKey) && apiKey !== 'your-api-key') ||
      (!isVitest && isLocalGatewayUrl(baseUrl))) &&
    recentMessages.length > 0;

  let candidateMemories: string[] = [];
  let candidateHabits: string[] = [];
  let candidateStyleRules: string[] = [];
  let llmSummary = '';
  let usedLLM = false;

  if (canCallUpstream) {
    try {
      const endpoint = baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl}/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey && apiKey !== 'your-api-key') {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const transcript = recentMessages
        .slice(-18)
        .map((m) => `${m.role === 'user' ? '用户' : persona.name}: ${m.content}`)
        .join('\n');

      const correctionsText = (persona.corrections || [])
        .slice(-8)
        .map((c) => `- ${c.correction}`)
        .join('\n');

      const prompt = `请分析以下最近对话与用户纠偏，同时完成「长期记忆提取」「相处习惯」「对话风格自省改进（去除 AI 味与多余 emoji，贴近当代年轻人微信聊天方式）」。
只输出严格 JSON，不要额外解释：
{
  "memories": ["简短长期事实或用户偏好（最多 4 条，不要一次性寒暄）"],
  "habits": ["角色相处习惯（最多 3 条）"],
  "styleRules": ["对比对方说话方式（平均 ${userStyle.avgCharLength} 字、emoji 频率 ${userStyle.emojiPerMsg}）与你的回复，指出哪句太书面/太像AI/emoji太多，并给出下一轮说话方式改进规则（最多 2 条）"],
  "summary": "20字以内的本次整理摘要"
}

已有记忆摘要：
${persona.memoriesMd.slice(-600)}

最近纠偏记录：
${correctionsText || '无'}

近期对话：
${transcript}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          stream: false,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: '你是结构化记忆与拟人口语自省蒸馏助手，只输出合法 JSON。',
            },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(35000),
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          const parsed = parseJsonFromLlmOutput(content);
          if (parsed) {
            usedLLM = true;
            if (Array.isArray(parsed.memories)) {
              candidateMemories = parsed.memories
                .filter((x): x is string => typeof x === 'string')
                .map((x) => x.trim())
                .filter((x) => x.length >= 4 && x.length <= 120)
                .slice(0, 5);
            }
            if (Array.isArray(parsed.habits)) {
              candidateHabits = parsed.habits
                .filter((x): x is string => typeof x === 'string')
                .map((x) => x.trim())
                .filter((x) => x.length >= 4 && x.length <= 120)
                .slice(0, 4);
            }
            if (Array.isArray(parsed.styleRules)) {
              candidateStyleRules = parsed.styleRules
                .filter((x): x is string => typeof x === 'string')
                .map((x) => x.trim())
                .filter((x) => x.length >= 4 && x.length <= 120)
                .slice(0, 3);
            }
            if (typeof parsed.summary === 'string') {
              llmSummary = parsed.summary.trim();
            }
          }
        }
      }
    } catch {
      // Fallback gracefully to pure-TS heuristic extraction
    }
  }

  // Always run pure-TS heuristic fallback/supplement so offline & Vitest remain deterministic
  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      const fact = extractMemorableFactFromTurn(msg.content);
      if (fact && !candidateMemories.includes(fact)) {
        candidateMemories.push(fact);
      }
    }
  }
  for (const corr of (persona.corrections || []).slice(-5)) {
    const habitRule = `互动风格调整：${corr.correction.trim()}`;
    if (!candidateHabits.includes(habitRule)) {
      candidateHabits.push(habitRule);
    }
  }

  if (userStyle.sampleCount > 0) {
    if (userStyle.maxBotEmojiPerTurn === 0) {
      candidateStyleRules.push('对方基本不发表情符号，保持纯文字口语回复（0 个 emoji）');
    } else {
      candidateStyleRules.push('单轮最多保留 1 个克制表情，避免油腻连发');
    }
    if (userStyle.lengthBucket === 'short') {
      candidateStyleRules.push(
        `对齐对方精简打字节奏（约 ${userStyle.avgCharLength} 字），用短句分条聊`
      );
    }
    if (!userStyle.usesTrailingPeriod) {
      candidateStyleRules.push('短气泡末尾不打“。”，保持微信日常松弛停顿');
    }
  }

  const reason = options?.reason || '记忆与说话方式自省整理';
  const snapshotKind: SnapshotKind = options?.snapshotKind || 'manual';
  const cursor = options?.userTurnCursor;

  // LLM 调用期间角色可能已被其他写入修改：在锁内基于最新记录重新合并，避免覆盖并发写入
  let outcome: Omit<EvolutionResult, 'usedLLM' | 'persona'> | null = null;
  const saved = await storageRepo.updatePersona(slug, async (fresh) => {
    const pruned = pruneExpiredScheduleLines(fresh.memoriesMd);
    let nextMemoriesMd = pruned.memoriesMd;
    const addedMemories: string[] = [];
    for (const mem of candidateMemories) {
      const merged = mergeMemoryIntoMarkdown(nextMemoriesMd, mem);
      if (merged.updated) {
        nextMemoriesMd = merged.memoriesMd;
        addedMemories.push(mem);
      }
    }

    const habitMerge = mergePersonaSectionEntries(
      fresh.personaMd,
      LEARNED_HABITS_HEADING,
      candidateHabits,
      20
    );
    const styleMerge = mergeStyleLoopIntoPersona(habitMerge.personaMd, candidateStyleRules);

    const hasChanges =
      addedMemories.length > 0 ||
      habitMerge.addedItems.length > 0 ||
      styleMerge.addedItems.length > 0 ||
      pruned.prunedCount > 0;

    const evolutionState =
      typeof cursor === 'number'
        ? { lastEvolvedUserTurn: cursor, lastEvolvedAt: new Date().toISOString() }
        : fresh.evolution;

    if (!hasChanges) {
      outcome = null;
      // 仍需持久化游标，避免重启后重复整理同一轮
      return typeof cursor === 'number' ? { ...fresh, evolution: evolutionState } : null;
    }

    const summaryText =
      llmSummary ||
      `新增 ${addedMemories.length} 条记忆、${habitMerge.addedItems.length} 条习惯、${styleMerge.addedItems.length} 条口吻学习${
        pruned.prunedCount > 0 ? `，归档 ${pruned.prunedCount} 条过期日程` : ''
      }`;

    const snap = await storageRepo.writeSnapshotFrom(fresh, reason, summaryText, snapshotKind);
    outcome = {
      evolved: true,
      snapshotId: snap.id,
      addedMemories,
      addedHabits: habitMerge.addedItems,
      addedStyleRules: styleMerge.addedItems,
      prunedSchedules: pruned.prunedCount,
      summary: summaryText,
    };
    return {
      ...fresh,
      personaMd: styleMerge.personaMd,
      memoriesMd: nextMemoriesMd,
      evolution: evolutionState,
      updatedAt: new Date().toISOString(),
    };
  });

  if (outcome) {
    return { ...(outcome as Omit<EvolutionResult, 'usedLLM' | 'persona'>), usedLLM, persona: saved || persona };
  }

  return {
    evolved: false,
    addedMemories: [],
    addedHabits: [],
    addedStyleRules: [],
    prunedSchedules: 0,
    usedLLM,
    summary: options?.force
      ? '已强制整理：记忆与对话风格已处于最新状态'
      : '记忆与对话风格已处于最新状态，暂无新增改动',
    persona: saved || persona,
  };
}

/**
 * 每累计 4 轮用户对话静默触发一次后台记忆与说话方式自省循环（同轮次防重入）
 */
const inFlightEvolution = new Set<string>();

export async function maybeRunAutoEvolution(slug: string): Promise<boolean> {
  if (process.env.VITEST) return false;
  return runAutoEvolutionIfDue(slug);
}

/**
 * 判断是否到了自动整理的轮次（游标持久化在角色元数据中），到期则执行；可在测试中直接调用
 */
export async function runAutoEvolutionIfDue(slug: string, every = 4): Promise<boolean> {
  if (inFlightEvolution.has(slug)) return false;
  const [allMsgs, persona] = await Promise.all([
    storageRepo.getConversation(slug, 0),
    storageRepo.getPersona(slug),
  ]);
  if (!persona) return false;
  // 会话文件只保留最近 200 条消息，所以按「上次整理之后的新用户消息数」判断，而不是总条数取模
  const since = persona.evolution?.lastEvolvedAt;
  const sinceMs = since ? new Date(since).getTime() : NaN;
  const newUserTurns = allMsgs.filter(
    (m) =>
      m.role === 'user' &&
      (!Number.isFinite(sinceMs) || new Date(m.timestamp).getTime() > sinceMs)
  ).length;
  if (newUserTurns < every) {
    return false;
  }
  const userTurnCount = (persona.evolution?.lastEvolvedUserTurn ?? 0) + newUserTurns;

  inFlightEvolution.add(slug);
  try {
    const res = await consolidatePersonaEvolution(slug, {
      reason: `第 ${userTurnCount} 轮自动记忆与风格自省`,
      snapshotKind: 'auto',
      userTurnCursor: userTurnCount,
    });
    return res.evolved;
  } finally {
    inFlightEvolution.delete(slug);
  }
}
