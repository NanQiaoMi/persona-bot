import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import Persona from '@/lib/db/models/Persona';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();
    
    const personas = await Persona.find({ userId: req.user?.userId })
      .select('name slug profile.mbti profile.personalityTags updatedAt')
      .sort({ updatedAt: -1 });

    return NextResponse.json({
      success: true,
      personas: personas.map(p => ({
        slug: p.slug,
        name: p.name,
        mbti: p.profile?.mbti,
        tags: p.profile?.personalityTags || [],
        lastActive: p.updatedAt
      }))
    });
  } catch (error) {
    console.error('Get personas error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取角色列表失败' } },
      { status: 500 }
    );
  }
});
