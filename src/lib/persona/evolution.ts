import { isLocalGatewayUrl, LOCAL_GATEWAY_BASE_URL } from '@/lib/grok/image-generator';
import {
  extractMemorableFactFromTurn,
  mergeMemoryIntoMarkdown,
} from '@/lib/persona/auto-memory';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaRecord } from '@/lib/storage/types';

export const LEARNED_HABITS_HEADING = '## 6. 相处中习得的习惯与偏好';

const lastEvolvedTurnBySlug = new Map<string, number>();

export interface EvolutionResult {
  evolved: boolean;
  snapshotId?: string;
  addedMemories: string[];
  addedHabits: string[];
  prunedSchedules: number;
  usedLLM: boolean;
  summary: string;
  persona?: PersonaRecord;
}

/**
 * 仅在独立「## 6. 相处中习得的习惯与偏好」小节内增量追加习惯，绝不覆写原始五层人设（Layers 0-5）
 */
export function mergeLearnedHabitsIntoPersona(
  personaMd: string,
  habits: string[],
  dateLabel = new Date().toLocaleDateString('zh-CN')
): { updated: boolean; addedCount: number; personaMd: string } {
  const cleanedIncoming = habits
    .map((h) => h.replace(/\s+/g, ' ').trim())
    .filter((h) => h.length >= 3 && h.length <= 120);

  if (cleanedIncoming.length === 0) {
    return { updated: false, addedCount: 0, personaMd };
  }

  let working = (personaMd || '').trimEnd();
  let existingSectionLines: string[] = [];

  if (working.includes(LEARNED_HABITS_HEADING)) {
    const idx = working.indexOf(LEARNED_HABITS_HEADING);
    const after = working.slice(idx + LEARNED_HABITS_HEADING.length);
    const nextHeadingMatch = after.match(/\n##\s+/);
    const body = nextHeadingMatch ? after.slice(0, nextHeadingMatch.index) : after;
    existingSectionLines = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  const newEntries: string[] = [];
  for (const habit of cleanedIncoming) {
    const core = habit.replace(/^[-*]\s*/, '').replace(/^\[[^\]]+\]\s*/, '').trim();
    const alreadyExists =
      existingSectionLines.some((line) => line.includes(core)) ||
      newEntries.some((line) => line.includes(core));
    if (!alreadyExists && core.length >= 3) {
      newEntries.push(`- [${dateLabel}] ${core}`);
    }
  }

  if (newEntries.length === 0) {
    return { updated: false, addedCount: 0, personaMd };
  }

  const mergedLines = [...existingSectionLines, ...newEntries].slice(-20);
  const sectionBlock = `${LEARNED_HABITS_HEADING}\n${mergedLines.join('\n')}\n`;

  if (working.includes(LEARNED_HABITS_HEADING)) {
    const idx = working.indexOf(LEARNED_HABITS_HEADING);
    const before = working.slice(0, idx).trimEnd();
    const after = working.slice(idx + LEARNED_HABITS_HEADING.length);
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
    personaMd: working,
  };
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
      summary?: string;
    };
  } catch {
    const objMatch = stripped.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try {
      return JSON.parse(objMatch[0]) as {
        memories?: string[];
        habits?: string[];
        summary?: string;
      };
    } catch {
      return null;
    }
  }
}

/**
 * 执行一次完整的记忆整理、习惯增量沉淀与版本快照存档（支持本地网关 LLM 总结与纯 TS 规则兜底）
 */
