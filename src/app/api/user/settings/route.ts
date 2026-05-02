import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();

    const user = await User.findById(req.user?.userId).select('-passwordHash');

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '用户不存在' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        settings: user.settings,
        quota: user.quota,
        createdAt: user.createdAt,
      },
    });
  } catch (error: unknown) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取设置失败' } },
      { status: 500 }
    );
  }
});

export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();

    const body = await req.json();
    const { settings } = body;

    if (!settings) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少设置参数' } },
        { status: 400 }
      );
    }

    const user = await User.findById(req.user?.userId);

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '用户不存在' } },
        { status: 404 }
      );
    }

    if (settings.llmProvider !== undefined) {
      user.settings.llmProvider = settings.llmProvider;
    }
    if (settings.apiKey !== undefined) {
      user.settings.apiKeyEncrypted = settings.apiKey;
    }
    if (settings.theme !== undefined) {
      user.settings.theme = settings.theme;
    }
    if (settings.language !== undefined) {
      user.settings.language = settings.language;
    }

    await user.save();

    return NextResponse.json({
      success: true,
      settings: user.settings,
    });
  } catch (error: unknown) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '更新设置失败' } },
      { status: 500 }
    );
  }
});
