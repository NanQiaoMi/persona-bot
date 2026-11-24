import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveGeneratedMediaBuffer } from '@/lib/grok/image-generator';
import {
  inferAppearanceAnchorFromImage,
  mergeAppearanceAnchorUpdate,
} from '@/lib/persona/appearance-evolution';
import { consolidatePersonaEvolution } from '@/lib/persona/evolution';
import { applySmoothTraitDeltas, heuristicTraits } from '@/lib/persona/traits';
import { POST as generateRefRoute } from '@/app/api/media/reference/generate/route';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaRecord, RuntimeSettings } from '@/lib/storage/types';

const TEST_SETTINGS: RuntimeSettings = {
  llmProvider: 'local_gateway',
  llmBaseUrl: 'http://127.0.0.1:18630/v1',
  llmApiKey: 'test-key',
  llmModel: 'gpt-5.6',
  imageModel: 'gpt-image-2.6',
  searchProvider: 'builtin',
  tavilyApiKey: '',
  serperApiKey: '',
  defaultThinkMode: true,
  defaultDeepSearch: false,
  autoVoicePlayback: false,
  theme: 'light',
};

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+1N8AAAAASUVORK5CYII=';

function makeTestPersona(slug: string, overrides?: Partial<PersonaRecord>): PersonaRecord {
  const now = new Date().toISOString();
  const baseProfile = {
    mbti: 'ENFP',
    personalityTags: ['温柔', '脑洞大'],
    ...(overrides?.profile || {}),
  };
  return {
    slug,
    name: '林雾测试',
    version: 'v2.0',
    isPreset: false,
    defaultMode: 'fun',
    intimacy: 65,
    emotionState: {
      primary: 'happy',
      pleasure: 0.3,
      arousal: 0.5,
      dominance: 0.2,
      intensity: 0.5,
      moodLabel: '愉快',
      lastUpdated: now,
      decayRate: 0.1,
    },
    personaMd: '# 角色设定\n温柔幽默但有点嘴硬。',
    memoriesMd: '# 共同记忆\n- 喜欢喝冰美式',
    aiProfileMd: '# 档案',
    corrections: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
    profile: baseProfile,
  };
}

