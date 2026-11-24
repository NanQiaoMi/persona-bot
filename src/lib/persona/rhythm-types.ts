/** 角色作息模板的类型定义（模板数据在 rhythm-templates.ts，计算逻辑在 daily-rhythm.ts） */

export type RhythmArchetype = 'office' | 'student' | 'creative' | 'night_owl' | 'service';

/** free：能随时回；busy：在忙，回得慢且短；asleep：在睡觉 */
export type Availability = 'free' | 'busy' | 'asleep';

export interface RhythmSlot {
  /** 当天第几分钟开始（含），0~1439 */
  startMin: number;
  /** 当天第几分钟结束（不含），1~1440；同一天内不跨零点 */
  endMin: number;
  availability: Availability;
  /** 2~4 个第一人称短语，描述此刻在做什么，如「在工位改方案」「挤地铁中」 */
  activities: string[];
}

export interface RhythmTemplate {
  archetype: RhythmArchetype;
  /** 中文名，如「朝九晚六上班族」 */
  label: string;
  /** 职业 / 性格标签里出现这些词时匹配到该模板 */
  keywords: string[];
  /** 工作日时间表：按 startMin 升序，首尾相接完整覆盖 0~1440 */
  weekday: RhythmSlot[];
  /** 周末时间表：同上 */
  weekend: RhythmSlot[];
}
