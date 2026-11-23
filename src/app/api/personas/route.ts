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
        mbti: p.profile.mbti,
        tags: p.profile.personalityTags,
        profile: p.profile,
        emotionState: p.emotionState,
        intimacy: p.intimacy,
        lastMessage: p.lastMessage,
        lastActive: p.lastActive,
      })),
    });
  } catch (error) {
    console.error('Get personas error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取角色列表失败' } },
      { status: 500 }
    );
  }
}
