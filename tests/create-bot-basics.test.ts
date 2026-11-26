import { describe, expect, it } from 'vitest';
import { extractPersonalityTags, uniqueSlug } from '@/lib/persona/basic-tags';
import { PromptAssembler } from '@/lib/prompt-assembler';

describe('一句话性格拆标签', () => {
  it('按「的、逗号」等拆成有意义的短标签', () => {
    expect(extractPersonalityTags('嘴硬爱撒娇的深夜搭子')).toEqual(['嘴硬爱撒娇', '深夜搭子']);
    expect(extractPersonalityTags('毒舌，护短、很宠我')).toEqual(['毒舌', '护短', '宠我']);
  });
  it('空输入返回空数组，过长片段截到 6 个字', () => {
    expect(extractPersonalityTags('')).toEqual([]);
    expect(extractPersonalityTags('特别喜欢半夜打电话聊人生')[0].length).toBeLessThanOrEqual(6);
  });
});

describe('新建角色不覆盖同名老角色', () => {
  it('名字被占用时依次加 -2、-3', async () => {
    const taken = new Set(['林晚', '林晚-2']);
    expect(await uniqueSlug('林晚', async (s) => taken.has(s))).toBe('林晚-3');
    expect(await uniqueSlug('阿凛', async (s) => taken.has(s))).toBe('阿凛');
  });
});

describe('基础性格进入聊天人设', () => {
  it('写了基础性格时出现在系统提示词里，没写时不出现', () => {
    const asm = new PromptAssembler();
    const base = { persona_md: '', memories_md: '', ai_profile: '' };
    const withBasic = asm.assembleSystemPrompt({ ...base, meta: { basicPersonality: '嘴硬爱撒娇的深夜搭子' } });
    expect(withBasic).toContain('主人给你定的基础性格');
    expect(withBasic).toContain('嘴硬爱撒娇的深夜搭子');
    expect(asm.assembleSystemPrompt({ ...base, meta: {} })).not.toContain('主人给你定的基础性格');
  });
});

describe('快速创建：重名不覆盖，基础设定能存能读', () => {
  it('同名第二次创建得到新 slug，老角色和新角色的基础性格、外貌锁定都在', { timeout: 30_000 }, async () => {
    const { distillPersona } = await import('@/lib/persona/distiller');
    const { storageRepo } = await import('@/lib/storage/repository');
    const first = await distillPersona({ name: '重名测试', ensureUniqueSlug: true, basicPersonality: '老的' });
    const second = await distillPersona({
      name: '重名测试',
      ensureUniqueSlug: true,
      basicPersonality: '嘴硬爱撒娇的深夜搭子',
      personalityInfo: '嘴硬爱撒娇的深夜搭子',
      appearanceAnchor: '黑长直微卷',
    });
    expect(second.persona.slug).not.toBe(first.persona.slug);
    const oldOne = await storageRepo.getPersona(first.persona.slug);
    const newOne = await storageRepo.getPersona(second.persona.slug);
    expect(oldOne?.profile.basicPersonality).toBe('老的');
    expect(newOne?.profile.basicPersonality).toBe('嘴硬爱撒娇的深夜搭子');
    expect(newOne?.profile.appearanceAnchorLocked).toBe(true);
    expect(newOne?.profile.personalityTags).toEqual(expect.arrayContaining(['嘴硬爱撒娇', '深夜搭子']));
  });
});
