/**
 * 群聊编排：一轮用户消息 → 调度器选出发言人 → 依次生成（每人都能看到前面的人刚说了什么）
 * → 角色之间按需互相接话（有轮数上限）→ 以多气泡 SSE 事件推给前端 → 写入群聊记录。
 * 未配置模型时走离线群聊话术，保证零配置可演示。
 */
import { getMascotConfigForPersona } from '@/components/workspace/mascot-palette';
import {
  buildGroupAntiEchoDirective,
  buildGroupSystemDirective,
  collectGroupPeerBubbles,
  collectRoundOpeners,
  buildGroupTranscriptForSpeaker,
  GROUP_MAX_BOT_CHAIN,
  pickReactor,
  pickSpeakers,
  stripEchoedOpener,
} from '@/lib/group/director';
import { synthesizeGroupFallbackReply } from '@/lib/group/fallback';
import {
  computeRealisticTypingDelayMs,
  executeGrokChatTurn,
  StreamEvent,
} from '@/lib/grok/stream-orchestrator';
import { QUICK_REACTIONS } from '@/lib/group/ambient-lines';
import { resolveLlmConfig } from '@/lib/llm/client';
import { getPresenceState } from '@/lib/persona/daily-rhythm';
import { storageRepo } from '@/lib/storage/repository';
import {
  ConversationMessage,
  GroupChat,
  MediaCard,
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
  /** 这轮结束后有人只丢一句附和的概率（测试可设为 0 或 1），默认 0.2 */
  reactionChance?: number;
  /** 按这个时刻判断谁醒着（测试用），默认现在 */
  now?: Date;
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 模型会模仿上下文里「名字：内容」的格式，给自己的话也加上名字前缀。
 * 这里认出本人的全名，以及空格前的第一段名字（如「陆凛 Zero」→「陆凛」），全角/半角冒号都算。
 */
function buildSelfPrefixPattern(speakerName?: string): RegExp | null {
  const full = (speakerName || '').trim();
  if (!full) return null;
  const variants = new Set<string>([full]);
  const first = full.split(/\s+/)[0];
  if (first) variants.add(first);
  const alts = [...variants]
    .sort((a, b) => b.length - a.length)
    .map((v) => escapeRegExp(v).replace(/\s+/g, '\\s*'));
  return new RegExp(`^\\s*(?:${alts.join('|')})\\s*[：:]\\s*`);
}

/** 去掉一个气泡里的本人名字前缀；多行都带前缀时拆成多个气泡 */
function stripSelfPrefix(bubble: string, pattern: RegExp | null): string[] {
  if (!pattern) return [bubble];
  const lines = bubble.split('\n');
  const prefixedCount = lines.filter((l) => pattern.test(l)).length;
  if (prefixedCount === 0) return [bubble];
  if (prefixedCount === 1) {
    return [lines.map((l) => l.replace(pattern, '')).join('\n')];
  }
  const segments: string[] = [];
  for (const line of lines) {
    if (pattern.test(line) || segments.length === 0) {
      segments.push(line.replace(pattern, ''));
    } else {
      segments[segments.length - 1] += `\n${line}`;
    }
  }
  return segments;
}

/** 群聊里去掉单聊专属的标签、本人名字前缀与多余空白，只保留 1~2 条短消息 */
export function normalizeGroupBursts(
  bursts: string[] | undefined,
  content: string,
  speakerName?: string
): string[] {
  const source = bursts && bursts.length > 0 ? bursts : content.split(/\n{2,}/);
  const selfPrefix = buildSelfPrefixPattern(speakerName);
  return source
    .map((b) =>
      b
        .replace(/\[(?:FOLLOWUP|EARLY|PHOTO|VOICE)[^\]]*\]/gi, '')
        // 模型偶尔用全角括号写标签（【STICKER: …】）或留下孤立的「】【」
        .replace(/【\s*(?:STICKER|PHOTO|VOICE|MOOD|BURST|FOLLOWUP|EARLY)[^】]*】/gi, '')
        .replace(/[【】]+(?=[。！？!?~～]*$)/g, '')
        .replace(/】\s*【/g, '')
        .trim()
    )
    .flatMap((b) => stripSelfPrefix(b, selfPrefix))
    .map((b) => b.trim())
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
    await storageRepo.appendGroupMessages(group.id, [masterMsg]);
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
      // 每条一产生就存：你中途切走也不会丢
      await storageRepo.appendGroupMessages(group.id, [userMsg]);
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

  // 此刻谁醒着、谁在忙：睡着的人不主动回，忙的人少回
  const availability = new Map(
    members.map((m) => [m.slug, getPresenceState(m, req.now ?? new Date()).availability])
  );
  const availabilityOf = (slug: string) => availability.get(slug) || 'free';

  const speakers = req.kickoff
    ? pickSpeakers({ text: '大家', members, history, maxSpeakers: Math.min(3, members.length) })
    : pickSpeakers({ text: triggerText, members, history, availabilityOf });

  const spokenThisRound: string[] = [];
  // 一轮最多一张照片 / 表情包，避免每个人都刷图
  let visualUsed = false;
  const queue: Array<{
    persona: PersonaRecord;
    replyTo?: { name: string; text: string; id?: string };
    isReaction: boolean;
    chainDepth: number;
  }> =
    speakers.map((p) => ({ persona: p, isReaction: false, chainDepth: 0 }));
  const maxTurns = speakers.length + GROUP_MAX_BOT_CHAIN;
  let turnsDone = 0;

  while (queue.length > 0 && turnsDone < maxTurns) {
    const item = queue.shift()!;
    const { persona } = item;
    const meta = metaBySlug.get(persona.slug) || botMeta(persona);
    onEvent?.({ type: 'status', text: `${persona.name} 正在输入...` });
    let memberMedia: MediaCard[] = [];

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
      thisRoundIds: newMessages.map((m) => m.id),
      onMedia: (cards) => {
        memberMedia = cards;
      },
    });
    const roundCards = !visualUsed && canCallUpstream && memberMedia.length > 0 ? memberMedia.slice(0, 1) : [];
    if (roundCards.length > 0) visualUsed = true;

    // 接的不是紧挨着的上一条时，像微信一样引用那条
    const lastInHistory = history[history.length - 1];
    const quote =
      item.replyTo?.id && lastInHistory && lastInHistory.id !== item.replyTo.id
        ? { id: item.replyTo.id, name: item.replyTo.name, text: item.replyTo.text.slice(0, 40) }
        : undefined;
    let lastMsgId = '';

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
        quote: i === 0 ? quote : undefined,
        // 照片 / 表情包挂在这位成员的最后一条气泡上
        mediaCards: i === bursts.length - 1 && roundCards.length > 0 ? roundCards : undefined,
        isDemoMode: canCallUpstream ? undefined : true,
      };
      lastMsgId = msg.id;
      newMessages.push(msg);
      // 每条一产生就存：你中途切走也不会丢
      await storageRepo.appendGroupMessages(group.id, [msg]);
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
      members: members.filter(
        (m) => !queue.some((q) => q.persona.slug === m.slug) && availabilityOf(m.slug) !== 'asleep'
      ),
      spokenThisRound,
      chainDepth: item.chainDepth,
    });
    if (reactor && lastText) {
      queue.push({
        persona: reactor,
        replyTo: { name: persona.name, text: lastText, id: lastMsgId },
        isReaction: true,
        chainDepth: item.chainDepth + 1,
      });
    }
  }

  // 偶尔有个醒着、这轮没说话的人只丢一句「+1 / 哈哈哈」，不调用模型
  const quiet = members.filter(
    (m) => !spokenThisRound.includes(m.slug) && availabilityOf(m.slug) === 'free'
  );
  if (!req.kickoff && quiet.length > 0 && Math.random() < (req.reactionChance ?? 0.2)) {
    const reactor = quiet[Math.floor(Math.random() * quiet.length) % quiet.length];
    const text = QUICK_REACTIONS[Math.floor(Math.random() * QUICK_REACTIONS.length) % QUICK_REACTIONS.length];
    await sleep(800 + Math.random() * 1500);
    const msg: ConversationMessage = {
      id: nextId(reactor.slug),
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      fromBot: metaBySlug.get(reactor.slug) || botMeta(reactor),
      bursts: [text],
    };
    newMessages.push(msg);
    await storageRepo.appendGroupMessages(group.id, [msg]);
    history.push(msg);
    onEvent?.({ type: 'message_part', message: msg, index: newMessages.length - 1, total: newMessages.length, hasMore: true });
  }

  await persist(group, newMessages);
  const last = newMessages[newMessages.length - 1];
  onEvent?.({ type: 'done', message: last, messages: newMessages });
  return newMessages;
}

