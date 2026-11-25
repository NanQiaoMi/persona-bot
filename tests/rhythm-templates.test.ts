import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RHYTHM_ARCHETYPE,
  RHYTHM_TEMPLATES,
} from '@/lib/persona/rhythm-templates';
import type { RhythmArchetype, RhythmSlot } from '@/lib/persona/rhythm-types';

const ARCHETYPES = Object.keys(RHYTHM_TEMPLATES) as RhythmArchetype[];
const TABLE_KEYS = ['weekday', 'weekend'] as const;
const TRAILING_PUNCTUATION = /[。！？.,;!?]$/;

/** night_owl 凌晨 3 点可能醒着，改为检查 5 点是否在睡觉 */
function sleepCheckMinute(archetype: RhythmArchetype): number {
  return archetype === 'night_owl' ? 300 : 180;
}

function slotAt(slots: RhythmSlot[], minute: number): RhythmSlot | undefined {
  return slots.find((slot) => slot.startMin <= minute && minute < slot.endMin);
}

describe('RHYTHM_TEMPLATES 作息模板', () => {
  it('包含全部五类原型，且默认原型存在', () => {
    expect(ARCHETYPES.sort()).toEqual(
      ['creative', 'night_owl', 'office', 'service', 'student'].sort(),
    );
    expect(RHYTHM_TEMPLATES[DEFAULT_RHYTHM_ARCHETYPE]).toBeDefined();
  });

  for (const archetype of ARCHETYPES) {
    describe(archetype, () => {
      const template = RHYTHM_TEMPLATES[archetype];

      it('基本信息完整', () => {
        expect(template.archetype).toBe(archetype);
        expect(template.label.length).toBeGreaterThan(0);
        expect(template.keywords.length).toBeGreaterThan(0);
        for (const keyword of template.keywords) {
          expect(keyword.trim().length).toBeGreaterThan(0);
        }
      });

      for (const tableKey of TABLE_KEYS) {
        describe(tableKey, () => {
          const slots = template[tableKey];

          it('时间表数量在 8~14 之间', () => {
            expect(slots.length).toBeGreaterThanOrEqual(8);
            expect(slots.length).toBeLessThanOrEqual(14);
          });

          it('首尾覆盖整天 0~1440', () => {
            expect(slots[0].startMin).toBe(0);
            expect(slots[slots.length - 1].endMin).toBe(1440);
          });

          it('时段首尾相接、按开始时间升序、无空隙无重叠', () => {
            for (let i = 0; i < slots.length; i++) {
              const slot = slots[i];
              expect(slot.startMin).toBeLessThan(slot.endMin);
              if (i > 0) {
                expect(slot.startMin).toBe(slots[i - 1].endMin);
              }
            }
          });

          it('每个时段有 2~4 条非空、简短、无句末标点的活动描述', () => {
            for (const slot of slots) {
              expect(slot.activities.length).toBeGreaterThanOrEqual(2);
              expect(slot.activities.length).toBeLessThanOrEqual(4);
              for (const activity of slot.activities) {
                expect(activity.trim().length).toBeGreaterThan(0);
                expect(activity.length).toBeLessThanOrEqual(12);
                expect(activity).not.toMatch(TRAILING_PUNCTUATION);
              }
            }
          });

          it('包含睡眠时段，且在关键时刻处于睡眠', () => {
            expect(slots.some((slot) => slot.availability === 'asleep')).toBe(true);
            const sleeping = slotAt(slots, sleepCheckMinute(archetype));
            expect(sleeping?.availability).toBe('asleep');
          });

          it('同时包含忙碌与空闲时段', () => {
            expect(slots.some((slot) => slot.availability === 'busy')).toBe(true);
            expect(slots.some((slot) => slot.availability === 'free')).toBe(true);
          });
        });
      }
    });
  }
});
