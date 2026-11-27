/**
 * 主动消息（不再按角色名写死模板）：
 * - 有模型时：用角色自己的完整人设提示词 + 当下情境（时段、多久没聊、上次聊到哪、第几次轻敲）让模型写
 * - 没模型或调用失败时：按角色的聊天模式 × 场景从离线话术库里挑，按「角色 + 日期 + 时段」稳定挑选，
 *   不同角色、不同日子说的不一样
 */
import { buildSulkingDirective } from '@/lib/emotion/sulking';
import { PROACTIVE_LINES } from '@/lib/grok/proactive-lines';
import type { ProactiveLine, ProactiveSituation } from '@/lib/grok/proactive-types';
import { parseStructuredModelOutput } from '@/lib/grok/stream-orchestrator';
import { chatCompletion, LlmConfig } from '@/lib/llm/client';
import { fingerprintFromPersonaMd } from '@/lib/persona/fingerprint';
import { buildMindCognitiveDirective, resolvePersonaMind } from '@/lib/persona/mind';
import { blendStyle } from '@/lib/persona/style-blend';
import { buildTraitsBehaviorDirective, resolvePersonalityTraits } from '@/lib/persona/traits';
import { PromptAssembler } from '@/lib/prompt-assembler';
import {
  ConversationMessage,
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRecord,
} from '@/lib/storage/types';

export interface ProactiveGreetingResult {
  thought: string;
  content: string;
  bursts: string[];
  moodLabel: string;
  emotionState: PersonaEmotionSnapshot;
  intimacyChange: number;
  timeContextLabel: string;
  situation: ProactiveSituation;
  /** 'llm' 表示由模型按人设生成，'offline' 表示离线话术 */
  source: 'llm' | 'offline';
  modelUsed?: string;
}

export function getTimePeriodInfo(hour: number): {
  period: 'late_night' | 'morning' | 'afternoon' | 'evening';
  label: string;
} {
  if (hour >= 0 && hour < 6) {
    return { period: 'late_night', label: '凌晨夜猫子时段 🌙' };
  }
  if (hour >= 6 && hour < 12) {
    return { period: 'morning', label: '清晨破冰时段 ☀️' };
  }
  if (hour >= 12 && hour < 18) {
    return { period: 'afternoon', label: '午后摸鱼时段 ☕' };
  }
  return { period: 'evening', label: '夜晚放松时段 🌆' };
}

export interface ProactiveRequest {
  kind: 'greeting' | 'idle';
  hoursSinceLastChat?: number;
  currentHour?: number;
  /** 对方没回的秒数（idle 时） */
  idleSeconds?: number;
  /** 第几次轻敲（idle 时） */
  nudgeCount?: number;
  /** 最近的聊天记录，用于接上话题 */
  recentMessages?: ConversationMessage[];
  /** 额外情境（如角色此刻在做什么、对方之前提过的事），每条一句 */
  extraContext?: string[];
  now?: Date;
}

