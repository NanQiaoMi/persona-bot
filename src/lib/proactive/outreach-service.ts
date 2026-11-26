/**
 * 所有 Bot 主动找你：把调度结果变成真正的消息（按人设生成、写进单聊记录、记一笔发送日志）。
 * - tick：应用开着时的例行检查，最多一个人来找你
 * - catchup：离开几小时后打开，补上「你不在时」最多两条（时间落在空档里）
 */
import { generateProactiveMessage } from '@/lib/grok/proactive-engine';
import { resolveLlmConfig } from '@/lib/llm/client';
import { getPresenceState } from '@/lib/persona/daily-rhythm';
import { getDueTopics, markAskedTopics } from '@/lib/persona/pending-topics';
import {
  decideOutreachCatchup,
  decideOutreachTick,
  OutreachCandidate,
  OutreachPick,
  pruneLog,
} from '@/lib/proactive/scheduler';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage, PersonaRecord } from '@/lib/storage/types';

export type OutreachMode = 'tick' | 'catchup';

export interface OutreachSent {
  slug: string;
  name: string;
  message: ConversationMessage;
}

// 同一进程里多个标签页同时来问，也只排队跑一次
let chain: Promise<unknown> = Promise.resolve();

export function runOutreach(params: {
  mode: OutreachMode;
  activeSlug?: string;
  now?: Date;
  random?: () => number;
}): Promise<OutreachSent[]> {
  const next = chain.then(() => runOutreachInner(params));
  chain = next.catch(() => undefined);
  return next;
}

async function buildCandidate(persona: PersonaRecord, now: Date): Promise<OutreachCandidate> {
  const history = await storageRepo.getConversation(persona.slug, 4);
  const last = history[history.length - 1];
  const memoryState = await storageRepo.getMemoryState(persona.slug);
  return {
    slug: persona.slug,
    name: persona.name,
    intimacy: persona.intimacy,
    arousal: persona.emotionState?.arousal,
    pleasure: persona.emotionState?.pleasure,
    availability: getPresenceState(persona, now).availability,
    availabilityAt: (d: Date) => getPresenceState(persona, d).availability,
    lastMessageAt: last?.timestamp,
    awaitingReplyToProactive: Boolean(last && last.role === 'assistant' && last.proactive),
    hasDueTopic: getDueTopics(memoryState.pendingTopics || [], now).length > 0,
    optedOut: persona.profile.allowProactive === false,
  };
}

async function runOutreachInner(params: {
  mode: OutreachMode;
  activeSlug?: string;
  now?: Date;
  random?: () => number;
}): Promise<OutreachSent[]> {
  const now = params.now ?? new Date();
  const state = await storageRepo.getOutreachState();
  const personas = (await storageRepo.listPersonas()).filter((p) => !p.isMaster && p.slug !== 'master-bot');
  const records = (await Promise.all(personas.map((p) => storageRepo.getPersona(p.slug)))).filter(
    (p): p is PersonaRecord => Boolean(p)
  );
  const candidates = await Promise.all(records.map((p) => buildCandidate(p, now)));

  let picks: OutreachPick[] = [];
  if (params.mode === 'catchup') {
    picks = decideOutreachCatchup({ candidates, state, now, activeSlug: params.activeSlug, random: params.random });
  } else {
    const pick = decideOutreachTick({ candidates, state, now, activeSlug: params.activeSlug, random: params.random });
    picks = pick ? [pick] : [];
  }

  const sent: OutreachSent[] = [];
  if (picks.length > 0) {
    const settings = await storageRepo.getSettings();
    const llm = resolveLlmConfig(settings);
    for (const pick of picks) {
      const persona = records.find((p) => p.slug === pick.slug);
      if (!persona) continue;
      try {
        const message = await composeAndSave(persona, pick.at, params.mode, llm);
        sent.push({ slug: persona.slug, name: persona.name, message });
      } catch (err) {
        console.error('Outreach compose failed:', persona.slug, err);
      }
    }
  }

  await storageRepo.updateOutreachState((cur) => ({
    log: pruneLog([...cur.log, ...sent.map((s) => ({ slug: s.slug, at: s.message.timestamp }))], now),
    lastSeenAt: now.toISOString(),
  }));
  return sent;
}

async function composeAndSave(
  persona: PersonaRecord,
  at: Date,
  mode: OutreachMode,
  llm: ReturnType<typeof resolveLlmConfig>
): Promise<ConversationMessage> {
  const history = await storageRepo.getConversation(persona.slug, 8);
  const last = history[history.length - 1];
  const hours = last?.timestamp
    ? Math.max(0, (at.getTime() - new Date(last.timestamp).getTime()) / 3_600_000)
    : 8;

  // 情境：TA 那会儿在做什么、你之前提过该问结果的事
  const presence = getPresenceState(persona, at);
  const extraContext: string[] = [
    `你此刻${presence.activity}${presence.availability === 'busy' ? '（在忙，抽空发的）' : ''}，是你自己想起对方、主动发的消息，不是回复`,
  ];
  const memoryState = await storageRepo.getMemoryState(persona.slug);
  const dueTopics = getDueTopics(memoryState.pendingTopics || [], at);
  if (dueTopics.length > 0) {
    extraContext.push(
      `对方之前说过「${dueTopics[0].snippet}」（${dueTopics[0].label}），现在应该有结果了，可以借这个由头关心一句`
    );
  }

  const result = await generateProactiveMessage(
    persona,
    {
      kind: 'greeting',
      hoursSinceLastChat: hours,
      currentHour: at.getHours(),
      recentMessages: history,
      extraContext,
    },
    llm
  );

  const message: ConversationMessage = {
    id: `msg_${at.getTime()}_outreach_${persona.slug}`,
    role: 'assistant',
    content: result.content,
    timestamp: at.toISOString(),
    thought: result.thought,
    mood: result.moodLabel,
    bursts: result.bursts,
    intimacyChange: result.intimacyChange,
    modelUsed: result.source === 'llm' ? result.modelUsed : '离线演示',
    proactive: mode,
  };

  const newIntimacy = Math.max(0, Math.min(100, persona.intimacy + result.intimacyChange));
  await storageRepo.updateEmotionAndIntimacy(persona.slug, result.emotionState, newIntimacy);
  await storageRepo.appendMessages(persona.slug, [message]);
  if (dueTopics.length > 0) {
    await storageRepo.updateMemoryState(persona.slug, (s) => ({
      ...s,
      pendingTopics: markAskedTopics(s.pendingTopics || [], message.content, at),
    }));
  }
  return message;
}
