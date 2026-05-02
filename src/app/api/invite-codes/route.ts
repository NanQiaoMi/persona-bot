import { NextResponse } from 'next/server';
import { withAdminAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import InviteCode from '@/lib/db/models/InviteCode';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PB-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const GET = withAdminAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const isActive = searchParams.get('isActive');

    const query: Record<string, unknown> = {};
    if (isActive !== null) {
      query.isActive = isActive === 'true';
    }

    const total = await InviteCode.countDocuments(query);
    const codes = await InviteCode.find(query)
      .populate('createdBy', 'username')
      .populate('usedBy', 'username')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: {
        codes,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: unknown) {
    console.error('Get invite codes error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取邀请码列表失败' } },
      { status: 500 }
    );
  }
});

export const POST = withAdminAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();

    const { maxUses = 10, expiresInDays = 30 } = await req.json();

    const code = await InviteCode.create({
      code: generateInviteCode(),
      createdBy: req.user?.userId,
      maxUses,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    });

    return NextResponse.json({
      success: true,
      data: { code },
    });
  } catch (error: unknown) {
    console.error('Create invite code error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '创建邀请码失败' } },
      { status: 500 }
    );
  }
});
