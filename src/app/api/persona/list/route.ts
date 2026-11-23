import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function GET() {
  try {
    const personas = await storageRepo.listPersonas();
    return NextResponse.json({
      success: true,
      personas: personas.map((p) => ({
        slug: p.slug,
        name: p.name,
        version: p.version,
        isPreset: p.isPreset,
        defaultMode: p.defaultMode,
        profile: {
          ...p.profile,
          tags: {
            attachment: p.profile.attachment,
            personality: p.profile.personalityTags,
          },
          enhanced_profile: p.profile.bio,
        },
        emotionState: p.emotionState,
        intimacy: p.intimacy,
        lastMessage: p.lastMessage,
        lastActive: p.lastActive,
        created_at: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('List personas error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取Persona列表失败' } },
      { status: 500 }
    );
  }
}
