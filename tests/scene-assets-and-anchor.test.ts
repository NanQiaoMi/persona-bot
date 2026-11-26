import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildMediaGenerationPrompt,
  buildReferenceAwarePrompt,
  saveGeneratedMediaBuffer,
} from '@/lib/grok/image-generator';
import {
  buildGuaranteedAppearanceFallback,
  inferAppearanceAnchorFromImage,
} from '@/lib/persona/appearance-evolution';
import {
  autoCaptureSceneAssetFromPhoto,
  detectSceneCandidateFromPhoto,
  matchSceneAssetForCaption,
} from '@/lib/persona/scene-assets';
import {
  GET as getAssetsRoute,
  POST as postAssetsRoute,
  DELETE as deleteAssetsRoute,
} from '@/app/api/personas/[slug]/assets/route';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaRecord, SceneAsset } from '@/lib/storage/types';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+1N8AAAAASUVORK5CYII=';

function makePersona(slug: string): PersonaRecord {
  const now = new Date().toISOString();
  return {
    slug,
    name: '苏苏测试',
    version: 'v2.0',
    isPreset: false,
    defaultMode: 'fun',
    intimacy: 70,
    profile: {
      mbti: 'ENFP',
      personalityTags: ['元气', '爱拍照'],
    },
    emotionState: {
      primary: 'happy',
      pleasure: 0.4,
      arousal: 0.5,
      dominance: 0.2,
      intensity: 0.5,
      moodLabel: '开心',
      lastUpdated: now,
      decayRate: 0.1,
    },
    personaMd: '# 设定\n黑长直微卷女生，平时喜欢穿浅色毛衣。',
    memoriesMd: '# 记忆',
    aiProfileMd: '# 档案',
    corrections: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('Guaranteed Appearance Anchor & Scene Assets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('always produces a concise appearance anchor offline without vision', async () => {
    const guaranteed = buildGuaranteedAppearanceFallback({
      personaName: '苏苏',
      personaStyle: '温柔、元气',
      personaMd: '黑长直女生',
    });
    expect(guaranteed).toBeTruthy();
    expect(guaranteed!.length).toBeGreaterThanOrEqual(10);

    const inferred = await inferAppearanceAnchorFromImage({
      personaName: '苏苏',
      personaStyle: '温柔、元气',
      personaMd: '黑长直女生',
      force: true,
      settings: { llmApiKey: '' },
    });
    expect(inferred.usedVision).toBe(false);
    expect(inferred.anchor).toBeTruthy();
  });

  it('matches scene assets by name/keywords and distinguishes pure environment vs selfie', () => {
    const assets: SceneAsset[] = [
      {
        id: 'asset_bedroom',
        name: '我的卧室',
        category: 'room',
        imageUrl: '/api/media/asset_bedroom.png',
        description: '暖黄色台灯与原木书桌的温馨卧室',
        keywords: ['卧室', '房间', '书桌'],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'asset_cafe',
        name: '街角咖啡馆',
        category: 'location',
        imageUrl: '/api/media/asset_cafe.png',
        description: '木质吧台与落地窗阳光咖啡店',
        keywords: ['咖啡馆', '咖啡店', '窗边'],
        createdAt: new Date().toISOString(),
      },
    ];

    const pureEnvMatch = matchSceneAssetForCaption(
      assets,
      '拍一张房间里书桌一角的暖光台灯空镜'
    );
    expect(pureEnvMatch?.asset.id).toBe('asset_bedroom');
    expect(pureEnvMatch?.isPureEnvironment).toBe(true);

    const personSelfieMatch = matchSceneAssetForCaption(
      assets,
      '在常去的咖啡馆窗边微笑自拍半身照'
    );
    expect(personSelfieMatch?.asset.id).toBe('asset_cafe');
    expect(personSelfieMatch?.isPureEnvironment).toBe(false);
  });

  it('injects sceneAnchor into both text-to-image and reference-aware prompts', () => {
    const t2i = buildMediaGenerationPrompt(
      'photo',
      '在房间里喝热茶',
      '苏苏',
      '温柔',
      '黑长直女生',
      '原木书桌与暖色台灯卧室'
    );
    expect(t2i).toContain('Consistent room/environment setting: "原木书桌与暖色台灯卧室".');

    const ref = buildReferenceAwarePrompt(
      'photo',
      '在房间里喝热茶',
      '苏苏',
      '温柔',
      '黑长直女生',
      '原木书桌与暖色台灯卧室'
    );
    expect(ref).toContain('Consistent room/environment setting: "原木书桌与暖色台灯卧室".');
  });

  it('handles auto_anchor, save_existing, GET, and DELETE on /api/personas/[slug]/assets', async () => {
    const slug = `assets-api-${Date.now()}`;
    await storageRepo.savePersona(makePersona(slug));

    const existingUrl = await saveGeneratedMediaBuffer(
      Buffer.from(TINY_PNG_B64, 'base64'),
      'png',
      'photo'
    );

    try {
      // 1. auto_anchor fills appearanceAnchor reliably
      const anchorRes = await postAssetsRoute(
        new Request(`http://localhost:3000/api/personas/${slug}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'auto_anchor' }),
        }),
        { params: Promise.resolve({ slug }) }
      );
      const anchorData = await anchorRes.json();
      expect(anchorData.success).toBe(true);
      expect(anchorData.appearanceAnchor).toBeTruthy();

      const updatedPersona = await storageRepo.getPersona(slug);
      expect(updatedPersona?.profile.appearanceAnchor).toBe(anchorData.appearanceAnchor);

      // 2. save_existing creates a persistent scene asset
      const saveRes = await postAssetsRoute(
        new Request(`http://localhost:3000/api/personas/${slug}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_existing',
            name: '我的卧室',
            category: 'room',
            imageUrl: existingUrl,
            description: '暖黄色床头灯和白色书桌',
          }),
        }),
        { params: Promise.resolve({ slug }) }
      );
      const saveData = await saveRes.json();
      expect(saveData.success).toBe(true);
      expect(saveData.asset.name).toBe('我的卧室');
      expect(saveData.assets.length).toBe(1);

      // 3. GET lists assets
      const getRes = await getAssetsRoute(
        new Request(`http://localhost:3000/api/personas/${slug}/assets`),
        { params: Promise.resolve({ slug }) }
      );
      const getData = await getRes.json();
      expect(getData.success).toBe(true);
      expect(getData.assets.length).toBe(1);

      // 4. DELETE removes asset
      const delRes = await deleteAssetsRoute(
        new Request(
          `http://localhost:3000/api/personas/${slug}/assets?assetId=${encodeURIComponent(saveData.asset.id)}`,
          { method: 'DELETE' }
        ),
        { params: Promise.resolve({ slug }) }
      );
      const delData = await delRes.json();
      expect(delData.success).toBe(true);
      expect(delData.assets.length).toBe(0);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });

  it('detectSceneCandidateFromPhoto identifies explicit locations/rooms and skips vague selfies', () => {
    expect(
      detectSceneCandidateFromPhoto({
        location: '街角咖啡店',
        caption: '靠窗喝冰拿铁',
      })
    ).toEqual({ name: '街角咖啡店', category: 'location' });

    expect(
      detectSceneCandidateFromPhoto({
        caption: '在温暖的卧室里对镜自拍',
      })
    ).toEqual({ name: '我的卧室', category: 'room' });

    expect(
      detectSceneCandidateFromPhoto({
        caption: '室内柔和灯光下的甜酷自拍',
      })
    ).toBeNull();
  });

  it('autoCaptureSceneAssetFromPhoto deduplicates and enables subsequent scene reuse', async () => {
    const slug = `assets-autoloop-${Date.now()}`;
    await storageRepo.savePersona(makePersona(slug));

    const img1 = await saveGeneratedMediaBuffer(
      Buffer.from(TINY_PNG_B64, 'base64'),
      'png',
      'photo'
    );
    const img2 = await saveGeneratedMediaBuffer(
      Buffer.from(TINY_PNG_B64, 'base64'),
      'png',
      'photo'
    );

    try {
      // 1. 占位 SVG 不自动沉淀
      const svgSkipped = await autoCaptureSceneAssetFromPhoto({
        slug,
        imageUrl: 'data:image/svg+xml;utf8,<svg></svg>',
        location: '街角咖啡店',
      });
      expect(svgSkipped).toBeNull();

      // 2. 首次在明确地点拍照，自动固定进资产库
      const created = await autoCaptureSceneAssetFromPhoto({
        slug,
        imageUrl: img1,
        location: '街角咖啡店',
        caption: '下午茶时间在街角咖啡店靠窗木桌喝咖啡',
      });
      expect(created).toBeTruthy();
      expect(created?.name).toBe('街角咖啡店');
      expect(created?.category).toBe('location');

      // 3. 再次在同类型地点拍照时自动去重，不重复生成
      const duplicate = await autoCaptureSceneAssetFromPhoto({
        slug,
        imageUrl: img2,
        caption: '又来到咖啡店窗边喝冰美式',
      });
      expect(duplicate).toBeNull();

      const allAssets = await storageRepo.getSceneAssets(slug);
      expect(allAssets).toHaveLength(1);

      // 4. 后续在同地点拍照或发朋友圈时能命中该资产复用
      const reused = matchSceneAssetForCaption(allAssets, '在街角咖啡店木桌边拍一杯热拿铁');
      expect(reused?.asset.id).toBe(created?.id);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });
});
