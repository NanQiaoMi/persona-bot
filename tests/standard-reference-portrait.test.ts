import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildStandardReferencePrompt,
  generateStandardReferencePortrait,
  saveGeneratedMediaBuffer,
} from '@/lib/grok/image-generator';
import { POST as generateRefRoute } from '@/app/api/media/reference/generate/route';
import { POST as generateMediaRoute } from '@/app/api/media/generate/route';
import { storageRepo } from '@/lib/storage/repository';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+1N8AAAAASUVORK5CYII=';

describe('Standard Reference Portrait Generator & API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds studio reference prompt with neutral gray background, front-facing framing, and appearance anchor', () => {
    const withSource = buildStandardReferencePrompt(
      'Ella',
      '温柔, 知性',
      '黑长直齐肩发，浅色针织衫',
      true
    );
    expect(withSource).toContain('EXACT same person from the reference photo');
    expect(withSource).toContain('Front-facing head-and-shoulders to chest-up studio portrait');
    expect(withSource).toContain('light neutral gray seamless studio background');
    expect(withSource).toContain('even soft diffused frontal studio lighting');
    expect(withSource).toContain('黑长直齐肩发，浅色针织衫');

    const withoutSource = buildStandardReferencePrompt(
      'Ella',
      '温柔',
      '黑长直齐肩发',
      false
    );
    expect(withoutSource).not.toContain('from the reference photo');
    expect(withoutSource).toContain('light neutral gray seamless studio background');
    expect(withoutSource).toContain('黑长直齐肩发');
  });

  it('refines from sourceImageUrl via /images/edits and saves ref_*.png', async () => {
    const sourceUrl = await saveGeneratedMediaBuffer(
      Buffer.from(TINY_PNG_B64, 'base64'),
      'png',
      'photo'
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe('http://127.0.0.1:18630/v1/images/edits');
      return new Response(
        JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await generateStandardReferencePortrait({
      personaName: 'Ella',
      appearanceAnchor: '黑长直少女',
      sourceImageUrl: sourceUrl,
      allowTextFallback: false,
      baseUrl: 'http://127.0.0.1:18630/v1',
      imageModel: 'gpt-image-2.6',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.usedReferenceImage).toBe(true);
    expect(res.imageUrl).toMatch(/^\/api\/media\/ref_.*\.png$/);
  });

  it('does not fall back to /images/generations when allowTextFallback is false and /images/edits fails', async () => {
    const sourceUrl = await saveGeneratedMediaBuffer(
      Buffer.from(TINY_PNG_B64, 'base64'),
      'png',
      'photo'
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/images/generations')) {
        throw new Error('Should not fall back to text-to-image');
      }
      return new Response('edit unsupported', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await generateStandardReferencePortrait({
      personaName: 'Ella',
      sourceImageUrl: sourceUrl,
      allowTextFallback: false,
      baseUrl: 'http://127.0.0.1:18630/v1',
      imageModel: 'gpt-image-2.6',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.imageUrl).toBeUndefined();
    expect(res.errorHint).toContain('已保留原图作为兜底');
  });

  it('generates standard portrait via /images/generations when no sourceImageUrl exists', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe('http://127.0.0.1:18630/v1/images/generations');
      return new Response(
        JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await generateStandardReferencePortrait({
      personaName: 'Ella',
      appearanceAnchor: '黑长直少女',
      baseUrl: 'http://127.0.0.1:18630/v1',
      imageModel: 'gpt-image-2.6',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.usedReferenceImage).toBe(false);
    expect(res.imageUrl).toMatch(/^\/api\/media\/ref_.*\.png$/);
  });

  it('POST /api/media/reference/generate protects against overwriting manual user upload during async refine', async () => {
    const slug = `ref-race-${Date.now()}`;
    const firstPhotoUrl = await saveGeneratedMediaBuffer(
      Buffer.from(TINY_PNG_B64, 'base64'),
      'png',
      'photo'
    );
    const manualUserRefUrl = '/api/media/ref_manual_user.png';

    await storageRepo.savePersona({
      slug,
      name: '测试竞态角色',
      version: 'v2.0',
      isPreset: false,
      defaultMode: 'fun',
      intimacy: 60,
      profile: {
        mbti: 'ENFP',
        personalityTags: ['自然', '活泼'],
        referenceImageUrl: manualUserRefUrl,
      },
      emotionState: {
        primary: 'calm',
        pleasure: 0.2,
        arousal: 0.4,
        dominance: 0.1,
        intensity: 0.4,
        moodLabel: '平静',
        lastUpdated: new Date().toISOString(),
        decayRate: 0.1,
      },
      personaMd: '# 测试',
      memoriesMd: '# 记忆',
      aiProfileMd: '# 档案',
      corrections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    try {
      const req = new Request('http://localhost:3000/api/media/reference/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          sourceImageUrl: firstPhotoUrl,
          expectedCurrentRef: firstPhotoUrl,
          mode: 'auto',
        }),
      });

      const response = await generateRefRoute(req);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.skippedOverwrite).toBe(true);
      expect(data.referenceImageUrl).toBe(manualUserRefUrl);

      const persisted = await storageRepo.getPersona(slug);
      expect(persisted?.profile.referenceImageUrl).toBe(manualUserRefUrl);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });

  it('POST /api/media/generate auto-locks first photo as fallback and emits shouldRefineReference signal', async () => {
    const slug = `first-photo-${Date.now()}`;
    await storageRepo.savePersona({
      slug,
      name: '首次发图角色',
      version: 'v2.0',
      isPreset: false,
      defaultMode: 'fun',
      intimacy: 60,
      profile: {
        mbti: 'ENFP',
        personalityTags: ['自然'],
      },
      emotionState: {
        primary: 'happy',
        pleasure: 0.4,
        arousal: 0.5,
        dominance: 0.2,
        intensity: 0.5,
        moodLabel: '开心',
        lastUpdated: new Date().toISOString(),
        decayRate: 0.1,
      },
      personaMd: '# 测试',
      memoriesMd: '# 记忆',
      aiProfileMd: '# 档案',
      corrections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    // 生成结果写回到一条已存在的消息上（与真实流程一致）
    await storageRepo.saveConversation(slug, [
      {
        id: 'msg_1',
        role: 'assistant',
        content: '给你看看',
        timestamp: new Date().toISOString(),
        mediaCards: [{ type: 'photo', caption: '咖啡厅随手拍', status: 'generating' }],
      },
    ]);

    try {
      const req = new Request('http://localhost:3000/api/media/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          messageId: 'msg_1',
          cardIndex: 0,
          kind: 'photo',
          caption: '咖啡厅随手拍',
        }),
      });

      const response = await generateMediaRoute(req);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.autoLockedReference).toBe(true);
      expect(data.shouldRefineReference).toBe(true);
      expect(data.sourcePhotoUrl).toMatch(/^\/api\/media\/photo_.*\.png$/);
      expect(data.card?.imageUrl).toBe(data.sourcePhotoUrl);

      const persisted = await storageRepo.getPersona(slug);
      expect(persisted?.profile.referenceImageUrl).toBe(data.sourcePhotoUrl);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });
});
