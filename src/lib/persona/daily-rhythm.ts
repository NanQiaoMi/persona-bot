/**
 * 角色作息与「此刻在做什么」：
 * - 按职业 / 性格标签匹配一套作息模板（上班族、学生、自由职业、夜猫子、轮班）
 * - 每个角色按 slug 有固定的作息偏移（±30 分钟），同一时段当天的活动保持稳定
 * - 由在场状态推导回复前的「没看到消息」延迟与打字速度，并生成注入提示词的说明
 * 纯函数，不读写存储；now 可注入，方便测试。
 */
import {
  DEFAULT_RHYTHM_ARCHETYPE,
  matchSpecializedRhythmOverride,
  RHYTHM_TEMPLATES,
} from './rhythm-templates';
import type { Availability, RhythmArchetype, RhythmSlot } from './rhythm-types';
import type { DailyRhythmOverride } from './spec';

export interface PresenceSubject {
  slug: string;
  name?: string;
  profile?: { occupation?: string; personalityTags?: string[] };
  spec?: { dailyRhythmOverride?: DailyRhythmOverride };
}

export interface PresenceState {
  archetype: RhythmArchetype;
  archetypeLabel: string;
  availability: Availability;
  /** 此刻在做什么（第一人称短语） */
  activity: string;
  /** 距离当前时段结束还有多少分钟 */
  minutesUntilChange: number;
  /** 下一个时段的活动，用于「忙完再说」之类的自然衔接 */
  nextActivity?: string;
  nextAvailability?: Availability;
  isWeekend: boolean;
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 按职业和性格标签匹配作息模板；命中词最多的胜出，都不命中时用上班族 */
export function pickRhythmArchetype(profile?: PresenceSubject['profile']): RhythmArchetype {
  const haystack = [profile?.occupation || '', ...(profile?.personalityTags || [])]
    .join(' ')
    .toLowerCase();
  if (!haystack.trim()) return DEFAULT_RHYTHM_ARCHETYPE;

  let best: RhythmArchetype = DEFAULT_RHYTHM_ARCHETYPE;
  let bestScore = 0;
  for (const tpl of Object.values(RHYTHM_TEMPLATES)) {
    const score = tpl.keywords.reduce(
      (acc, k) => (k && haystack.includes(k.toLowerCase()) ? acc + 1 : acc),
      0
    );
    if (score > bestScore) {
      best = tpl.archetype;
      bestScore = score;
    }
  }
  return best;
}

/** 每个角色固定的作息偏移（-30 ~ +30 分钟），让同类型角色不会同一分钟起床 */
export function rhythmShiftMinutes(slug: string): number {
  return (hashString(`shift:${slug}`) % 61) - 30;
}

function findSlot(slots: RhythmSlot[], minute: number): { slot: RhythmSlot; index: number } {
  const index = slots.findIndex((s) => minute >= s.startMin && minute < s.endMin);
  const safe = index === -1 ? 0 : index;
  return { slot: slots[safe], index: safe };
}

export function getPresenceState(subject: PresenceSubject, now: Date = new Date()): PresenceState {
  const override = subject.spec?.dailyRhythmOverride ?? matchSpecializedRhythmOverride(subject.profile);
  const archetype = override?.archetype ?? pickRhythmArchetype(subject.profile);
  const tpl = RHYTHM_TEMPLATES[archetype];
  const shifted = new Date(now.getTime() - rhythmShiftMinutes(subject.slug) * 60_000);
  const day = shifted.getDay();
  const isWeekend = day === 0 || day === 6;
  const slots = isWeekend ? tpl.weekend : tpl.weekday;
  const minute = shifted.getHours() * 60 + shifted.getMinutes();
  const { slot, index } = findSlot(slots, minute);

  const poolForSlot = (s: RhythmSlot): string[] => {
    const slotHour = Math.floor(s.startMin / 60);
    if (s.availability === 'asleep' && override?.asleepActivities?.length) {
      return override.asleepActivities;
    }
    if (s.availability === 'busy' && override?.busyActivities?.length) {
      return override.busyActivities;
    }
    if (s.availability === 'free') {
      if ((slotHour >= 22 || slotHour < 4) && override?.lateNightActivities?.length) {
        return override.lateNightActivities;
      }
      if (override?.freeActivities?.length) {
        return override.freeActivities;
      }
    }
    return s.activities;
  };

  const pick = (s: RhythmSlot) => {
    const pool = poolForSlot(s);
    return (
      pool[hashString(`${subject.slug}|${dateKey(shifted)}|${s.startMin}`) % pool.length] ||
      pool[0] ||
      ''
    );
  };
  const next = slots[(index + 1) % slots.length];

  return {
    archetype,
    archetypeLabel: override?.label || tpl.label,
    availability: slot.availability,
    activity: pick(slot),
    minutesUntilChange: Math.max(1, slot.endMin - minute),
    nextActivity: next ? pick(next) : undefined,
    nextAvailability: next?.availability,
    isWeekend,
  };
}

/** 注入系统提示词的「你此刻在做什么」说明 */
export function buildPresenceDirective(presence: PresenceState): string {
  const lines = ['## 你此刻在做什么（作息与在场感）'];
  if (presence.availability === 'free') {
    lines.push(`- 你现在${presence.activity}，比较闲，能正常聊。`);
  } else if (presence.availability === 'busy') {
    lines.push(`- 你现在${presence.activity}，在忙，大概还要 ${presence.minutesUntilChange} 分钟。`);
    lines.push(
      '- 回复要比平时更短更随意，可以顺口提一句在忙；如果对方的话需要多说几句，先回一句短的，再用 `[FOLLOWUP: 40~120 | 忙完后补的一句]` 补上。'
    );
  } else {
    lines.push(`- 按作息你此刻本该在睡觉（${presence.activity}）。`);
    lines.push(
      '- 你是被消息吵醒了，或者熬夜还没睡：语气迷糊、简短，可以嘟囔一句被吵醒，或者反问对方怎么还不睡；别突然精神百倍地长篇大论。'
    );
  }
  lines.push(
    '- 只在自然的时候带出自己在干嘛（比如对方问起、或刚好相关），不要每轮都汇报行程。'
  );
  return lines.join('\n');
}

export interface LatencyInput {
  availability: Availability;
  intimacy?: number;
  seed?: number;
}

/**
 * 回复前「还没看到消息」的延迟：闲时 0.6~2.5 秒，忙时 4~9 秒，睡着 5~10 秒；
 * 越亲密回得越快。为了不让请求挂太久，上限 10 秒，更久的「晚点回」交给 FOLLOWUP。
 */
export function computeReplyLatencyMs({ availability, intimacy = 60, seed = Math.random() * 1000 }: LatencyInput): number {
  const unit = (Math.abs(Math.sin(seed + 1)) * 10000) % 1;
  const [min, max] =
    availability === 'free' ? [600, 2500] : availability === 'busy' ? [4000, 9000] : [5000, 10000];
  let ms = min + (max - min) * unit;
  if (intimacy >= 80) ms *= 0.7;
  else if (intimacy < 40) ms *= 1.3;
  return Math.round(Math.min(10_000, Math.max(300, ms)));
}

export interface TypingSpeedInput {
  availability: Availability;
  hour: number;
  /** PAD 情绪里的唤醒度（-1~1），激动时打字更快 */
  arousal?: number;
  intimacy?: number;
}

/** 打字间隔的倍率：深夜、忙、刚睡醒更慢；激动、很熟时更快 */
export function typingSpeedFactor({ availability, hour, arousal = 0, intimacy = 60 }: TypingSpeedInput): number {
  let f = 1;
  if (availability === 'asleep') f *= 1.35;
  else if (availability === 'busy') f *= 1.2;
  if (hour >= 1 && hour < 6) f *= 1.15;
  if (arousal > 0.5) f *= 0.8;
  if (intimacy >= 80) f *= 0.9;
  return Math.round(Math.min(1.8, Math.max(0.6, f)) * 100) / 100;
}

/** 等待期间给前端的状态文案（像微信里还没变成「正在输入」之前的那段空白） */
export function presenceStatusText(name: string, presence: PresenceState): string | null {
  if (presence.availability === 'busy') return `${name} ${presence.activity}，还没看到消息`;
  if (presence.availability === 'asleep') return `${name} 可能在睡觉…`;
  return null;
}
