/**
 * 群聊编排：一轮用户消息 → 调度器选出发言人 → 依次生成（每人都能看到前面的人刚说了什么）
 * → 角色之间按需互相接话（有轮数上限）→ 以多气泡 SSE 事件推给前端 → 写入群聊记录。
 * 未配置模型时走离线群聊话术，保证零配置可演示。
 */
import { getMascotConfigForPersona } from '@/components/workspace/mascot-palette';
import {
  buildGroupSystemDirective,
  buildGroupTranscriptForSpeaker,
  GROUP_MAX_BOT_CHAIN,
  pickReactor,
  pickSpeakers,
} from '@/lib/group/director';
import { synthesizeGroupFallbackReply } from '@/lib/group/fallback';
import {
  computeRealisticTypingDelayMs,
  executeGrokChatTurn,
  StreamEvent,
} from '@/lib/grok/stream-orchestrator';
import { resolveLlmConfig } from '@/lib/llm/client';
import { storageRepo } from '@/lib/storage/repository';
import {
  ConversationMessage,
  GroupChat,
  PersonaMode,
  PersonaRecord,
} from '@/lib/storage/types';

export interface GroupTurnRequest {
  groupId: string;
  /** 用户这轮说的话；kickoff 时可为空 */
  userText?: string;
  /** 用户连发的几条（合并成一轮）；提供时优先于 userText */
  userTurns?: Array<{ content: string; imageUrl?: string; timestamp?: string }>;
  imageUrl?: string;
  timestamp?: string;
  mode?: PersonaMode;
  modelId?: string;
  /** 群刚建好：由主 bot 发开场白，再让成员接话 */
  kickoff?: boolean;
}

const USER_LABEL = '我（群主）';

