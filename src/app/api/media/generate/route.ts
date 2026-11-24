import { NextResponse } from 'next/server';
import {
  generatePersonaMedia,
  LOCAL_GATEWAY_BASE_URL,
} from '@/lib/grok/image-generator';
import { buildGuaranteedAppearanceFallback } from '@/lib/persona/appearance-evolution';
import { matchSceneAssetForCaption } from '@/lib/persona/scene-assets';
import { storageRepo } from '@/lib/storage/repository';
import { MediaCard } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

/**
 * 异步生图接口：单独生成图片/表情包并回写对应会话消息的 mediaCards，避免阻塞流式文本输出
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      slug,
      messageId,
      cardIndex = 0,
      kind = 'sticker',
      caption = '',
    } = body || {};

    if (!slug || !messageId) {
      return NextResponse.json(
        { success: false, error: 'Missing slug or messageId' },
        { status: 400 }
      );
    }

    const [settings, persona, sceneAssets] = await Promise.all([
      storageRepo.getSettings(),
      storageRepo.getPersona(slug),
      storageRepo.getSceneAssets(slug),
    ]);

    const baseUrl = (
      settings.llmBaseUrl ||
      process.env.LLM_BASE_URL ||
      LOCAL_GATEWAY_BASE_URL
    ).replace(/\/$/, '');
    const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
    const imageModel =
      settings.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2.6';

    const mediaType = kind === 'photo' ? 'photo' : 'sticker';
    const captionText = String(caption || `${persona?.name || slug} 的趣味表达`);
    const matchedScene =
      mediaType === 'photo'
        ? matchSceneAssetForCaption(sceneAssets, captionText)
        : null;
    const effectiveReferenceUrl =
      matchedScene?.isPureEnvironment
        ? matchedScene.asset.imageUrl
        : persona?.profile.referenceImageUrl;

    const mediaRes = await generatePersonaMedia({
      kind: mediaType,
      caption: captionText,
      personaName: persona?.name || slug,
      personaStyle: persona?.profile.personalityTags?.slice(0, 3).join(', '),
      appearanceAnchor: persona?.profile.appearanceAnchor,
      sceneAnchor: matchedScene?.asset.description,
      referenceImageUrl: effectiveReferenceUrl,
      baseUrl,
      apiKey,
      imageModel,
    });

    let autoLockedReference = false;
    let shouldRefineReference = false;
    let sourcePhotoUrl: string | undefined;
    if (
      mediaType === 'photo' &&
      mediaRes.imageUrl &&
      persona &&
      !persona.profile.referenceImageUrl &&
      !matchedScene?.isPureEnvironment
    ) {
      const lockedUrl = mediaRes.imageUrl;
      await storageRepo.updatePersona(persona.slug, (current) => {
        if (current.profile.referenceImageUrl) {
          return null;
        }
        autoLockedReference = true;
        const fallbackAnchor =
          !current.profile.appearanceAnchor && !current.profile.appearanceAnchorLocked
            ? buildGuaranteedAppearanceFallback({
                personaName: current.name,
                personaStyle: current.profile.personalityTags?.slice(0, 4).join('、'),
                personaMd: current.personaMd,
                fallbackCaption: captionText,
              })
            : undefined;
        return {
          ...current,
          profile: {
            ...current.profile,
            referenceImageUrl: lockedUrl,
            ...(fallbackAnchor ? { appearanceAnchor: fallbackAnchor } : {}),
          },
          updatedAt: new Date().toISOString(),
        };
      });
      if (autoLockedReference) {
        shouldRefineReference = true;
        sourcePhotoUrl = lockedUrl;
      }
    }

    const updatedCard: MediaCard = {
      type: mediaType,
      caption: String(caption || ''),
      status: mediaRes.imageUrl ? 'ready' : 'error',
      imageUrl: mediaRes.imageUrl,
      model: mediaRes.model,
      prompt: mediaRes.prompt,
      errorHint: mediaRes.errorHint,
    };

    // Persist generated imageUrl back into conversation history so page reloads keep the image
    const history = await storageRepo.getConversation(slug, 0);
    const msgIdx = history.findIndex((m) => m.id === messageId);
    if (msgIdx !== -1) {
      const targetMsg = history[msgIdx];
      const nextCards = [...(targetMsg.mediaCards || [])];
      if (cardIndex >= 0 && cardIndex < nextCards.length) {
        nextCards[cardIndex] = {
          ...nextCards[cardIndex],
          ...updatedCard,
        };
      } else {
        nextCards.push(updatedCard);
      }
      history[msgIdx] = {
        ...targetMsg,
        mediaCards: nextCards,
      };
      await storageRepo.saveConversation(slug, history);
    }

    return NextResponse.json({
      success: true,
      card: updatedCard,
      autoLockedReference,
      shouldRefineReference,
      ...(sourcePhotoUrl ? { sourcePhotoUrl } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
