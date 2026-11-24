import { NextResponse } from 'next/server';
import {
  generateStandardReferencePortrait,
  LOCAL_GATEWAY_BASE_URL,
} from '@/lib/grok/image-generator';
import { storageRepo } from '@/lib/storage/repository';

export const dynamic = 'force-dynamic';

/**
 * 基于首张照片或外貌锚点异步提炼/生成标准棚拍人物参考图，并含竞态保护写回 profile.referenceImageUrl
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      slug,
      sourceImageUrl,
      expectedCurrentRef,
      mode = 'manual',
    } = body || {};

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing slug' },
        { status: 400 }
      );
    }

    const [settings, persona] = await Promise.all([
      storageRepo.getSettings(),
      storageRepo.getPersona(slug),
    ]);

    if (!persona) {
      return NextResponse.json(
        { success: false, error: 'Persona not found' },
        { status: 404 }
      );
    }

    const baseUrl = (
      settings.llmBaseUrl ||
      process.env.LLM_BASE_URL ||
      LOCAL_GATEWAY_BASE_URL
    ).replace(/\/$/, '');
    const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
    const imageModel =
      settings.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2.6';

    const effectiveSourceUrl =
      typeof sourceImageUrl === 'string' && sourceImageUrl.trim()
        ? sourceImageUrl.trim()
        : mode !== 'from_anchor'
          ? persona.profile.referenceImageUrl
          : undefined;

    const result = await generateStandardReferencePortrait({
      personaName: persona.name,
      personaStyle: persona.profile.personalityTags?.slice(0, 3).join(', '),
      appearanceAnchor: persona.profile.appearanceAnchor,
      sourceImageUrl: effectiveSourceUrl,
      allowTextFallback: !effectiveSourceUrl,
      baseUrl,
      apiKey,
      imageModel,
    });

    if (!result.imageUrl) {
      return NextResponse.json({
        success: false,
        fallbackKept: Boolean(persona.profile.referenceImageUrl),
        error: result.errorHint || '标准参考图生成失败',
      });
    }

    const expectedRef =
      typeof expectedCurrentRef === 'string' && expectedCurrentRef.trim()
        ? expectedCurrentRef.trim()
        : undefined;

    let skippedOverwrite = false;
    const updated = await storageRepo.updatePersona(persona.slug, (current) => {
      if (
        expectedRef &&
        current.profile.referenceImageUrl &&
        current.profile.referenceImageUrl !== expectedRef
      ) {
        skippedOverwrite = true;
        return null;
      }

      return {
        ...current,
        profile: {
          ...current.profile,
          referenceImageUrl: result.imageUrl,
        },
        updatedAt: new Date().toISOString(),
      };
    });

    if (skippedOverwrite) {
      return NextResponse.json({
        success: true,
        skippedOverwrite: true,
        referenceImageUrl: updated?.profile.referenceImageUrl,
        persona: updated,
      });
    }

    return NextResponse.json({
      success: true,
      referenceImageUrl: result.imageUrl,
      usedSourceImage: Boolean(result.usedReferenceImage),
      persona: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reference generation failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
