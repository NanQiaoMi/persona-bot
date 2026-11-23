import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { UnifiedStorageRepository } from '@/lib/storage/repository';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';

describe('UnifiedStorageRepository & Builtin Presets', () => {
  let tmpRoot: string;
  let repo: UnifiedStorageRepository;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'personabot-test-'));
    repo = new UnifiedStorageRepository(
      path.join(tmpRoot, 'exes'),
      path.join(tmpRoot, 'data')
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('auto-seeds all built-in Grok presets when exes directory is empty', async () => {
    const personas = await repo.listPersonas();
    expect(personas.length).toBe(BUILTIN_PRESETS.length);
    const slugs = personas.map((p) => p.slug);
    expect(slugs).toContain('grok-ella');
    expect(slugs).toContain('lin-wan');
    expect(slugs).toContain('su-nian');
    expect(slugs).toContain('zero-arch');
  });

  it('saves, reads, updates emotion/intimacy, and deletes custom personas', async () => {
    await repo.savePersona({
      slug: 'test-char',
      name: '测试小狐狸',
      version: 'v2.0',
      isPreset: false,
      defaultMode: 'fun',
      intimacy: 55,
      profile: {
        mbti: 'ENFP',
        personalityTags: ['机灵', '吐槽'],
      },
      personaMd: '# 测试小狐狸\n## Correction 记录\n（暂无记录）',
      memoriesMd: '# 记忆\n第一次见面',
      aiProfileMd: '测试人物画像',
      emotionState: {
        primary: 'happy',
        pleasure: 0.5,
        arousal: 0.5,
        dominance: 0.5,
        intensity: 0.6,
        moodLabel: '开心',
        lastUpdated: new Date().toISOString(),
        decayRate: 0.1,
      },
      corrections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const loaded = await repo.getPersona('test-char');
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('测试小狐狸');
    expect(loaded?.intimacy).toBe(55);

    await repo.updateEmotionAndIntimacy(
      'test-char',
      {
        ...loaded!.emotionState,
        primary: 'excited',
        moodLabel: '超兴奋',
      },
      82
    );

    const afterEmotion = await repo.getPersona('test-char');
    expect(afterEmotion?.emotionState.primary).toBe('excited');
    expect(afterEmotion?.intimacy).toBe(82);

    const withCorrection = await repo.addCorrection('test-char', {
      userInput: '你好',
      botResponse: '很高兴为您服务',
      correction: '不要说客服套话，直接怼回来',
      category: 'style',
    });
    expect(withCorrection?.corrections.length).toBe(1);
    expect(withCorrection?.personaMd).toContain('不要说客服套话');

    const deleted = await repo.deletePersona('test-char');
    expect(deleted).toBe(true);
    expect(await repo.getPersona('test-char')).toBeNull();
  });

  it('persists conversation messages and runtime settings', async () => {
    await repo.ensurePresetsSeeded();
    await repo.appendMessages('grok-ella', [
      {
        id: 'm1',
        role: 'user',
        content: '今天有什么新鲜事？',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'm2',
        role: 'assistant',
        content: '刚刷完热搜，笑死我了',
        thought: '先用热搜梗接住话题',
        timestamp: new Date().toISOString(),
      },
    ]);

    const history = await repo.getConversation('grok-ella');
    expect(history).toHaveLength(2);
    expect(history[1].thought).toBe('先用热搜梗接住话题');

    const updatedSettings = await repo.saveSettings({
      llmProvider: 'deepseek',
      llmModel: 'deepseek-chat',
      defaultDeepSearch: false,
    });
    expect(updatedSettings.llmProvider).toBe('deepseek');
    expect(updatedSettings.defaultDeepSearch).toBe(false);

    const reloaded = await repo.getSettings();
    expect(reloaded.llmModel).toBe('deepseek-chat');
  });
});
