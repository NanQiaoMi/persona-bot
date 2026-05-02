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
      data: { user },
    });
  } catch (error: unknown) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取用户信息失败' } },
      { status: 500 }
    );
  }
});
