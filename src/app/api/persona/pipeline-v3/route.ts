import { NextResponse } from 'next/server';
import { distillPersona } from '@/lib/persona/distiller';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      basicInfo,
      personalityInfo,
      chatLogText,
      targetSpeaker,
      defaultMode,
      avatarEmoji,
      ensureUniqueSlug,
      basicPersonality,
      appearanceAnchor,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const result = await distillPersona({
      name,
      basicInfo,
      personalityInfo,
      chatLogText,
      targetSpeaker,
      defaultMode,
      avatarEmoji,
      ensureUniqueSlug: ensureUniqueSlug !== false,
      basicPersonality,
      appearanceAnchor,
    });

    return NextResponse.json({
      success: true,
      slug: result.persona.slug,
      persona: result.persona,
      isLiveLLM: result.isLiveLLM,
      chatStats: result.chatStats,
      stages: result.stages,
      summary: {
        name: result.persona.name,
        mbti: result.persona.profile.mbti || '',
        attachment: result.persona.profile.attachment || '',
        tags: result.persona.profile.personalityTags,
      },
    });
  } catch (error) {
    console.error('[Pipeline v3] Error:', error);
    const message = error instanceof Error ? error.message : 'Pipeline failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
