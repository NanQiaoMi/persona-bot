/**
 * 群聊自发闲聊的执行：
 * - idle：你停在群里一会儿没说话 → 有人起个话题、有人接
 * - catchup：隔几小时再打开群 → 补上「你不在时」大家聊的（时间戳落在空档里）
 * 每条都按角色自己的人设生成（复用群聊发言逻辑与防撞词），附和与拍一拍不调用模型。
 * 未配置模型时走离线话术，保证零配置也能看到群里自己聊起来。
 */
import { getMascotConfigForPersona } from '@/components/workspace/mascot-palette';
import {
  AMBIENT_CONFIG,
  appendAmbientLog,
  decideAmbient,
  planAmbientScene,
  planCatchupScenes,
  stepGapMs,
  type AmbientMode,
  type AmbientScene,
  type AmbientSeed,
  type RandomFn,
} from '@/lib/group/ambient';
import {
  AMBIENT_FOLLOW_LINES,
  AMBIENT_STARTER_LINES,
  PAT_SUFFIXES,
  QUICK_REACTIONS,
  type AmbientMode as LineMode,
} from '@/lib/group/ambient-lines';
import { generateMemberReply, GroupNotFoundError } from '@/lib/group/group-orchestrator';
import { resolveLlmConfig } from '@/lib/llm/client';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage, GroupChat, PersonaRecord } from '@/lib/storage/types';

interface SpeechRef {
  slug: string;
  name: string;
  text: string;
  id: string;
}

export interface AmbientResult {
  ok: boolean;
  reason: string;
  messages: ConversationMessage[];
  /** idle：前端按这个节奏一条条「播放」（毫秒，相对上一条） */
  playbackDelays: number[];
}

function lineMode(mode: string | undefined): LineMode {
  return mode === 'fun' || mode === 'companion' || mode === 'analytical' ? mode : 'authentic';
}

function shortName(name: string): string {
  return name.split(/\s+/)[0];
}

function fill(template: string, seed: AmbientSeed, vars: { name?: string } = {}): string {
  return template
    .replace(/\{activity\}/g, seed.activity || '刚忙完')
    .replace(/\{moment\}/g, seed.moment || '刚发的那条')
    .replace(/\{topic\}/g, seed.topic || '上次说的那事')
    .replace(/\{name\}/g, seed.targetName || vars.name || '你')
    .replace(/\{quote\}/g, seed.quote?.text || '之前说的那个')
    .replace(/@群主\s*/g, '@群主 ');
}

/** 离线起头：按模式 × 话题类型挑一句，优先选带有可填内容的句子 */
export function offlineStarterLine(mode: string | undefined, seed: AmbientSeed, random: RandomFn): string {
  const pool = AMBIENT_STARTER_LINES[lineMode(mode)][seed.kind];
  return fill(pool[Math.floor(random() * pool.length) % pool.length], seed);
}

function offlineFollowLine(mode: string | undefined, starterName: string, random: RandomFn): string {
  const pool = AMBIENT_FOLLOW_LINES[lineMode(mode)];
  return pool[Math.floor(random() * pool.length) % pool.length].replace(/\{name\}/g, shortName(starterName));
}

