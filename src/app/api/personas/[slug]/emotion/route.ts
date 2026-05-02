import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import Persona from '@/lib/db/models/Persona';

export const GET = withAuth(
  async (req: AuthenticatedRequest, context: { params: Promise<{ slug: string }> }) => {
    try {
      const { slug } = await context.params;
      await connectDB();

      const persona = await Persona.findOne(
        { slug, userId: req.user?.userId },
        'emotionState emotionHistory'
      );

      if (!persona) {
        return NextResponse.json(
          { success: false, error: { code: '3001', message: 'Persona不存在' } },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        emotionState: persona.emotionState,
        emotionHistory: persona.emotionHistory,
      });
    } catch (error) {
      console.error('Get emotion error:', error);
      return NextResponse.json(
        { success: false, error: { code: '5001', message: '获取情感状态失败' } },
        { status: 500 }
      );
    }
  }
);

export const PUT = withAuth(
  async (req: AuthenticatedRequest, context: { params: Promise<{ slug: string }> }) => {
    try {
      const { slug } = await context.params;
      const body = await req.json();
      await connectDB();

      const persona = await Persona.findOne({ slug, userId: req.user?.userId });

      if (!persona) {
        return NextResponse.json(
          { success: false, error: { code: '3001', message: 'Persona不存在' } },
          { status: 404 }
        );
      }

      if (body.emotionState) {
        persona.emotionState = {
          ...persona.emotionState,
          ...body.emotionState,
          lastUpdated: new Date(),
        };
      }

      if (body.emotionEvent) {
        persona.emotionHistory.push({
          timestamp: new Date(),
          event: body.emotionEvent.event,
          emotion: body.emotionEvent.emotion,
          intensity: body.emotionEvent.intensity,
          context: body.emotionEvent.context,
        });

        if (persona.emotionHistory.length > 100) {
          persona.emotionHistory = persona.emotionHistory.slice(-100);
        }
      }

      await persona.save();

      return NextResponse.json({
        success: true,
        emotionState: persona.emotionState,
      });
    } catch (error) {
      console.error('Update emotion error:', error);
      return NextResponse.json(
        { success: false, error: { code: '5001', message: '更新情感状态失败' } },
        { status: 500 }
      );
    }
  }
);
