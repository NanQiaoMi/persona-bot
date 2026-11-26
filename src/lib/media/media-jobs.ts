/**
 * 照片 / 表情包的生成任务（服务端负责，带重试与补生成）：
 * - runMediaJob：生成一张卡片的图片并写回那条消息；同一张卡片同时只跑一个任务（重复请求等同一个结果）
 * - 每张卡片最多自动重试 3 次，间隔逐次拉长（30 秒 / 2 分钟 / 10 分钟）；手动重试不受次数限制
 * - recoverMedia：打开单聊 / 群聊时，把卡住（生成中超过 2 分钟）或失败待重试的卡片重新排队；
 *   生图服务连不上时先标记「网络恢复后自动补发」，等连上再补
 * - enqueueNewMediaCards：一轮回复存好后服务端自己开始生成，不依赖页面是否还开着
 */
import {
  generatePersonaMedia,
  LOCAL_GATEWAY_BASE_URL,
} from '@/lib/grok/image-generator';
import { buildGuaranteedAppearanceFallback } from '@/lib/persona/appearance-evolution';
import {
  autoCaptureSceneAssetFromPhoto,
  matchSceneAssetForCaption,
} from '@/lib/persona/scene-assets';
import { linkPhotoToWorld, worldAnchorsForCaption } from '@/lib/persona/world-refresh';
import { storageRepo } from '@/lib/storage/repository';
import type { ConversationMessage, MediaCard, RuntimeSettings } from '@/lib/storage/types';

export const MEDIA_MAX_AUTO_ATTEMPTS = 3;
/** 第 n 次失败后，隔多久再自动重试 */
export const MEDIA_RETRY_BACKOFF_MS = [30_000, 120_000, 600_000];
/** 「生成中」超过这么久还没结果，就当作卡住了（比如中途服务重启） */
export const MEDIA_STUCK_AFTER_MS = 120_000;

export interface MediaJobTarget {
  /** 消息所在频道 slug（群聊时同时也是发图成员 slug） */
  slug: string;
  /** 形象归属的角色 slug（单聊 @提及 其它角色时，消息写在频道 slug，形象取 personaSlug） */
  personaSlug?: string;
  messageId: string;
  cardIndex: number;
  groupId?: string;
}

export interface MediaJobResult {
  success: boolean;
  card?: MediaCard;
  skipped?: 'not_found' | 'max_attempts' | 'not_visual';
  autoLockedReference?: boolean;
  shouldRefineReference?: boolean;
  sourcePhotoUrl?: string;
}

type JobRegistry = Map<string, Promise<MediaJobResult>>;
const globalForJobs = globalThis as unknown as {
  __personabotMediaJobs?: JobRegistry;
  __personabotGatewayCheck?: { at: number; ok: boolean; baseUrl: string };
};
function registry(): JobRegistry {
  if (!globalForJobs.__personabotMediaJobs) globalForJobs.__personabotMediaJobs = new Map();
  return globalForJobs.__personabotMediaJobs;
}

export function mediaJobKey(t: Pick<MediaJobTarget, 'messageId' | 'cardIndex' | 'groupId'>): string {
  return `${t.groupId ? `group:${t.groupId}` : 'chat'}:${t.messageId}:${t.cardIndex}`;
}

export function isMediaJobRunning(t: Pick<MediaJobTarget, 'messageId' | 'cardIndex' | 'groupId'>): boolean {
  return registry().has(mediaJobKey(t));
}

function isVisual(card: MediaCard | undefined): card is MediaCard {
  return Boolean(card && (card.type === 'photo' || card.type === 'sticker'));
}

/** 下一次自动重试的时间；次数用完返回 undefined */
export function nextRetryAt(attempts: number, now: Date): string | undefined {
  if (attempts >= MEDIA_MAX_AUTO_ATTEMPTS) return undefined;
  const wait = MEDIA_RETRY_BACKOFF_MS[Math.max(0, attempts - 1)] ?? MEDIA_RETRY_BACKOFF_MS[MEDIA_RETRY_BACKOFF_MS.length - 1];
  return new Date(now.getTime() + wait).toISOString();
}

async function readMessage(t: MediaJobTarget): Promise<ConversationMessage | undefined> {
  const list = t.groupId
    ? await storageRepo.getGroupConversation(t.groupId, 0)
    : await storageRepo.getConversation(t.slug, 0);
  return list.find((m) => m.id === t.messageId);
}