function sleep(ms: number): Promise<void> {
  if (process.env.VITEST || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function botMeta(persona: Pick<PersonaRecord, 'slug' | 'name' | 'profile'>, idx = 0) {
  const m = getMascotConfigForPersona(persona.slug, persona.profile, idx);
  return { slug: persona.slug, name: persona.name, shape: m.shape, color: m.color };
}

/** 群聊里去掉单聊专属的标签与多余空白，只保留 1~2 条短消息 */
function normalizeGroupBursts(bursts: string[] | undefined, content: string): string[] {
  const source = bursts && bursts.length > 0 ? bursts : content.split(/\n{2,}/);
  return source
    .map((b) => b.replace(/\[(?:FOLLOWUP|EARLY|PHOTO|VOICE)[^\]]*\]/gi, '').trim())
    .filter(Boolean)
    .slice(0, 2);
}

export class GroupNotFoundError extends Error {
  constructor(id: string) {
    super(`群聊不存在：${id}`);
  }
}

export async function executeGroupTurn(
  req: GroupTurnRequest,
  onEvent?: (event: StreamEvent) => void
): Promise<ConversationMessage[]> {
  const group = await storageRepo.getGroup(req.groupId);
  if (!group) throw new GroupNotFoundError(req.groupId);

  const members = (
    await Promise.all(group.memberSlugs.map((slug) => storageRepo.getPersona(slug)))
  ).filter((p): p is PersonaRecord => Boolean(p));
  const metaBySlug = new Map(members.map((m, i) => [m.slug, botMeta(m, i)]));

  const history = await storageRepo.getGroupConversation(group.id, 0);
  const newMessages: ConversationMessage[] = [];
  const baseTs = Date.now();
  let seq = 0;
  const nextId = (suffix: string) => `gmsg_${baseTs}_${seq++}_${suffix}`;

  let triggerText = (req.userText || '').trim();
  let triggerSpeakerName = USER_LABEL;

  if (req.kickoff) {
    const master = await storageRepo.getPersona('master-bot');
    const opening = group.topic
      ? `把你们拉进来了，聊聊：${group.topic}`
      : `把你们拉进来了，大家先打个招呼～`;
    const masterMsg: ConversationMessage = {
      id: nextId('master'),
      role: 'assistant',
      content: opening,
      timestamp: new Date().toISOString(),
      fromBot: master ? botMeta(master) : { slug: 'master-bot', name: '主 bot' },
      bursts: [opening],
    };
    newMessages.push(masterMsg);
    history.push(masterMsg);
    onEvent?.({ type: 'message_part', message: masterMsg, index: 0, total: 1, hasMore: true });
    triggerText = opening;
    triggerSpeakerName = masterMsg.fromBot?.name || '主 bot';
  } else {
    const turns = (req.userTurns && req.userTurns.length > 0
      ? req.userTurns
      : [{ content: triggerText, imageUrl: req.imageUrl, timestamp: req.timestamp }]
    ).filter((t) => (t.content || '').trim() || t.imageUrl);
    if (turns.length === 0) {
      throw new Error('群聊消息不能为空');
    }
    for (const t of turns) {
      const userMsg: ConversationMessage = {
        id: nextId('user'),
        role: 'user',
        content: (t.content || '').trim() || '[图片]',
        timestamp: t.timestamp || new Date().toISOString(),
        imageUrl: t.imageUrl,
        mode: req.mode,
      };
      newMessages.push(userMsg);
      history.push(userMsg);
    }
    // 连发的几条一起作为本轮话题，决定谁来接
    triggerText = turns.map((t) => (t.content || '').trim()).filter(Boolean).join('\n');
  }

  if (members.length === 0) {
    await persist(group, newMessages);
    const last = newMessages[newMessages.length - 1];
    onEvent?.({ type: 'done', message: last, messages: newMessages });
    return newMessages;
  }

  const settings = await storageRepo.getSettings();
  const canCallUpstream = resolveLlmConfig(settings, { model: req.modelId }).canCall;

  const speakers = req.kickoff
    ? pickSpeakers({ text: '大家', members, history, maxSpeakers: Math.min(3, members.length) })
    : pickSpeakers({ text: triggerText, members, history });

  const spokenThisRound: string[] = [];
  const queue: Array<{ persona: PersonaRecord; replyTo?: { name: string; text: string }; isReaction: boolean; chainDepth: number }> =
    speakers.map((p) => ({ persona: p, isReaction: false, chainDepth: 0 }));
  const maxTurns = speakers.length + GROUP_MAX_BOT_CHAIN;
  let turnsDone = 0;

  while (queue.length > 0 && turnsDone < maxTurns) {
    const item = queue.shift()!;
    const { persona } = item;
    const meta = metaBySlug.get(persona.slug) || botMeta(persona);
    onEvent?.({ type: 'status', text: `${persona.name} 正在输入...` });

    const bursts = await generateMemberReply({
      group,
      persona,
      members,
      history,
      canCallUpstream,
      req,
      replyTo: item.replyTo,
      isReaction: item.isReaction,
      triggerText: item.replyTo?.text || triggerText,
      triggerSpeakerName: item.replyTo?.name || triggerSpeakerName,
    });

    for (let i = 0; i < bursts.length; i += 1) {
      const text = bursts[i];
      await sleep(computeRealisticTypingDelayMs(text, turnsDone === 0 && i === 0 ? 0 : 1));
      const msg: ConversationMessage = {
        id: nextId(persona.slug),
        role: 'assistant',
        content: text,
        timestamp: new Date().toISOString(),
        fromBot: meta,
        mode: persona.defaultMode,
        bursts: [text],
        isDemoMode: canCallUpstream ? undefined : true,
      };
      newMessages.push(msg);
      history.push(msg);
      onEvent?.({
        type: 'message_part',
        message: msg,
        index: newMessages.length - 1,
        total: newMessages.length,
        hasMore: true,
      });
    }
    spokenThisRound.push(persona.slug);
    turnsDone += 1;

    // 角色之间顺势接话（被点名必接，否则小概率插话），连锁轮数有上限
    const lastText = bursts.join(' ');
    const reactor = pickReactor({
      lastSpeakerSlug: persona.slug,
      lastText,
      members: members.filter((m) => !queue.some((q) => q.persona.slug === m.slug)),
      spokenThisRound,
      chainDepth: item.chainDepth,
    });
    if (reactor && lastText) {
      queue.push({
        persona: reactor,
        replyTo: { name: persona.name, text: lastText },
        isReaction: true,
        chainDepth: item.chainDepth + 1,
      });
    }
  }

  await persist(group, newMessages);
  const last = newMessages[newMessages.length - 1];
  onEvent?.({ type: 'done', message: last, messages: newMessages });
  return newMessages;
}

async function persist(group: GroupChat, newMessages: ConversationMessage[]): Promise<void> {
  if (newMessages.length === 0) return;
  await storageRepo.appendGroupMessages(group.id, newMessages);
  const last = newMessages[newMessages.length - 1];
  const prefix = last.fromBot?.name ? `${last.fromBot.name}：` : '';
  await storageRepo.updateGroup(group.id, {
    pendingKickoff: false,
    lastMessage: `${prefix}${last.content}`.slice(0, 60),
  });
}

async function generateMemberReply(params: {
  group: GroupChat;
  persona: PersonaRecord;
  members: PersonaRecord[];
  history: ConversationMessage[];
  canCallUpstream: boolean;
  req: GroupTurnRequest;
  replyTo?: { name: string; text: string };
  isReaction: boolean;
  triggerText: string;
  triggerSpeakerName: string;
}): Promise<string[]> {
  const { group, persona, members, history, canCallUpstream, req } = params;

  const offline = () =>
    synthesizeGroupFallbackReply({
      speaker: {
        slug: persona.slug,
        name: persona.name,
        defaultMode: persona.defaultMode,
        profile: persona.profile,
      },
      triggerText: params.triggerText,
      triggerSpeakerName: params.triggerSpeakerName,
      isReaction: params.isReaction,
      isKickoff: Boolean(req.kickoff) && !params.isReaction,
      topic: group.topic,
      seed: hashSeed(`${history.length}:${persona.slug}`),
    });

  if (!canCallUpstream) return offline();

  try {
    const directive = buildGroupSystemDirective({
      groupName: group.name,
      topic: group.topic,
      speakerName: persona.name,
      otherMemberNames: members.filter((m) => m.slug !== persona.slug).map((m) => m.name),
      replyTo: params.replyTo,
      isKickoff: Boolean(req.kickoff) && !params.isReaction,
    });
    const transcript = buildGroupTranscriptForSpeaker(history, persona.slug, {
      userName: USER_LABEL,
    });
    const result = await executeGrokChatTurn({
      slug: persona.slug,
      messages: transcript.map((t) => ({ ...t, timestamp: new Date().toISOString() })),
      mode: persona.defaultMode,
      thinkMode: false,
      deepSearch: false,
      requestPhoto: false,
      requestSticker: false,
      modelId: req.modelId,
      skipPersistence: true,
      extraSystemPrompt: directive,
    });
    if (result.isDemoMode) {
      console.warn(`[group] ${persona.slug} 模型未返回有效回复，改用离线群聊话术`);
      return offline();
    }
    const bursts = normalizeGroupBursts(result.bursts, result.content);
    return bursts.length > 0 ? bursts : offline();
  } catch (err) {
    console.warn(`[group] ${persona.slug} 生成失败，改用离线群聊话术：`, err);
    return offline();
  }
}
