/** 主动消息的场景与离线话术类型（话术数据在 proactive-lines.ts） */

/**
 * long_idle：好几个小时没聊，主动找对方
 * late_night / morning / afternoon / evening：按时段随手打招呼
 * idle_nudge_1 / idle_nudge_2：刚聊着对方突然不回了，第 1 / 第 2 次轻敲
 */
export type ProactiveSituation =
  | 'long_idle'
  | 'late_night'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'idle_nudge_1'
  | 'idle_nudge_2';

export interface ProactiveLine {
  /** 第一人称内心戏，1 句 */
  thought: string;
  /** 1~2 条短消息；可含占位符 {hours}（几小时）、{hour}（现在几点）、{topic}（上次聊到的话题） */
  bursts: string[];
  /** 4~8 字的心情标签，可带 1 个 emoji */
  mood: string;
  /** 情绪愉悦度变化，默认 0.05 */
  pleasureDelta?: number;
  /** 亲密度变化，默认 1 */
  intimacyChange?: number;
}