async function writeCard(t: MediaJobTarget, patch: (card: MediaCard) => MediaCard): Promise<void> {
  const update = (msg: ConversationMessage): ConversationMessage => {
    const cards = [...(msg.mediaCards || [])];
    if (t.cardIndex < 0 || t.cardIndex >= cards.length) return msg;
    cards[t.cardIndex] = patch(cards[t.cardIndex]);
    return { ...msg, mediaCards: cards };
  };
  if (t.groupId) await storageRepo.updateGroupMessage(t.groupId, t.messageId, update);
  else await storageRepo.updateConversationMessage(t.slug, t.messageId, update);
}

function resolveImageConfig(settings: RuntimeSettings) {
  const baseUrl = (settings.llmBaseUrl || process.env.LLM_BASE_URL || LOCAL_GATEWAY_BASE_URL).replace(/\/$/, '');
  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const imageModel = settings.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2.6';
  return { baseUrl, apiKey, imageModel };
}

/**
 * 生成一张卡片的图片并写回。同一张卡片已有任务在跑时，直接等那个任务的结果。
 * manual：你点了「重试」，不受自动重试次数限制，次数从头算。
 */
export function runMediaJob(t: MediaJobTarget, opts: { manual?: boolean; now?: () => Date } = {}): Promise<MediaJobResult> {
  const key = mediaJobKey(t);
  const running = registry().get(key);
  if (running) return running;
  const job = doRunMediaJob(t, opts).finally(() => {
    registry().delete(key);
  });
  registry().set(key, job);
  return job;
}

async function doRunMediaJob(t: MediaJobTarget, opts: { manual?: boolean; now?: () => Date }): Promise<MediaJobResult> {
  const now = opts.now ?? (() => new Date());
  const message = await readMessage(t);
  const card = message?.mediaCards?.[t.cardIndex];
  if (!message || !card) return { success: false, skipped: 'not_found' };
  if (!isVisual(card)) return { success: false, skipped: 'not_visual' };
  if (card.status === 'ready' && card.imageUrl) return { success: true, card };

  const prevAttempts = opts.manual ? 0 : card.attempts || 0;
  if (prevAttempts >= MEDIA_MAX_AUTO_ATTEMPTS) return { success: false, skipped: 'max_attempts', card };
  const attempts = prevAttempts + 1;
  const startedAt = now().toISOString();

  // 先标记「生成中」：别处看到就知道有任务在跑，不会重复排队
  await writeCard(t, (c) => ({
    ...c,
    status: 'generating',
    attempts,
    lastAttemptAt: startedAt,
    nextRetryAt: undefined,
    waitingForNetwork: undefined,
    errorHint: undefined,
  }));

  const fail = async (hint: string): Promise<MediaJobResult> => {
    const failed: MediaCard = {
      ...card,
      status: 'error',
      attempts,
      lastAttemptAt: startedAt,
      nextRetryAt: nextRetryAt(attempts, now()),
      waitingForNetwork: undefined,
      errorHint: hint,
    };
    await writeCard(t, () => failed).catch(() => {});
    return { success: true, card: failed };
  };

  try {
    const visualSlug = t.personaSlug || t.slug;
    const [settings, persona, sceneAssets] = await Promise.all([
      storageRepo.getSettings(),
      storageRepo.getPersona(visualSlug),
      storageRepo.getSceneAssets(visualSlug),
    ]);
    const { baseUrl, apiKey, imageModel } = resolveImageConfig(settings);
    const mediaType = card.type === 'photo' ? 'photo' : 'sticker';
    const captionText = String(card.caption || `${persona?.name || visualSlug} 的趣味表达`);
    const matchedScene = mediaType === 'photo' ? matchSceneAssetForCaption(sceneAssets, captionText) : null;
    const effectiveReferenceUrl = matchedScene?.isPureEnvironment
      ? matchedScene.asset.imageUrl
      : persona?.profile.referenceImageUrl;

    const mediaRes = await generatePersonaMedia({
      kind: mediaType,
      caption: captionText,
      personaName: persona?.name || visualSlug,
      personaStyle: persona?.profile.personalityTags?.slice(0, 3).join(', '),
      appearanceAnchor: persona?.profile.appearanceAnchor,
      // 场景资产 + 世界设定里出现在画面中的元素（宠物长相、物品样子等），保持前后一致
      sceneAnchor:
        [matchedScene?.asset.description, await worldAnchorsForCaption(visualSlug, captionText).catch(() => '')]
          .filter(Boolean)
          .join('；') || undefined,
      referenceImageUrl: effectiveReferenceUrl,
      baseUrl,
      apiKey,
      imageModel,
    });

    if (!mediaRes.imageUrl) {
      return fail(mediaRes.errorHint || (mediaType === 'photo' ? '照片没生成出来' : '表情包没生成出来'));
    }

    // 在已收录、还没有参考图的地点拍了照：把这张照片设为该地点的参考图并存成固定场景；
    // 若带明确场景/房间词且尚无同类固定场景，自动沉淀进场景资产库形成自循环
    if (mediaType === 'photo') {
      await linkPhotoToWorld({ slug: visualSlug, caption: captionText, imageUrl: mediaRes.imageUrl }).catch(() => {});
      await autoCaptureSceneAssetFromPhoto({
        slug: visualSlug,
        imageUrl: mediaRes.imageUrl,
        caption: captionText,
      }).catch(() => {});
    }

    // 第一张照片自动锁定为形象参考图
    let autoLockedReference = false;
    let shouldRefineReference = false;
    let sourcePhotoUrl: string | undefined;
    if (mediaType === 'photo' && persona && !persona.profile.referenceImageUrl && !matchedScene?.isPureEnvironment) {
      const lockedUrl = mediaRes.imageUrl;
      await storageRepo.updatePersona(persona.slug, (current) => {
        if (current.profile.referenceImageUrl) return null;
        autoLockedReference = true;
        const fallbackAnchor =
          !current.profile.appearanceAnchor && !current.profile.appearanceAnchorLocked
            ? buildGuaranteedAppearanceFallback({
                personaName: current.name,
                personaStyle: current.profile.personalityTags?.slice(0, 4).join('、'),
                personaMd: current.personaMd,
                fallbackCaption: captionText,
              })
            : undefined;
        return {
          ...current,
          profile: {
            ...current.profile,
            referenceImageUrl: lockedUrl,
            ...(fallbackAnchor ? { appearanceAnchor: fallbackAnchor } : {}),
          },
          updatedAt: new Date().toISOString(),
        };
      });
      if (autoLockedReference) {
        shouldRefineReference = true;
        sourcePhotoUrl = lockedUrl;
      }
    }

    const ready: MediaCard = {
      ...card,
      status: 'ready',
      imageUrl: mediaRes.imageUrl,
      model: mediaRes.model,
      prompt: mediaRes.prompt,
      errorHint: undefined,
      attempts,
      lastAttemptAt: startedAt,
      nextRetryAt: undefined,
      waitingForNetwork: undefined,
    };
    await writeCard(t, () => ready);
    return {
      success: true,
      card: ready,
      autoLockedReference,
      shouldRefineReference,
      ...(sourcePhotoUrl ? { sourcePhotoUrl } : {}),
    };
  } catch (err) {
    console.warn('[media] 生成失败：', err instanceof Error ? err.message : err);
    return fail('刚刚信号不太好，没发出去');
  }
}