/** 给模型的起头说明 */
export function buildStarterDirective(seed: AmbientSeed, at: Date, isCatchup: boolean): string {
  const time = `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
  const what: Record<AmbientSeed['kind'], string> = {
    activity: `随口说说你此刻在干嘛（${seed.activity || '手头的事'}），或者吐槽一句`,
    daily: '分享一件刚遇到的生活小事',
    moment: `顺着你刚发的朋友圈「${seed.moment || ''}」聊两句`,
    topic: `把群话题「${seed.topic || ''}」重新捡起来`,
    tease: `损一下或逗一下 ${seed.targetName || '群里某个人'}（可以 @${seed.targetName || ''}）`,
    callback: `把之前群里「${seed.quote?.name || '有人'}」说的「${seed.quote?.text || ''}」翻出来接着聊`,
    ping_owner: '@群主 一下，问问 TA 在干嘛或者叫 TA 出来聊',
  };
  return [
    '## 你在群里自己起个话题',
    '- 群里安静了好一会儿，没人找你，是你自己想说话。',
    `- 这次：${what[seed.kind]}。`,
    '- 像真人在群里随手发：1~2 条短消息，别客套、别「大家好」、别当主持人点名所有人。',
    isCatchup ? `- 这条消息发生在 ${time}（群主当时不在线），按那个时间点的状态说话。` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function botMeta(persona: PersonaRecord, idx: number) {
  const m = getMascotConfigForPersona(persona.slug, persona.profile, idx);
  return { slug: persona.slug, name: persona.name, shape: m.shape, color: m.color };
}

export async function executeAmbientScene(params: {
  groupId: string;
  mode: AmbientMode;
  userIdleMs?: number;
  now?: Date;
  random?: RandomFn;
  modelId?: string;
}): Promise<AmbientResult> {
  const now = params.now ?? new Date();
  const random = params.random ?? Math.random;
  const group = await storageRepo.getGroup(params.groupId);
  if (!group) throw new GroupNotFoundError(params.groupId);

  const members = (
    await Promise.all(group.memberSlugs.map((slug) => storageRepo.getPersona(slug)))
  ).filter((p): p is PersonaRecord => Boolean(p));
  const history = await storageRepo.getGroupConversation(group.id, 0);

  const decision = decideAmbient({
    mode: params.mode,
    group,
    history,
    now,
    userIdleMs: params.userIdleMs,
    memberCount: members.length,
  });
  if (!decision.ok) return { ok: false, reason: decision.reason, messages: [], playbackDelays: [] };

  const recentMoments: Record<string, string | undefined> = {};
  await Promise.all(
    members.map(async (m) => {
      const posts = await storageRepo.getMoments(m.slug).catch(() => []);
      const latest = posts[0];
      // 只拿最近两天内的朋友圈当话题
      if (latest && now.getTime() - new Date(latest.createdAt).getTime() < 48 * 3600_000) {
        recentMoments[m.slug] = latest.content;
      }
    })
  );
  const ctx = { groupTopic: group.topic, recentMoments, history };

  let scenes: AmbientScene[];
  if (params.mode === 'catchup') {
    const last = history[history.length - 1];
    const gapStart = new Date(last ? last.timestamp : group.createdAt);
    scenes = planCatchupScenes({ members, gapStart, now, ctx, random });
  } else {
    const scene = planAmbientScene({
      members,
      at: now,
      ctx,
      maxMessages: AMBIENT_CONFIG.idleMaxMessages,
      random,
      allowPingOwner: random() < 0.25,
    });
    scenes = scene ? [scene] : [];
  }
  if (scenes.length === 0) {
    // 大家都睡了：记一次，避免反复来问
    await storageRepo.updateGroup(group.id, { ambientLog: appendAmbientLog(group.ambientLog, now) });
    return { ok: false, reason: '群里醒着的人不够，大家都安静着', messages: [], playbackDelays: [] };
  }

  const settings = await storageRepo.getSettings();
  const canCallUpstream = resolveLlmConfig(settings, { model: params.modelId }).canCall;
  const bySlug = new Map(members.map((m, i) => [m.slug, { persona: m, meta: botMeta(m, i) }]));
  const produced: ConversationMessage[] = [];
  const playbackDelays: number[] = [];
  const isCatchup = params.mode === 'catchup';
  let seq = 0;
  const baseTs = now.getTime();
  const newId = (suffix: string) => `gamb_${baseTs}_${seq++}_${suffix}`;

  for (const scene of scenes) {
    let clock = scene.at.getTime();
    let lastSpeech: SpeechRef | null = null as SpeechRef | null;
    const usedReactions = new Set<string>();

    for (const step of scene.steps) {
      const entry = bySlug.get(step.slug);
      if (!entry) continue;
      const { persona, meta } = entry;
      // 条数上限：停留时一场最多 5 条，补聊最多 8 条（每人可能连发两条，这里统一截断）
      const cap = isCatchup ? AMBIENT_CONFIG.catchupMaxMessages : AMBIENT_CONFIG.idleMaxMessages;
      if (produced.length >= cap) break;
      const gap = produced.length === 0 && !isCatchup ? 0 : stepGapMs(step, random, params.mode);
      clock += isCatchup ? gap : 0;
      const stamp = () => new Date(isCatchup ? clock : Date.now()).toISOString();
      const push = (msg: ConversationMessage, delay: number) => {
        produced.push(msg);
        history.push(msg);
        playbackDelays.push(Math.round(delay));
      };

      if (step.type === 'pat') {
        const target = bySlug.get(step.targetSlug);
        if (!target) continue;
        const suffix = PAT_SUFFIXES[Math.floor(random() * PAT_SUFFIXES.length) % PAT_SUFFIXES.length] || '';
        push(
          {
            id: newId('pat'),
            role: 'assistant',
            content: `${shortName(persona.name)} 拍了拍 ${shortName(target.persona.name)}${suffix}`,
            timestamp: stamp(),
            fromBot: meta,
            systemTip: true,
            ambient: params.mode,
          },
          1500 + random() * 2500
        );
        continue;
      }

      if (step.type === 'react') {
        const options = QUICK_REACTIONS.filter((r) => !usedReactions.has(r));
        const text = options[Math.floor(random() * options.length) % options.length] || '哈哈哈';
        usedReactions.add(text);
        push(
          {
            id: newId(persona.slug),
            role: 'assistant',
            content: text,
            timestamp: stamp(),
            fromBot: meta,
            bursts: [text],
            ambient: params.mode,
          },
          1500 + random() * 3000
        );
        continue;
      }

      const presenceAt = isCatchup ? new Date(clock).toISOString() : undefined;
      let bursts: string[];
      let quote: ConversationMessage['quote'];

      if (step.type === 'starter') {
        const seed = step.seed;
        if (seed.kind === 'callback' && seed.quote) quote = seed.quote;
        bursts = await generateMemberReply({
          group,
          persona,
          members,
          history,
          canCallUpstream,
          req: { groupId: group.id, modelId: params.modelId },
          isReaction: false,
          triggerText: '',
          triggerSpeakerName: '',
          thisRoundIds: produced.map((m) => m.id),
          presenceAt,
          extraDirective: buildStarterDirective(seed, new Date(clock), isCatchup),
          offlineOverride: () => [offlineStarterLine(persona.defaultMode, seed, random)],
        });
      } else {
        const replyTo: SpeechRef | null = lastSpeech;
        bursts = await generateMemberReply({
          group,
          persona,
          members,
          history,
          canCallUpstream,
          req: { groupId: group.id, modelId: params.modelId },
          replyTo: replyTo ? { name: replyTo.name, text: replyTo.text } : undefined,
          isReaction: true,
          triggerText: replyTo?.text || '',
          triggerSpeakerName: replyTo?.name || '',
          thisRoundIds: produced.map((m) => m.id),
          presenceAt,
          offlineOverride:
            canCallUpstream || !replyTo
              ? undefined
              : () => [offlineFollowLine(persona.defaultMode, replyTo.name, random)],
        });
        // 接的不是紧挨着的上一条时，像微信一样引用那条
        const lastInHistory = history[history.length - 1];
        if (replyTo && lastInHistory && lastInHistory.id !== replyTo.id) {
          quote = { id: replyTo.id, name: replyTo.name, text: replyTo.text.slice(0, 40) };
        }
      }

      const remaining = (isCatchup ? AMBIENT_CONFIG.catchupMaxMessages : AMBIENT_CONFIG.idleMaxMessages) - produced.length;
      bursts.slice(0, Math.max(1, remaining)).forEach((text, i) => {
        if (isCatchup && i > 0) clock += 2_000 + random() * 6_000;
        const msg: ConversationMessage = {
          id: newId(persona.slug),
          role: 'assistant',
          content: text,
          timestamp: stamp(),
          fromBot: meta,
          mode: persona.defaultMode,
          bursts: [text],
          ambient: params.mode,
          quote: i === 0 ? quote : undefined,
          isDemoMode: canCallUpstream ? undefined : true,
        };
        push(msg, i === 0 ? (produced.length === 0 ? 0 : gap) : 1200 + text.length * 120);
        lastSpeech = { slug: persona.slug, name: persona.name, text, id: msg.id };
      });
    }
  }

  if (produced.length > 0) {
    await storageRepo.appendGroupMessages(group.id, produced);
    const last = produced[produced.length - 1];
    await storageRepo.updateGroup(group.id, {
      lastMessage: `${last.systemTip ? '' : `${last.fromBot?.name || ''}：`}${last.content}`.slice(0, 60),
      ambientLog: appendAmbientLog(group.ambientLog, now),
    });
  }
  return { ok: produced.length > 0, reason: decision.reason, messages: produced, playbackDelays };
}

/** 供路由使用：把群聊对象里的冷却信息暴露给前端（下次最早什么时候可以再自己聊） */
export function nextAmbientEligibleAt(group: Pick<GroupChat, 'ambientLog'>): string | null {
  const log = (group.ambientLog || []).map((s) => new Date(s).getTime()).filter((n) => n > 0);
  if (log.length === 0) return null;
  return new Date(Math.max(...log) + AMBIENT_CONFIG.cooldownMs).toISOString();
}
