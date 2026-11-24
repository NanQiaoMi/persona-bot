import { chatCompletion, parseJsonFromLlmOutput, resolveLlmConfig } from '@/lib/llm/client';
import {
  autoPersistTurnMemory,
  extractMemorableFactFromTurn,
} from '@/lib/persona/auto-memory';
import { analyzeUserChatStyle } from '@/lib/persona/style-loop';
import { evaluateLastTurn } from '@/lib/persona/feedback-signals';
import {
  addMemoryWithRetention,
  archiveExpiredSchedules,
  recordRecall,
} from '@/lib/persona/memory-lifecycle';
import {
  extractAppearanceHintFromConversation,
  mergeAppearanceAnchorUpdate,
} from '@/lib/persona/appearance-evolution';
import {
  applySmoothTraitDeltas,
  heuristicTraits,
  NumericTraitKey,
} from '@/lib/persona/traits';
import { admitCandidates, applyTurnQuality, TrialTransition } from '@/lib/persona/trial';
import {
  ensurePersonaSpec,
  LEARNED_HABITS_HEADING,
  STYLE_LOOP_HEADING,
} from '@/lib/persona/spec';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaRecord, SnapshotKind } from '@/lib/storage/types';

export { LEARNED_HABITS_HEADING, STYLE_LOOP_HEADING };

export interface EvolutionResult {
  evolved: boolean;
  snapshotId?: string;
  addedMemories: string[];
  addedHabits: string[];
  addedStyleRules: string[];
  addedPersonalityTags?: string[];
  updatedTraits?: string[];
  updatedAppearanceAnchor?: string;
  prunedSchedules: number;
  usedLLM: boolean;
  /** 被护栏或冲突消解拒绝的候选规则 */
  rejectedRules?: Array<{ text: string; reason: string }>;
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
  const llm = resolveLlmConfig(settings);
  const canCallUpstream = llm.canCall && recentMessages.length > 0;

  let candidateMemories: string[] = [];
  let candidateHabits: string[] = [];
  let candidateStyleRules: string[] = [];
  let candidatePersonalityTags: string[] = [];
  let candidateTraitDeltas: Partial<Record<NumericTraitKey, number>> | undefined;
  let candidateAppearanceUpdate = '';
  let llmSummary = '';
  let usedLLM = false;

