/**
 * 世界设定的自动归纳（有 IO）：
 * - refreshWorld：每聊几轮，从新消息和最近的朋友圈里归纳角色生活里的地点 / 物品 / 宠物 / 人物
 * - linkPhotoToWorld：在已收录的地点拍了照，就把这张照片当成该地点的参考图，并同步成固定场景资产
 * 都在后台进行，失败不影响聊天。
 */
import { chatCompletion, type LlmConfig } from '@/lib/llm/client';
import { createSceneAssetFromExisting } from '@/lib/persona/scene-assets';
import {
  extractWorldMentionsByRules,
  matchWorldEntriesForCaption,
  mergeWorldMentions,
  type WorldMention,
} from '@/lib/persona/world';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage, WorldEntryKind, WorldState } from '@/lib/storage/types';

/** 至少攒够这么多条新消息（约 3 轮）再归纳一次，避免每轮都多一次模型调用 */
export const WORLD_REFRESH_MIN_NEW_MESSAGES = 6;

const KINDS: WorldEntryKind[] = ['place', 'object', 'pet', 'person'];

export function buildWorldExtractionPrompt(params: {
  personaName: string;
  messages: ConversationMessage[];
  momentText?: string;
  known: string[];
}): string {
  const transcript = params.messages
    .filter((m) => (m.content || '').trim() && !m.systemTip)
    .map((m) => `${m.role === 'user' ? '对方' : params.personaName}：${m.content.trim().slice(0, 200)}`)
    .join('\n');
  return [
    `下面是「${params.personaName}」和对方的聊天${params.momentText ? '，以及 TA 最近发的一条朋友圈' : ''}。`,
    `请找出属于「${params.personaName}」自己生活里、会反复出现的固定元素：`,
    '- place：TA 住的地方、房间、常去的店或地点',
    '- pet：TA 养的宠物（有名字就用名字）',
    '- object：TA 自己的、常用的东西（如某台相机、某把吉他）',
    '- person：TA 生活里的固定人物（室友、同事、家人，有名字就用名字）',
    '只要明确属于 TA 的、以后还会再提到的；一次性的东西、对方（聊天对象）自己的东西都不要。',
    params.known.length ? `已经记录过的：${params.known.slice(0, 30).join('、')}（同一样东西请用相同的名字）` : '',
    '',
    '只输出 JSON 数组，每项形如 {"kind":"place|pet|object|person","name":"简短名字","description":"一句话特征（外观、位置、性格等）","keywords":["别称"]}；最多 6 项；没有就输出 []。',
    '',
    '【聊天】',
    transcript || '（无）',
    params.momentText ? `\n【朋友圈】\n${params.momentText.slice(0, 200)}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** 宽松解析模型返回的 JSON 数组 */
export function parseWorldMentions(raw: string, source: WorldMention['source']): WorldMention[] {
  const stripped = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const match = stripped.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({
      kind: KINDS.includes(x.kind as WorldEntryKind) ? (x.kind as WorldEntryKind) : 'object',
      name: typeof x.name === 'string' ? x.name : '',
      description: typeof x.description === 'string' ? x.description : '',
      keywords: Array.isArray(x.keywords) ? x.keywords.filter((k): k is string => typeof k === 'string') : [],
      source,
    }))
    .filter((m) => m.name.trim().length >= 2)
    .slice(0, 6);
}

export async function refreshWorld(params: {
  slug: string;
  personaName: string;
  llm?: LlmConfig | null;
  now?: Date;
  /** 测试用：忽略「攒够新消息」的门槛 */
  force?: boolean;
}): Promise<WorldState | null> {
  const now = params.now ?? new Date();
  const world = await storageRepo.getWorld(params.slug);
  const all = await storageRepo.getConversation(params.slug, 0);
  const idx = world.lastExtractedMessageId ? all.findIndex((m) => m.id === world.lastExtractedMessageId) : -1;
  const fresh = (idx === -1 ? all.slice(-16) : all.slice(idx + 1)).filter((m) => !m.systemTip);
  if (!params.force && fresh.length < WORLD_REFRESH_MIN_NEW_MESSAGES) return null;

  const posts = await storageRepo.getMoments(params.slug).catch(() => []);
  const latestPost = posts[0];
  const momentText =
    latestPost && (!world.lastExtractedAt || latestPost.createdAt > world.lastExtractedAt)
      ? latestPost.content
      : undefined;

  const snippetOf = (text: string) => text.replace(/\s+/g, ' ').slice(0, 40);
  let mentions: WorldMention[] = [];
  if (params.llm?.canCall) {
    try {
      const raw = await chatCompletion(
        params.llm,
        [
          {
            role: 'user',
            content: buildWorldExtractionPrompt({
              personaName: params.personaName,
              messages: fresh,
              momentText,
              known: world.entries.map((e) => e.name),
            }),
          },
        ],
        { temperature: 0.2, timeoutMs: 25_000 }
      );
      const lastAssistant = [...fresh].reverse().find((m) => m.role === 'assistant');
      mentions = parseWorldMentions(raw, {
        type: momentText && !lastAssistant ? 'moment' : 'chat',
        snippet: snippetOf(lastAssistant?.content || momentText || ''),
        at: now.toISOString(),
      });
    } catch {
      mentions = [];
    }
  }
  if (mentions.length === 0) {
    // 没有模型或模型没归纳出来：用规则只认很明确的说法（只看角色自己说的话和朋友圈）
    for (const m of fresh.filter((x) => x.role === 'assistant')) {
      mentions.push(
        ...extractWorldMentionsByRules(m.content, { type: 'chat', snippet: snippetOf(m.content), at: m.timestamp })
      );
    }
    if (momentText) {
      mentions.push(
        ...extractWorldMentionsByRules(momentText, { type: 'moment', snippet: snippetOf(momentText), at: now.toISOString() })
      );
    }
  }

  const lastId = all[all.length - 1]?.id;
  return storageRepo.updateWorld(params.slug, (current) => ({
    ...mergeWorldMentions(current, mentions, now),
    lastExtractedMessageId: lastId ?? current.lastExtractedMessageId,
    lastExtractedAt: now.toISOString(),
  }));
}

/**
 * 照片生成成功后调用：画面描述里出现的已收录地点如果还没有参考图，就用这张照片，
 * 并同步成固定场景资产（之后在这里拍照会保持环境一致）。返回本次匹配到的设定描述，供生图提示词使用。
 */
export async function linkPhotoToWorld(params: {
  slug: string;
  caption: string;
  imageUrl?: string;
  now?: Date;
}): Promise<void> {
  const world = await storageRepo.getWorld(params.slug);
  const target = matchWorldEntriesForCaption(world.entries, params.caption).find(
    (e) => e.kind === 'place' && !e.imageUrl
  );
  if (!target || !params.imageUrl) return;
  const created = await createSceneAssetFromExisting(params.slug, {
    name: target.name,
    category: /房间|卧室|书桌|小窝|阳台|工作室|画室/.test(target.name) ? 'room' : 'location',
    imageUrl: params.imageUrl,
    description: target.description || undefined,
  });
  const nowIso = (params.now ?? new Date()).toISOString();
  await storageRepo.updateWorld(params.slug, (current) => ({
    ...current,
    entries: current.entries.map((e) =>
      e.id === target.id
        ? {
            ...e,
            imageUrl: created.asset.imageUrl,
            sceneAssetId: created.asset.id,
            sources: [...e.sources, { type: 'photo' as const, snippet: params.caption.slice(0, 40), at: nowIso }].slice(-5),
            updatedAt: nowIso,
          }
        : e
    ),
  }));
}

/** 生图提示词里补充画面中出现的固定元素（宠物长相、物品样子等） */
export async function worldAnchorsForCaption(slug: string, caption: string): Promise<string> {
  const world = await storageRepo.getWorld(slug);
  return matchWorldEntriesForCaption(world.entries, caption)
    .filter((e) => e.description)
    .slice(0, 3)
    .map((e) => `${e.name}：${e.description}`)
    .join('；');
}