export function resolveProactiveSituation(req: ProactiveRequest): ProactiveSituation {
  if (req.kind === 'idle') return (req.nudgeCount ?? 1) >= 2 ? 'idle_nudge_2' : 'idle_nudge_1';
  if ((req.hoursSinceLastChat ?? 0) >= 6) return 'long_idle';
  return getTimePeriodInfo(req.currentHour ?? new Date().getHours()).period;
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeMode(mode: string | undefined): PersonaMode {
  return mode === 'fun' || mode === 'companion' || mode === 'analytical' ? mode : 'authentic';
}

/** 上次聊到的话题：取最近一条有内容的消息里的一小段，用于「刚才说的那事」 */
export function extractRecentTopic(messages: ConversationMessage[] | undefined): string {
  const last = [...(messages || [])].reverse().find((m) => (m.content || '').trim().length >= 4);
  if (!last) return '';
  const firstClause = last.content.split(/[，。！？,.!?\n]/).map((s) => s.trim()).find((s) => s.length >= 2) || '';
  return firstClause.length > 12 ? `${firstClause.slice(0, 12)}…` : firstClause;
}

function fillPlaceholders(text: string, vars: { hours: number; hour: number; topic: string }): string {
  return text
    .replace(/\{hours\}/g, String(Math.max(1, Math.round(vars.hours))))
    .replace(/\{hour\}/g, String(vars.hour))
    .replace(/\{topic\}/g, vars.topic || '刚才那事');
}

function applyEmotion(persona: PersonaRecord, pleasureDelta: number, moodLabel: string): PersonaEmotionSnapshot {
  return {
    ...persona.emotionState,
    pleasure: Math.max(
      -1,
      Math.min(1, Number((persona.emotionState.pleasure + pleasureDelta).toFixed(2)))
    ),
    moodLabel,
    lastUpdated: new Date().toISOString(),
  };
}

/** 离线兜底：按模式 × 场景挑一条话术 */
export function pickOfflineProactiveLine(
  persona: Pick<PersonaRecord, 'slug' | 'defaultMode'>,
  situation: ProactiveSituation,
  options: { topic?: string; now?: Date } = {}
): ProactiveLine {
  const pool = PROACTIVE_LINES[normalizeMode(persona.defaultMode)][situation];
  // 没有话题可接时，不用带 {topic} 的句子
  const usable = options.topic ? pool : pool.filter((l) => !l.bursts.some((b) => b.includes('{topic}')));
  const candidates = usable.length > 0 ? usable : pool;
  const now = options.now || new Date();
  const seed = `${persona.slug}|${now.getFullYear()}-${now.getMonth()}-${now.getDate()}|${now.getHours()}|${situation}`;
  return candidates[hashString(seed) % candidates.length];
}

/** 兼容旧接口：同步生成离线主动招呼 */
export function generateProactiveGreeting(
  persona: PersonaRecord,
  hoursSinceLastChat = 0,
  currentHour = new Date().getHours()
): ProactiveGreetingResult {
  return buildOfflineResult(persona, {
    kind: 'greeting',
    hoursSinceLastChat,
    currentHour,
  });
}

function buildOfflineResult(persona: PersonaRecord, req: ProactiveRequest): ProactiveGreetingResult {
  const situation = resolveProactiveSituation(req);
  const hour = req.currentHour ?? (req.now || new Date()).getHours();
  const topic = extractRecentTopic(req.recentMessages);
  const line = pickOfflineProactiveLine(persona, situation, { topic, now: req.now });
  const vars = { hours: req.hoursSinceLastChat ?? 0, hour, topic };
  const bursts = line.bursts.map((b) => fillPlaceholders(b, vars));
  const thought = fillPlaceholders(line.thought, vars);
  return {
    thought,
    content: bursts.join('\n'),
    bursts,
    moodLabel: line.mood,
    emotionState: applyEmotion(persona, line.pleasureDelta ?? 0.05, line.mood),
    intimacyChange: line.intimacyChange ?? 1,
    timeContextLabel: getTimePeriodInfo(hour).label,
    situation,
    source: 'offline',
  };
}

/** 给模型的情境说明 */
export function buildProactiveInstruction(req: ProactiveRequest, situation: ProactiveSituation): string {
  const hour = req.currentHour ?? (req.now || new Date()).getHours();
  const hours = Math.round(req.hoursSinceLastChat ?? 0);
  const topic = extractRecentTopic(req.recentMessages);
  const base: Record<ProactiveSituation, string> = {
    long_idle: `你们已经大约 ${hours} 个小时没聊了，现在是 ${hour} 点。你想主动找对方说句话：可以随手分享自己刚遇到的小事、接上之前聊过的话题，或者找个自然的由头敲一下。`,
    late_night: `现在是凌晨 ${hour} 点，你想主动给对方发条消息。`,
    morning: `现在是早上 ${hour} 点，你想主动给对方发条消息，像朋友早上随手聊一句。`,
    afternoon: `现在是下午 ${hour} 点，你想主动给对方发条消息，像朋友摸鱼时随手聊一句。`,
    evening: `现在是晚上 ${hour} 点，你想主动给对方发条消息。`,
    idle_nudge_1: `你们刚才还在聊${topic ? `（聊到「${topic}」）` : ''}，对方已经大约 ${Math.round(req.idleSeconds ?? 45)} 秒没回你了。紧接着刚才的话题自然地追一句或轻轻敲一下，别重复你上一句的原话。`,
    idle_nudge_2: `对方已经好一会儿没回了（这是你第 ${req.nudgeCount ?? 2} 次找 TA）。大方地放 TA 去忙，或者分享一句你自己在干嘛，别显得焦虑、别催、别让人有负担。`,
  };
  return [
    '[情境提示，不是对方说的话]',
    base[situation],
    ...(req.extraContext || []).filter(Boolean).map((c) => `- ${c}`),
    '要求：完全用你自己的性格和说话习惯；1~2 条短消息，用 [BURST] 分开；不要客服腔、不要「在吗」开头、不要输出 <thought>；可以在最前面加 [MOOD: 4~6 字心情]。',
  ].join('\n');
}

/**
 * 生成主动消息：有模型就按人设让模型写，失败或没模型时走离线话术。永不抛错。
 */
export async function generateProactiveMessage(
  persona: PersonaRecord,
  req: ProactiveRequest,
  llm?: LlmConfig | null
): Promise<ProactiveGreetingResult> {
  const situation = resolveProactiveSituation(req);
  const offline = buildOfflineResult(persona, req);
  if (!llm?.canCall) return offline;

  try {
    const recent = (req.recentMessages || []).slice(-6);
    const traits = resolvePersonalityTraits(persona);
    const temperament = persona.spec?.temperament;
    const mind = resolvePersonaMind(persona);
    const sulkingLevel = persona.emotionState?.sulking?.level ?? 0;
    const blendedStyle = blendStyle(
      persona.spec?.fingerprint ?? fingerprintFromPersonaMd(persona.personaMd),
      recent.filter((m) => m.role === 'user').map((m) => m.content),
      persona.defaultMode
    );
    const systemPrompt = new PromptAssembler().assembleFromRecord(persona, {
      mode: persona.defaultMode,
      thinkMode: false,
      lastUserMessage: recent[recent.length - 1]?.content || '',
      blendedStyle,
      traitsDirective: buildTraitsBehaviorDirective(traits),
      mindDirective: buildMindCognitiveDirective(mind, temperament),
      sulkingDirective: buildSulkingDirective(
        persona.emotionState?.sulking,
        traits,
        false,
        persona.personaMd,
        temperament
      ),
      sulkingLevel,
    });
    const raw = await chatCompletion(
      llm,
      [
        { role: 'system', content: systemPrompt },
        ...recent.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: buildProactiveInstruction(req, situation) },
      ],
      { temperature: 0.85, timeoutMs: 20000 }
    );
    if (!raw.trim()) return offline;
    const parsed = parseStructuredModelOutput(raw);
    const bursts = parsed.bursts.slice(0, 2);
    if (bursts.length === 0) return offline;
    const moodLabel = parsed.mood || offline.moodLabel;
    return {
      ...offline,
      // 在线模型生成主动消息时禁止拼装无关的离线模板内心戏
      thought: parsed.thought || '',
      bursts,
      content: bursts.join('\n'),
      moodLabel,
      emotionState: applyEmotion(persona, 0.05, moodLabel),
      source: 'llm',
      modelUsed: llm.model,
    };
  } catch {
    return offline;
  }
}