/**
 * 找出需要补生成的卡片：
 * - 「生成中」但超过 2 分钟没结果、也没有任务在跑（多半是中途服务重启或页面关掉了）
 * - 失败、自动重试次数没用完、且到了下次重试的时间
 */
export function collectRecoverableCards(
  messages: ConversationMessage[],
  now: Date,
  groupId?: string
): Array<{ messageId: string; cardIndex: number; slugHint?: string }> {
  const out: Array<{ messageId: string; cardIndex: number; slugHint?: string }> = [];
  for (const m of messages) {
    (m.mediaCards || []).forEach((c, cardIndex) => {
      if (!isVisual(c) || (c.status === 'ready' && c.imageUrl)) return;
      if (isMediaJobRunning({ messageId: m.id, cardIndex, groupId })) return;
      const attempts = c.attempts || 0;
      if (attempts >= MEDIA_MAX_AUTO_ATTEMPTS) return;
      if (c.status === 'generating' || !c.status) {
        const since = Date.parse(c.lastAttemptAt || m.timestamp || '');
        if (!Number.isFinite(since) || now.getTime() - since >= MEDIA_STUCK_AFTER_MS) {
          out.push({ messageId: m.id, cardIndex, slugHint: m.fromBot?.slug });
        }
        return;
      }
      if (c.status === 'error') {
        const due = Date.parse(c.nextRetryAt || '');
        if (!Number.isFinite(due) || due <= now.getTime()) {
          out.push({ messageId: m.id, cardIndex, slugHint: m.fromBot?.slug });
        }
      }
    });
  }
  return out;
}