export async function consolidatePersonaEvolution(
  slug: string,
  options?: { force?: boolean; reason?: string }
): Promise<EvolutionResult> {
  const persona = await storageRepo.getPersona(slug);
  if (!persona) {
    return {
      evolved: false,
      addedMemories: [],
      addedHabits: [],
      prunedSchedules: 0,
      usedLLM: false,
      summary: '未找到对应角色',
    };
  }

  const [recentMessages, settings] = await Promise.all([
    storageRepo.getConversation(slug, 24),
    storageRepo.getSettings(),
  ]);

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

      const prompt = `请分析以下最近对话与用户纠偏，提炼出值得长期记住的事实记忆，以及该角色在相处中应养成的说话/互动习惯。
只输出严格 JSON，不要额外解释：
{
  "memories": ["简短长期事实或用户偏好（最多 4 条，不要一次性寒暄）"],
  "habits": ["角色相处习惯或口吻微调（最多 3 条）"],
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
              content: '你是结构化记忆与习惯蒸馏助手，只输出合法 JSON。',
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

  const pruned = pruneExpiredScheduleLines(persona.memoriesMd);
  let nextMemoriesMd = pruned.memoriesMd;
  const addedMemories: string[] = [];

  for (const mem of candidateMemories) {
    const merged = mergeMemoryIntoMarkdown(nextMemoriesMd, mem);
    if (merged.updated) {
      nextMemoriesMd = merged.memoriesMd;
      addedMemories.push(mem);
    }
  }

  const habitMerge = mergeLearnedHabitsIntoPersona(
    persona.personaMd,
    candidateHabits
  );
  const addedHabits: string[] = habitMerge.updated
    ? candidateHabits.filter((h) => {
        const core = h.replace(/^[-*]\s*/, '').replace(/^\[[^\]]+\]\s*/, '').trim();
        return !persona.personaMd.includes(core) && habitMerge.personaMd.includes(core);
      })
    : [];

  const hasChanges =
    addedMemories.length > 0 ||
    addedHabits.length > 0 ||
    pruned.prunedCount > 0;

  if (!hasChanges && !options?.force) {
    return {
      evolved: false,
      addedMemories: [],
      addedHabits: [],
      prunedSchedules: 0,
      usedLLM,
      summary: '记忆与习惯已处于最新状态，暂无新增改动',
      persona,
    };
  }

  const reason = options?.reason || '记忆与习惯整理';
  const summaryText =
    llmSummary ||
    `新增 ${addedMemories.length} 条记忆、${addedHabits.length} 条习惯${
      pruned.prunedCount > 0 ? `，归档 ${pruned.prunedCount} 条过期日程` : ''
    }`;

  let snapshotId: string | undefined;
  if (hasChanges) {
    const snap = await storageRepo.createSnapshot(slug, reason, summaryText);
    snapshotId = snap?.id;
    const saved = await storageRepo.savePersona({
      ...persona,
      personaMd: habitMerge.personaMd,
      memoriesMd: nextMemoriesMd,
      updatedAt: new Date().toISOString(),
    });
    return {
      evolved: true,
      snapshotId,
      addedMemories,
      addedHabits,
      prunedSchedules: pruned.prunedCount,
      usedLLM,
      summary: summaryText,
      persona: saved,
    };
  }

  return {
    evolved: false,
    addedMemories: [],
    addedHabits: [],
    prunedSchedules: 0,
    usedLLM,
    summary: '近期对话中暂无新的可沉淀记忆或习惯',
    persona,
  };
}

/**
 * 每累计 8 轮用户对话静默触发一次后台记忆与习惯整理（同轮次防重入）
 */
export async function maybeRunAutoEvolution(slug: string): Promise<boolean> {
  if (process.env.VITEST) return false;
  const allMsgs = await storageRepo.getConversation(slug, 0);
  const userTurnCount = allMsgs.filter((m) => m.role === 'user').length;
  if (userTurnCount <= 0 || userTurnCount % 8 !== 0) {
    return false;
  }

  if (lastEvolvedTurnBySlug.get(slug) === userTurnCount) {
    return false;
  }
  lastEvolvedTurnBySlug.set(slug, userTurnCount);

  const res = await consolidatePersonaEvolution(slug, {
    reason: `第 ${userTurnCount} 轮自动记忆与习惯复盘`,
  });
  return res.evolved;
}