describe('Appearance Anchor & Personality Trait Evolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. inferAppearanceAnchorFromImage sends multimodal image_url data URL and cleans extracted anchor', async () => {
    const localRefUrl = await saveGeneratedMediaBuffer(
      Buffer.from(TINY_PNG_B64, 'base64'),
      'png',
      'ref'
    );

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const userMsg = body.messages?.[1];
      expect(Array.isArray(userMsg?.content)).toBe(true);
      const imagePart = userMsg.content.find((p: { type: string }) => p.type === 'image_url');
      expect(imagePart?.image_url?.url).toMatch(/^data:image\/png;base64,/);

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '「外貌锚点：20岁出头黑长直清冷少女，常穿米白针织开衫，自然日系写实摄影画风」',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await inferAppearanceAnchorFromImage({
      referenceImageUrl: localRefUrl,
      personaName: '林雾',
      personaStyle: '清冷、温柔',
      settings: { llmBaseUrl: 'http://127.0.0.1:18630/v1', llmApiKey: 'test-key' },
    });

    expect(res.usedVision).toBe(true);
    expect(res.anchor).toBe('20岁出头黑长直清冷少女，常穿米白针织开衫，自然日系写实摄影画风');
  });

  it('2. mergeAppearanceAnchorUpdate enriches when unlocked and strictly protects when locked', () => {
    const filled = mergeAppearanceAnchorUpdate(undefined, '黑长直少女，自然写实画风', false);
    expect(filled.updated).toBe(true);
    expect(filled.anchor).toBe('黑长直少女，自然写实画风');

    const enriched = mergeAppearanceAnchorUpdate(
      '黑长直少女，自然写实画风',
      '常戴银色细框眼镜',
      false
    );
    expect(enriched.updated).toBe(true);
    expect(enriched.anchor).toBe('黑长直少女，自然写实画风；常戴银色细框眼镜');

    const locked = mergeAppearanceAnchorUpdate(
      '用户手动锁定的专属外貌',
      '常戴银色细框眼镜',
      true
    );
    expect(locked.updated).toBe(false);
    expect(locked.anchor).toBe('用户手动锁定的专属外貌');
  });

  it('3. applySmoothTraitDeltas bounds single-step delta to [-0.08, +0.08] and final value to [0.1, 0.95]', () => {
    const base = heuristicTraits('温和幽默', { mbti: 'ENFP' });
    const extremeBase = { ...base, openness: 0.92, neuroticism: 0.14 };

    const res = applySmoothTraitDeltas(extremeBase, {
      openness: 0.5, // clamped to +0.08 -> 1.0 -> clamped to 0.95
      neuroticism: -0.5, // clamped to -0.08 -> 0.06 -> clamped to 0.1
      agreeableness: 0.05,
    });

    expect(res.updated).toBe(true);
    expect(res.traits.openness).toBe(0.95);
    expect(res.traits.neuroticism).toBe(0.1);
    expect(Number((res.traits.agreeableness - base.agreeableness).toFixed(2))).toBe(0.05);
    expect(res.changedKeys).toContain('openness');
    expect(res.changedKeys).toContain('neuroticism');
    expect(res.changedKeys).toContain('agreeableness');
  });

  it('4. POST /api/media/reference/generate auto-fills appearanceAnchor when unlocked and preserves when locked', async () => {
    const unlockedSlug = `ref-auto-anchor-${Date.now()}`;
    const lockedSlug = `ref-locked-anchor-${Date.now()}`;

    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue(TEST_SETTINGS);

    await storageRepo.savePersona(makeTestPersona(unlockedSlug));
    await storageRepo.savePersona(
      makeTestPersona(lockedSlug, {
        profile: {
          mbti: 'INTJ',
          personalityTags: ['冷静'],
          appearanceAnchor: '用户手动锁定的短发黑衣形象',
          appearanceAnchorLocked: true,
        },
      })
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/images/generations') || url.endsWith('/images/edits')) {
          return new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '22岁温柔卷发女生，淡妆浅色衬衫，棚拍清透写实人像风格',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );

    try {
      const resUnlocked = await generateRefRoute(
        new Request('http://localhost:3000/api/media/reference/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: unlockedSlug, mode: 'manual' }),
        })
      );
      const dataUnlocked = await resUnlocked.json();
      expect(dataUnlocked.success).toBe(true);
      expect(dataUnlocked.appearanceAnchorUpdated).toBe(true);
      expect(dataUnlocked.persona.profile.appearanceAnchor).toBe(
        '22岁温柔卷发女生，淡妆浅色衬衫，棚拍清透写实人像风格'
      );

      const resLocked = await generateRefRoute(
        new Request('http://localhost:3000/api/media/reference/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: lockedSlug, mode: 'manual' }),
        })
      );
      const dataLocked = await resLocked.json();
      expect(dataLocked.success).toBe(true);
      expect(dataLocked.appearanceAnchorUpdated).toBe(false);
      expect(dataLocked.persona.profile.appearanceAnchor).toBe('用户手动锁定的短发黑衣形象');
      expect(dataLocked.persona.profile.appearanceAnchorLocked).toBe(true);
    } finally {
      await storageRepo.deletePersona(unlockedSlug);
      await storageRepo.deletePersona(lockedSlug);
    }
  });

  it('5. consolidatePersonaEvolution evolves personalityTags, Big-Five traits, appearanceAnchor, and writes rollback snapshot', async () => {
    const slug = `evolve-traits-${Date.now()}`;
    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue(TEST_SETTINGS);

    const initialTraits = heuristicTraits('温柔脑洞大', { mbti: 'ENFP' });
    await storageRepo.savePersona(
      makeTestPersona(slug, {
        profile: {
          mbti: 'ENFP',
          personalityTags: ['温柔', '脑洞大'],
          appearanceAnchor: '20出头浅棕微卷发女生',
          appearanceAnchorLocked: false,
        },
        spec: {
          specVersion: 1,
          traits: initialTraits,
          learned: [],
        },
      })
    );
    await storageRepo.saveConversation(slug, [
      {
        id: 'm1',
        role: 'user',
        content: '你每次都这么护短，下次拍照记得戴那副金丝眼镜穿米白毛衣呀',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'm2',
        role: 'assistant',
        content: '行，听你的，以后我都戴金丝眼镜配米白毛衣',
        timestamp: new Date().toISOString(),
      },
    ]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    memories: ['约定拍照戴金丝眼镜穿米白毛衣'],
                    habits: ['聊天时容易对朋友护短'],
                    styleRules: ['口语简短自然少用书面语'],
                    newPersonalityTags: ['护短', '温柔', '爱操心'],
                    traitDeltas: {
                      agreeableness: 0.25, // bounded to +0.08
                      openness: 0.04,
                    },
                    appearanceUpdate: '常戴金丝眼镜、穿米白毛衣',
                    summary: '学会护短默契并更新眼镜穿搭特征',
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    try {
      const result = await consolidatePersonaEvolution(slug, {
        force: true,
        reason: '测试性格与外貌联合演进',
      });

      expect(result.evolved).toBe(true);
      expect(result.snapshotId).toBeTruthy();
      expect(result.addedPersonalityTags).toEqual(['护短', '爱操心']);
      expect(result.updatedTraits).toEqual(
        expect.arrayContaining(['agreeableness', 'openness'])
      );
      expect(result.updatedAppearanceAnchor).toBe(
        '20出头浅棕微卷发女生；常戴金丝眼镜、穿米白毛衣'
      );

      const persisted = await storageRepo.getPersona(slug);
      expect(persisted?.profile.personalityTags).toEqual([
        '温柔',
        '脑洞大',
        '护短',
        '爱操心',
      ]);
      expect(persisted?.profile.appearanceAnchor).toBe(
        '20出头浅棕微卷发女生；常戴金丝眼镜、穿米白毛衣'
      );
      expect(
        Number(((persisted?.spec?.traits?.agreeableness ?? 0) - initialTraits.agreeableness).toFixed(2))
      ).toBe(0.08);

      const snapshots = await storageRepo.listSnapshots(slug);
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });
});