/** 还没出结果、之后会自动补的卡片数（页面据此决定要不要继续刷新） */
export function countPendingCards(messages: ConversationMessage[]): number {
  let n = 0;
  for (const m of messages) {
    for (const c of m.mediaCards || []) {
      if (!isVisual(c) || (c.status === 'ready' && c.imageUrl)) continue;
      if (c.status === 'generating' || !c.status) n += 1;
      else if (c.status === 'error' && (c.attempts || 0) < MEDIA_MAX_AUTO_ATTEMPTS) n += 1;
    }
  }
  return n;
}

/** 生图服务连得上吗（查 /models，4 秒超时，结果缓存 15 秒） */
export async function checkImageGateway(settings: RuntimeSettings, nowMs = Date.now()): Promise<boolean> {
  const { baseUrl, apiKey } = resolveImageConfig(settings);
  const cached = globalForJobs.__personabotGatewayCheck;
  if (cached && cached.baseUrl === baseUrl && nowMs - cached.at < 15_000) return cached.ok;
  let ok = false;
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(4000),
    });
    ok = res.status < 500;
  } catch {
    ok = false;
  }
  globalForJobs.__personabotGatewayCheck = { at: nowMs, ok, baseUrl };
  return ok;
}

/** 测试用：清掉服务可用性缓存 */
export function resetGatewayCheckCache(): void {
  globalForJobs.__personabotGatewayCheck = undefined;
}

function runInBackground(targets: MediaJobTarget[]): Promise<void> {
  // 一张一张来，避免同时压很多请求给生图服务
  return (async () => {
    for (const t of targets) {
      await runMediaJob(t).catch(() => undefined);
    }
  })();
}

/**
 * 打开单聊 / 群聊时调用：把卡住或到点重试的卡片重新排队。
 * 生图服务连不上就先标记「网络恢复后自动补发」，不白白消耗重试次数。
 */
export async function recoverMedia(params: {
  slug?: string;
  groupId?: string;
  now?: Date;
  /** 测试用：等补生成跑完再返回 */
  wait?: boolean;
}): Promise<{ queued: number; pending: number; gatewayOnline: boolean | null }> {
  const now = params.now ?? new Date();
  if (!params.slug && !params.groupId) return { queued: 0, pending: 0, gatewayOnline: null };
  const messages = params.groupId
    ? await storageRepo.getGroupConversation(params.groupId, 0)
    : await storageRepo.getConversation(params.slug!, 0);
  const pending = countPendingCards(messages);
  const recoverable = collectRecoverableCards(messages, now, params.groupId);
  if (recoverable.length === 0) return { queued: 0, pending, gatewayOnline: null };

  const settings = await storageRepo.getSettings();
  const online = await checkImageGateway(settings, now.getTime());
  const targets: MediaJobTarget[] = recoverable
    .map((r) => ({
      slug: params.groupId ? r.slugHint || '' : params.slug!,
      ...(params.groupId ? {} : r.slugHint ? { personaSlug: r.slugHint } : {}),
      messageId: r.messageId,
      cardIndex: r.cardIndex,
      groupId: params.groupId,
    }))
    .filter((t) => t.slug);

  if (!online) {
    for (const t of targets) {
      await writeCard(t, (c) => (c.waitingForNetwork ? c : { ...c, waitingForNetwork: true })).catch(() => {});
    }
    return { queued: 0, pending, gatewayOnline: false };
  }

  const run = runInBackground(targets);
  if (params.wait) await run;
  return { queued: targets.length, pending, gatewayOnline: true };
}

/**
 * 一轮回复存好后调用：新出现的「生成中」卡片由服务端直接开始生成。
 * 页面那边如果也发了生成请求，会等同一个任务的结果，不会生成两次。
 */
export function enqueueNewMediaCards(params: {
  slug: string;
  groupId?: string;
  messages: ConversationMessage[];
}): Promise<void> {
  const targets: MediaJobTarget[] = [];
  for (const m of params.messages) {
    (m.mediaCards || []).forEach((c, cardIndex) => {
      if (!isVisual(c) || c.status !== 'generating' || c.attempts) return;
      const slug = params.groupId ? m.fromBot?.slug : params.slug;
      if (!slug) return;
      const personaSlug = !params.groupId && m.fromBot?.slug ? m.fromBot.slug : undefined;
      targets.push({
        slug,
        ...(personaSlug ? { personaSlug } : {}),
        messageId: m.id,
        cardIndex,
        groupId: params.groupId,
      });
    });
  }
  if (targets.length === 0) return Promise.resolve();
  return runInBackground(targets);
}
