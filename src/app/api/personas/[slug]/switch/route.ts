import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import Persona from '@/lib/db/models/Persona';
import { personaManager } from '@/lib/persona/manager';
import { contextIsolation } from '@/lib/persona/isolation';

export const POST = withAuth(
  async (
    req: AuthenticatedRequest,
    { params }: { params: Promise<{ slug: string }> }
  ) => {
    try {
      const { slug } = await params;
      const userId = req.user?.userId;

      if (!userId) {
        return NextResponse.json(
          { success: false, error: { code: '1001', message: '未授权' } },
          { status: 401 }
        );
      }

      await connectDB();

      const persona = await Persona.findOne({ slug, userId });

      if (!persona) {
        return NextResponse.json(
          { success: false, error: { code: '3001', message: 'Persona不存在' } },
          { status: 404 }
        );
      }

      const context = await personaManager.switchPersona(
        userId,
        slug,
        persona.name,
        persona.personaMd,
        persona.emotionState
      );

      const isolatedContext = contextIsolation.createContext(userId, slug);

      const emotionState = context.emotionEngine.getCurrentState();

      return NextResponse.json({
        success: true,
        persona: {
          slug: persona.slug,
          name: persona.name,
          profile: persona.profile
        },
        emotionState: {
          primaryEmotion: emotionState.primary,
          intensity: emotionState.intensity,
          pleasure: emotionState.pleasure,
          arousal: emotionState.arousal
        },
        conversationId: isolatedContext.conversationId
      });
    } catch (error: unknown) {
      console.error('Switch persona error:', error);
      return NextResponse.json(
        { success: false, error: { code: '5001', message: '切换Persona失败' } },
        { status: 500 }
      );
    }
  }
);
