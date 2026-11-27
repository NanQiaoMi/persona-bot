import { getPresenceState, type PresenceState } from '@/lib/persona/daily-rhythm';
import { storageRepo } from '@/lib/storage/repository';
import type {
  DailyLifeMomentDigest,
  DailyLifeState,
  MomentPost,
  PersonaRecord,
} from '@/lib/storage/types';

export function localDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ARCHETYPE_DAILY_EVENTS: Record<string, string[]> = {
  creative: [
    '今天整理了一批刚洗出来的素材，顺便逛了街角的小店',
    '下午打算找个安静角落喝杯手冲发会儿呆',
    '随手拍到了一束挺舒服的阳光，留着慢慢挑片',
  ],
  night_owl: [
    '昼夜节律一如既往偏晚，准备晚上攒一波灵感和好心情',
    '白天慢慢醒神，晚上打算刷点喜欢的东西放松一下',
    '今天想避开无聊俗事，专注做自己上头的事',
  ],
  student: [
    '今天课表和自习排得有点满，下课后只想吃顿好的',
    '在图书馆和食堂之间来回切换，顺便摸鱼刷几眼消息',
  ],
  service: [
    '今天按排班节奏走，忙完高峰期就可以彻底放空了',
    '店里/手头事一茬接一茬，抽空歇一口气',
  ],
  office: [
    '按日常节奏处理手头事务，下班后打算彻底松口气',
    '今天忙里偷闲刷会儿消息，期待晚上吃顿热乎的',
  ],
};

/** 零额外模型开销推导今日主线小事（结合专属作息与日期哈希保持全天稳定） */
export function deriveDailyMainEvent(
  persona: Pick<PersonaRecord, 'slug' | 'name' | 'profile' | 'spec'>,
  presence: PresenceState,
  now: Date = new Date()
): string {
  const day = localDayKey(now);
  const override = persona.spec?.dailyRhythmOverride;
  if (override?.busyActivities?.length && override?.freeActivities?.length) {
    const busyAct =
      override.busyActivities[hashSeed(`${persona.slug}|${day}|busy`) % override.busyActivities.length];
    const freeAct =
      override.freeActivities[hashSeed(`${persona.slug}|${day}|free`) % override.freeActivities.length];
    return `白天主要在${busyAct}，闲下来喜欢${freeAct}`;
  }

  const pool =
    ARCHETYPE_DAILY_EVENTS[presence.archetype] || ARCHETYPE_DAILY_EVENTS.office;
  const picked = pool[hashSeed(`${persona.slug}|${day}|main`) % pool.length] || pool[0];
  return `${picked}（此刻：${presence.activity}）`;
}

export function resolveDailyMoodTone(persona: Pick<PersonaRecord, 'emotionState'>): string {
  if (persona.emotionState?.sulking) {
    const label = persona.emotionState.moodLabel || '有点闹别扭';
    return `${label}（${persona.emotionState.sulking.reason}）`;
  }
  return persona.emotionState?.moodLabel || persona.emotionState?.primary || '平静';
}

function extractRecentMomentDigests(
  posts: MomentPost[],
  now: Date
): DailyLifeMomentDigest[] {
  const cutoffMs = now.getTime() - 48 * 3600_000;
  return (posts || [])
    .filter((p) => {
      if (!p || !p.content || p.id.includes('_seed_')) return false;
      const ms = new Date(p.createdAt).getTime();
      return !Number.isFinite(ms) || ms >= cutoffMs;
    })
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      content: p.content.slice(0, 80),
      topic: p.topic,
      location: p.location,
      createdAt: p.createdAt,
    }));
}

/**
 * 读取或按日初始化「今日生活与心境板」（单聊、朋友圈、群聊与主动破冰共享同一份状态）
 */
export async function getOrInitDailyLife(
  persona: PersonaRecord,
  now: Date = new Date()
): Promise<DailyLifeState> {
  const today = localDayKey(now);
  const [existing, moments] = await Promise.all([
    storageRepo.getDailyLife(persona.slug).catch(() => null),
    storageRepo.getMoments(persona.slug).catch(() => []),
  ]);

  const recentMoments = extractRecentMomentDigests(moments, now);
  const moodTone = resolveDailyMoodTone(persona);

  if (existing && existing.dateKey === today) {
    const mergedMoments =
      recentMoments.length > 0 ? recentMoments : existing.recentMoments;
    const unchanged =
      existing.moodTone === moodTone &&
      JSON.stringify(existing.recentMoments) === JSON.stringify(mergedMoments);
    if (unchanged) return existing;

    const updated: DailyLifeState = {
      ...existing,
      moodTone,
      recentMoments: mergedMoments,
      updatedAt: now.toISOString(),
    };
    return storageRepo.saveDailyLife(persona.slug, updated);
  }

  const presence = getPresenceState(persona, now);
  const created: DailyLifeState = {
    dateKey: today,
    mainEvent: deriveDailyMainEvent(persona, presence, now),
    moodTone,
    recentMoments,
    updatedAt: now.toISOString(),
  };
  return storageRepo.saveDailyLife(persona.slug, created);
}

/** 新发朋友圈后立刻同步到今日生活板，让单聊/群聊/破冰无缝知晓 */
export async function recordMomentInDailyLife(
  persona: PersonaRecord,
  post: MomentPost,
  now: Date = new Date()
): Promise<DailyLifeState> {
  const current = await getOrInitDailyLife(persona, now);
  const digest: DailyLifeMomentDigest = {
    id: post.id,
    content: post.content.slice(0, 80),
    topic: post.topic,
    location: post.location,
    createdAt: post.createdAt,
  };
  const deduped = [
    digest,
    ...current.recentMoments.filter((m) => m.id !== post.id),
  ].slice(0, 3);

  const next: DailyLifeState = {
    ...current,
    moodTone: post.mood || current.moodTone,
    recentMoments: deduped,
    updatedAt: now.toISOString(),
  };
  return storageRepo.saveDailyLife(persona.slug, next);
}

export function buildDailyLifeDirective(
  life: DailyLifeState,
  options?: { channel?: 'chat' | 'group' | 'proactive' }
): string {
  const lines = [
    '## 今日生活与心境板（跨场景共享状态）',
    `- 今天的生活主线：${life.mainEvent}`,
    `- 今日心境底色：${life.moodTone}`,
  ];
  if (life.recentMoments.length > 0) {
    lines.push('- 你最近发过的朋友圈（你自己当然记得，对方提到时自然接茬，别生硬主动背诵）：');
    for (const m of life.recentMoments.slice(0, 2)) {
      const loc = m.location ? `（${m.location}）` : '';
      lines.push(`  · 「${m.content}」${loc}`);
    }
  }
  if (options?.channel === 'group') {
    lines.push('- 群里聊天时保持同一天的生活与心境连贯，别和单聊状态拧巴。');
  }
  return lines.join('\n');
}