/** 消息已逐条存过，这里只更新群的最后一条与开场状态 */
async function persist(group: GroupChat, newMessages: ConversationMessage[]): Promise<void> {
  if (newMessages.length === 0) return;
  const last = newMessages[newMessages.length - 1];
  const prefix = last.fromBot?.name ? `${last.fromBot.name}：` : '';
  await storageRepo.updateGroup(group.id, {
    pendingKickoff: false,
    lastMessage: `${prefix}${last.content}`.slice(0, 60),
  });
}

export async function generateMemberReply(params: {
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
  /** 本轮已产生的消息 id（用来认出群友刚发的气泡） */
  thisRoundIds: string[];
  /** 按这个时刻的作息说话（补聊用） */
  presenceAt?: string;
  /** 额外场景说明（如自发闲聊的起头要求） */
  extraDirective?: string;
  /** 离线时直接使用的话术（自发闲聊起头用） */
  offlineOverride?: () => string[];
  /** 拿到这位成员这次想发的照片 / 表情包卡片 */
  onMedia?: (cards: MediaCard[]) => void;
}): Promise<string[]> {
  const { group, persona, members, history, canCallUpstream, req } = params;
  const peers = collectGroupPeerBubbles(history, persona.slug, params.thisRoundIds);
  const roundOpeners = collectRoundOpeners(peers);
  const dedupeFirst = (bursts: string[]): string[] =>
    bursts.length === 0 ? bursts : [stripEchoedOpener(bursts[0], roundOpeners), ...bursts.slice(1)];

  const offline = () =>
    params.offlineOverride ? dedupeFirst(params.offlineOverride()) : dedupeFirst(synthesizeGroupFallbackReply({
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
      avoidOpeners: roundOpeners,
    }));

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
    // 群主这一轮发了图：把最近那张作为真实图片附给模型，让成员真的看见并接话
    const roundIds = new Set(params.thisRoundIds);
    const roundImage = [...history].reverse().find((m) => m.role === 'user' && m.imageUrl && roundIds.has(m.id))?.imageUrl;
    const result = await executeGrokChatTurn({
      slug: persona.slug,
      messages: transcript.map((t, i) => ({
        ...t,
        timestamp: new Date().toISOString(),
        imageUrl: roundImage && i === transcript.length - 1 && t.role === 'user' ? roundImage : undefined,
      })),
      mode: persona.defaultMode,
      thinkMode: false,
      deepSearch: false,
      requestPhoto: false,
      requestSticker: false,
      modelId: req.modelId,
      skipPersistence: true,
      presenceAt: params.presenceAt,
      extraSystemPrompt: [
        directive,
        buildGroupAntiEchoDirective({ peers }),
        roundImage ? '- 群主刚在群里发了一张图片（已附上）：先就图里的具体内容说点什么，别假装没看到。' : '',
        params.extraDirective || '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
    if (result.isDemoMode) {
      console.warn(`[group] ${persona.slug} 模型未返回有效回复，改用离线群聊话术`);
      return offline();
    }
    const bursts = normalizeGroupBursts(result.bursts, result.content, persona.name);
    const visual = (result.mediaCards || []).filter((c) => c.type === 'photo' || c.type === 'sticker');
    if (visual.length > 0) params.onMedia?.(visual);
    return bursts.length > 0 ? dedupeFirst(bursts) : offline();
  } catch (err) {
    console.warn(`[group] ${persona.slug} 生成失败，改用离线群聊话术：`, err);
    return offline();
  }
}