  if (canCallUpstream) {
    try {
      const transcript = recentMessages
        .slice(-18)
        .map((m) => `${m.role === 'user' ? '用户' : persona.name}: ${m.content}`)
        .join('\n');

      const correctionsText = (persona.corrections || [])
        .slice(-8)
        .map((c) => `- ${c.correction}`)
        .join('\n');

      const currentTagsText = (persona.profile.personalityTags || []).join('、') || '暂无';
      const currentAppearanceText = persona.profile.appearanceAnchor || '未设定';

      const prompt = `请分析以下最近对话与用户纠偏，同时完成「长期记忆提取」「相处习惯」「对话风格自省改进（去除 AI 味与多余 emoji，贴近当代年轻人微信聊天方式）」「温和人格演进与外貌约定提炼」。
只输出严格 JSON，不要额外解释：
{
  "memories": ["简短长期事实或用户偏好（最多 4 条，不要一次性寒暄）"],
  "habits": ["角色相处习惯（最多 3 条）"],
  "styleRules": ["对比对方说话方式（平均 ${userStyle.avgCharLength} 字、emoji 频率 ${userStyle.emojiPerMsg}）与你的回复，指出哪句太书面/太像AI/emoji太多，并给出下一轮说话方式改进规则（最多 2 条）"],
  "newPersonalityTags": ["从近期互动自然显现的新性格标签（2~6字中文，最多2个，不与已有标签重复）"],
  "traitDeltas": {
    "openness": 0,
    "conscientiousness": 0,
    "extraversion": 0,
    "agreeableness": 0,
    "neuroticism": 0,
    "emotionalStability": 0,
    "recoveryRate": 0
  },
  "appearanceUpdate": "若对话中明确约定或提及角色的新外貌/发型/穿搭特征则给1句简短描述，否则空字符串",
  "summary": "20字以内的本次整理摘要"
}
注意：traitDeltas 仅对本次对话明显体现变化趋势的维度给 [-0.08, 0.08] 之间的微调值，未体现变化填 0 即可。

已有性格标签：${currentTagsText}
已有外貌与画风锚点：${currentAppearanceText}

已有记忆摘要：
${persona.memoriesMd.slice(-600)}

最近纠偏记录：
${correctionsText || '无'}

近期对话：
${transcript}`;

      const content = await chatCompletion(
        llm,
        [
          {
            role: 'system',
            content: '你是结构化记忆与拟人口语自省蒸馏助手，只输出合法 JSON。',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, timeoutMs: 35000 }
      );
      const parsed = parseJsonFromLlmOutput<{
        memories?: unknown[];
        habits?: unknown[];
        styleRules?: unknown[];
        newPersonalityTags?: unknown[];
        traitDeltas?: Record<string, unknown>;
        appearanceUpdate?: unknown;
        summary?: unknown;
      }>(content);
      if (parsed) {
        usedLLM = true;
        const cleanList = (list: unknown, max: number) =>
          Array.isArray(list)
            ? list
                .filter((x): x is string => typeof x === 'string')
                .map((x) => x.trim())
                .filter((x) => x.length >= 4 && x.length <= 120)
                .slice(0, max)
            : [];
        candidateMemories = cleanList(parsed.memories, 5);
        candidateHabits = cleanList(parsed.habits, 4);
        candidateStyleRules = cleanList(parsed.styleRules, 3);
        if (Array.isArray(parsed.newPersonalityTags)) {
          candidatePersonalityTags = parsed.newPersonalityTags
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.replace(/^#+/, '').trim())
            .filter((x) => x.length >= 2 && x.length <= 8)
            .slice(0, 4);
        }
        if (parsed.traitDeltas && typeof parsed.traitDeltas === 'object') {
          const td: Partial<Record<NumericTraitKey, number>> = {};
          for (const key of [
            'openness',
            'conscientiousness',
            'extraversion',
            'agreeableness',
            'neuroticism',
            'emotionalStability',
            'recoveryRate',
          ] as NumericTraitKey[]) {
            const val = parsed.traitDeltas[key];
            if (typeof val === 'number' && Number.isFinite(val) && Math.abs(val) >= 0.01) {
              td[key] = val;
            }
          }
          candidateTraitDeltas = td;
        }
        if (typeof parsed.appearanceUpdate === 'string') {
          candidateAppearanceUpdate = parsed.appearanceUpdate.trim();
        }
        if (typeof parsed.summary === 'string') {
          llmSummary = parsed.summary.trim();
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
  if (!candidateAppearanceUpdate) {
    candidateAppearanceUpdate = extractAppearanceHintFromConversation(recentMessages) || '';
  }
  // 纠偏已作为 locked 条目渲染在 Correction 节，不再复制成「互动风格调整」习惯重复占用 Prompt

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
  let outcome: Omit<EvolutionResult, 'usedLLM' | 'persona' | 'rejectedRules'> | null = null;
  let rejectedRules: Array<{ text: string; reason: string }> = [];
  const saved = await storageRepo.updatePersona(slug, async (fresh) => {
    const pruned = (() => {
      const r = archiveExpiredSchedules(fresh.memoriesMd);
      return { prunedCount: r.archivedCount, memoriesMd: r.memoriesMd };
    })();
    let nextMemoriesMd = pruned.memoriesMd;
    const freshSpec = ensurePersonaSpec(fresh.personaMd, fresh.spec);
    let memoryStats = freshSpec.memoryStats || {};
    const addedMemories: string[] = [];
    for (const mem of candidateMemories) {
      const merged = addMemoryWithRetention(nextMemoriesMd, mem, memoryStats);
      if (merged.updated) {
        nextMemoriesMd = merged.memoriesMd;
        memoryStats = merged.stats;
        addedMemories.push(mem);
      }
    }

    // 新学到的习惯 / 风格规则先经过护栏与冲突消解，再以「试用」状态进入 Prompt
    const source = usedLLM ? 'llm' : 'heuristic';
    const admitted = admitCandidates({ ...freshSpec, memoryStats }, [
      ...candidateHabits.map((text) => ({ kind: 'habit' as const, text, source: source as 'llm' | 'heuristic' })),
      ...candidateStyleRules.map((text) => ({ kind: 'style' as const, text, source: source as 'llm' | 'heuristic' })),
    ]);
    const learnedMerge = { spec: admitted.spec };
    const addedHabits = admitted.trialed.filter((it) => it.kind === 'habit').map((it) => it.text);
    const addedStyleRules = admitted.trialed.filter((it) => it.kind === 'style').map((it) => it.text);
    rejectedRules = admitted.rejected;

    // 1) 增量合并人格指纹标签（只增不删原核心标签，去重且最多保留 10 个）
    const existingTags = Array.isArray(fresh.profile.personalityTags)
      ? fresh.profile.personalityTags
      : [];
    const addedPersonalityTags: string[] = [];
    const nextTags = [...existingTags];
    for (const tag of candidatePersonalityTags) {
      if (addedPersonalityTags.length >= 2 || nextTags.length >= 10) break;
      const norm = tag.toLowerCase();
      if (!nextTags.some((t) => t.trim().toLowerCase() === norm)) {
        nextTags.push(tag);
        addedPersonalityTags.push(tag);
      }
    }

    // 2) 平滑微调大五性格特质（单次 ±0.08 护栏）
    const baseTraits =
      learnedMerge.spec.traits || heuristicTraits(fresh.personaMd, fresh.profile);
    const traitUpdate = applySmoothTraitDeltas(baseTraits, candidateTraitDeltas);
    if (traitUpdate.updated) {
      learnedMerge.spec = {
        ...learnedMerge.spec,
        traits: traitUpdate.traits,
      };
    }

    // 3) 对话外貌锚点渐进补充（受 appearanceAnchorLocked 保护）
    const appearanceMerge = mergeAppearanceAnchorUpdate(
      fresh.profile.appearanceAnchor,
      candidateAppearanceUpdate,
      fresh.profile.appearanceAnchorLocked
    );

    const hasChanges =
      addedMemories.length > 0 ||
      addedHabits.length > 0 ||
      addedStyleRules.length > 0 ||
      addedPersonalityTags.length > 0 ||
      traitUpdate.updated ||
      appearanceMerge.updated ||
      pruned.prunedCount > 0;

    const evolutionState =
      typeof cursor === 'number'
        ? { lastEvolvedUserTurn: cursor, lastEvolvedAt: new Date().toISOString(), pendingSignals: 0 }
        : fresh.evolution;

    if (!hasChanges) {
      outcome = null;
      // 仍需持久化游标，避免重启后重复整理同一轮
      return typeof cursor === 'number' ? { ...fresh, evolution: evolutionState } : null;
    }

    const growthNotes: string[] = [];
    if (addedPersonalityTags.length > 0) {
      growthNotes.push(`新增性格标签「${addedPersonalityTags.join('、')}」`);
    }
    if (traitUpdate.updated) {
      growthNotes.push(`微调性格特质(${traitUpdate.changedKeys.length}项)`);
    }
    if (appearanceMerge.updated) {
      growthNotes.push('更新外貌锚点');
    }

    const baseSummary =
      llmSummary ||
      `新增 ${addedMemories.length} 条记忆，${addedHabits.length} 条习惯与 ${addedStyleRules.length} 条口吻规则进入试用${
        pruned.prunedCount > 0 ? `，归档 ${pruned.prunedCount} 条过期日程` : ''
      }`;
    const summaryText =
      growthNotes.length > 0 ? `${baseSummary}；${growthNotes.join('、')}` : baseSummary;

    const snap = await storageRepo.writeSnapshotFrom(fresh, reason, summaryText, snapshotKind);
    outcome = {
      evolved: true,
      snapshotId: snap.id,
      addedMemories,
      addedHabits,
      addedStyleRules,
      addedPersonalityTags,
      updatedTraits: traitUpdate.changedKeys,
      updatedAppearanceAnchor: appearanceMerge.updated ? appearanceMerge.anchor : undefined,
      prunedSchedules: pruned.prunedCount,
      summary: summaryText,
    };
    return {
      ...fresh,
      profile: {
        ...fresh.profile,
        ...(addedPersonalityTags.length > 0 ? { personalityTags: nextTags } : {}),
        ...(appearanceMerge.updated ? { appearanceAnchor: appearanceMerge.anchor } : {}),
      },
      spec: learnedMerge.spec,
      memoriesMd: nextMemoriesMd,
      evolution: evolutionState,
      updatedAt: new Date().toISOString(),
    };
  });

  if (outcome) {
    return {
      ...(outcome as Omit<EvolutionResult, 'usedLLM' | 'persona' | 'rejectedRules'>),
      usedLLM,
      rejectedRules,
      persona: saved || persona,
    };
  }

  return {
    evolved: false,
    addedMemories: [],
    addedHabits: [],
    addedStyleRules: [],
    prunedSchedules: 0,
    usedLLM,
    rejectedRules,
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

export const QUIET_EVOLUTION_TURNS = 8;
export const SIGNAL_EVOLUTION_TURNS = 3;

/**
 * 信号驱动触发：上次整理后有显式/负面反馈时 3 轮就整理；一切平稳时 8 轮整理一次
 */
export function isEvolutionDue(
  newUserTurns: number,
  pendingSignals: number,
  opts: { quietTurns?: number; signalTurns?: number } = {}
): boolean {
  const quiet = opts.quietTurns ?? QUIET_EVOLUTION_TURNS;
  const signal = opts.signalTurns ?? SIGNAL_EVOLUTION_TURNS;
  return newUserTurns >= quiet || (pendingSignals > 0 && newUserTurns >= signal);
}

export async function maybeRunAutoEvolution(slug: string): Promise<boolean> {
  if (process.env.VITEST) return false;
  return runAutoEvolutionIfDue(slug);
}

/**
 * 判断是否到了自动整理的时机（游标持久化在角色元数据中），到期则执行；可在测试中直接调用
 */
export async function runAutoEvolutionIfDue(
  slug: string,
  opts: { quietTurns?: number; signalTurns?: number; conversationSlug?: string } = {}
): Promise<boolean> {
  if (inFlightEvolution.has(slug)) return false;
  const [allMsgs, persona] = await Promise.all([
    storageRepo.getConversation(opts.conversationSlug || slug, 0),
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
  if (!isEvolutionDue(newUserTurns, persona.evolution?.pendingSignals ?? 0, opts)) {
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

export interface PostTurnLearningResult {
  quality?: number;
  transitions: TrialTransition[];
  signalCounted: boolean;
}

/**
 * 每轮回复落库后执行：用「上一轮回复的风格分 + 用户这句话的反应」推进试用规则状态机，
 * 记录本轮被想起的记忆，并累计反馈信号供信号驱动触发使用
 */
export async function runPostTurnLearning(
  slug: string,
  options: { conversationSlug?: string; recalledMemories?: string[] } = {}
): Promise<PostTurnLearningResult> {
  const messages = await storageRepo.getConversation(options.conversationSlug || slug, 40);
  const turn = evaluateLastTurn(messages);
  const recalled = options.recalledMemories || [];
  const result: PostTurnLearningResult = { transitions: [], signalCounted: false };
  if (!turn && recalled.length === 0) return result;

  await storageRepo.updatePersona(slug, (persona) => {
    let spec = ensurePersonaSpec(persona.personaMd, persona.spec);
    let evolution = persona.evolution;
    if (turn) {
      const applied = applyTurnQuality(spec, turn);
      spec = applied.spec;
      result.quality = turn.quality;
      result.transitions = applied.transitions;
      if (turn.signal.explicit || turn.signal.polarity === 'negative') {
        result.signalCounted = true;
        evolution = {
          lastEvolvedUserTurn: evolution?.lastEvolvedUserTurn ?? 0,
          lastEvolvedAt: evolution?.lastEvolvedAt,
          pendingSignals: (evolution?.pendingSignals ?? 0) + 1,
        };
      }
    }
    if (recalled.length) {
      spec = { ...spec, memoryStats: recordRecall(spec.memoryStats, recalled) };
    }
    return { ...persona, spec, evolution };
  });
  return result;
}

/**
 * 每轮对话结束后的后台学习流水线：沉淀记忆 → 推进试用 → 必要时触发整理
 */
export async function runPostTurnPipeline(params: {
  slug: string;
  conversationSlug: string;
  userText: string;
  reply: string;
  recalledMemories: string[];
}): Promise<void> {
  await autoPersistTurnMemory(params.slug, params.userText, params.reply);
  await runPostTurnLearning(params.slug, {
    conversationSlug: params.conversationSlug,
    recalledMemories: params.recalledMemories,
  });
  // @ 唤起的角色只记忆，不在别的角色的会话里做整理
  if (params.slug === params.conversationSlug) {
    await maybeRunAutoEvolution(params.slug);
  }
}
