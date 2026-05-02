import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import Persona from '@/lib/db/models/Persona';

export const GET = withAuth(
  async (req: AuthenticatedRequest, context: { params: Promise<{ slug: string }> }) => {
    try {
      const { slug } = await context.params;
      await connectDB();

      const persona = await Persona.findOne({ slug, userId: req.user?.userId });

      if (!persona) {
        return NextResponse.json(
          { success: false, error: { code: '3001', message: 'Persona不存在' } },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        persona: {
          id: persona._id,
          name: persona.name,
          slug: persona.slug,
          profile: persona.profile,
          personaMd: persona.personaMd,
          memoriesMd: persona.memoriesMd,
          emotionState: persona.emotionState,
          corrections: persona.corrections,
          createdAt: persona.createdAt,
          updatedAt: persona.updatedAt,
        },
      });
    } catch (error) {
      console.error('Get persona error:', error);
      return NextResponse.json(
        { success: false, error: { code: '5001', message: '获取Persona失败' } },
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

      const persona = await Persona.findOneAndUpdate(
        { slug, userId: req.user?.userId },
        { $set: body },
        { new: true }
      );

      if (!persona) {
        return NextResponse.json(
          { success: false, error: { code: '3001', message: 'Persona不存在' } },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, persona });
    } catch (error) {
      console.error('Update persona error:', error);
      return NextResponse.json(
        { success: false, error: { code: '5001', message: '更新Persona失败' } },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withAuth(
  async (req: AuthenticatedRequest, context: { params: Promise<{ slug: string }> }) => {
    try {
      const { slug } = await context.params;
      await connectDB();

      const result = await Persona.findOneAndDelete({ slug, userId: req.user?.userId });

      if (!result) {
        return NextResponse.json(
          { success: false, error: { code: '3001', message: 'Persona不存在' } },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete persona error:', error);
      return NextResponse.json(
        { success: false, error: { code: '5001', message: '删除Persona失败' } },
        { status: 500 }
      );
    }
  }
);
