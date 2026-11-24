import { NextResponse } from 'next/server';
import { inferAppearanceAnchorFromImage } from '@/lib/persona/appearance-evolution';
import {
  createSceneAssetFromExisting,
  createSceneAssetFromUpload,
  generateSceneAsset,
} from '@/lib/persona/scene-assets';
import { storageRepo } from '@/lib/storage/repository';
import { SceneAssetCategory } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const persona = await storageRepo.getPersona(decodedSlug);
    if (!persona) {
      return NextResponse.json(
        { success: false, error: 'Persona not found' },
        { status: 404 }
      );
    }
    const assets = await storageRepo.getSceneAssets(decodedSlug);
    return NextResponse.json({ success: true, assets });
  } catch (error) {
    console.error('Get scene assets error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load scene assets' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const body = await request.json();
    const { action, name, category, imageUrl, dataUrl, description } = body || {};

    const validCategory: SceneAssetCategory =
      category === 'location' || category === 'environment' ? category : 'room';

    if (action === 'auto_anchor') {
      const [persona, settings] = await Promise.all([
        storageRepo.getPersona(decodedSlug),
        storageRepo.getSettings(),
      ]);
      if (!persona) {
        return NextResponse.json(
          { success: false, error: 'Persona not found' },
          { status: 404 }
        );
      }
      const inferred = await inferAppearanceAnchorFromImage({
        referenceImageUrl: persona.profile.referenceImageUrl,
        personaName: persona.name,
        personaStyle: persona.profile.personalityTags?.slice(0, 4).join('、'),
        personaMd: persona.personaMd,
        currentAnchor: persona.profile.appearanceAnchor,
        force: true,
        settings,
      });

      const anchorText = inferred.anchor || persona.profile.appearanceAnchor || '';
      const updated = await storageRepo.updatePersona(persona.slug, (current) => ({
        ...current,
        profile: {
          ...current.profile,
          appearanceAnchor: anchorText || undefined,
          appearanceAnchorLocked: false,
        },
        updatedAt: new Date().toISOString(),
      }));

      return NextResponse.json({
        success: true,
        appearanceAnchor: updated?.profile.appearanceAnchor,
        usedVision: inferred.usedVision,
        persona: updated,
      });
    }

    if (action === 'save_existing') {
      if (!imageUrl || typeof imageUrl !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Missing imageUrl' },
          { status: 400 }
        );
      }
      const res = await createSceneAssetFromExisting(decodedSlug, {
        name: typeof name === 'string' && name.trim() ? name : '固定场景',
        category: validCategory,
        imageUrl,
        description: typeof description === 'string' ? description : undefined,
      });
      return NextResponse.json({
        success: true,
        asset: res.asset,
        assets: res.assets,
      });
    }

    if (action === 'upload') {
      if (!dataUrl || typeof dataUrl !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Missing dataUrl' },
          { status: 400 }
        );
      }
      const res = await createSceneAssetFromUpload(decodedSlug, {
        name: typeof name === 'string' && name.trim() ? name : '上传场景',
        category: validCategory,
        dataUrl,
        description: typeof description === 'string' ? description : undefined,
      });
      return NextResponse.json({
        success: true,
        asset: res.asset,
        assets: res.assets,
      });
    }

    if (action === 'generate') {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json(
          { success: false, error: '请输入场景名称（如：我的卧室）' },
          { status: 400 }
        );
      }
      const res = await generateSceneAsset(decodedSlug, {
        name: name.trim(),
        category: validCategory,
        description: typeof description === 'string' ? description : undefined,
      });
      if (!res.asset) {
        return NextResponse.json({
          success: false,
          assets: res.assets,
          error: res.error || '场景图生成失败',
        });
      }
      return NextResponse.json({
        success: true,
        asset: res.asset,
        assets: res.assets,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported action' },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Assets request failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const url = new URL(request.url);
    let assetId = url.searchParams.get('assetId') || '';
    if (!assetId) {
      const body = await request.json().catch(() => ({}));
      if (typeof body?.assetId === 'string') {
        assetId = body.assetId;
      }
    }

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'Missing assetId' },
        { status: 400 }
      );
    }

    const assets = await storageRepo.updateSceneAssets(decodedSlug, (current) =>
      current.filter((item) => item.id !== assetId)
    );
    return NextResponse.json({ success: true, assets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete asset failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
