import { NextResponse } from 'next/server';
import { distillPersona } from '@/lib/persona/distiller';
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.name) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少角色名称' } },
        { status: 400 }
      );
    }

    const result = await distillPersona(body);
    return NextResponse.json({
      success: true,
      slug: result.persona.slug,
      persona: result.persona,
      stages: result.stages,
      chatStats: result.chatStats,
    });
  } catch (error) {
    console.error('Create persona error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '创建角色失败' } },
      { status: 500 }
    );
  }
}
