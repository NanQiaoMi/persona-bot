import { describe, expect, it } from 'vitest';
import { stripEmoji } from '@/lib/text/emoji';
import { PERSONA_MODES } from '@/lib/grok/persona-modes';

describe('界面文字里去掉 emoji', () => {
  it('去掉心情里的 emoji（含组合、变体符），保留中文与标点', () => {
    expect(stripEmoji('攒了一卷好风景 📷')).toBe('攒了一卷好风景');
    expect(stripEmoji('全军待命 🐾')).toBe('全军待命');
    expect(stripEmoji('有点累😮‍💨，但还行👍🏻')).toBe('有点累，但还行');
    expect(stripEmoji('❤️心情不错')).toBe('心情不错');
    expect(stripEmoji('普通文字，100% 不变')).toBe('普通文字，100% 不变');
    expect(stripEmoji('')).toBe('');
  });

  it('人格模式只用图标，不再带 emoji', () => {
    for (const spec of Object.values(PERSONA_MODES)) {
      expect(spec.icon).toMatch(/^(mask|bolt|heart|compass)$/);
      expect(stripEmoji(spec.shortLabel)).toBe(spec.shortLabel);
    }
  });
});
