import { NextResponse } from 'next/server';
import { withAdminAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import InviteCode from '@/lib/db/models/InviteCode';

function generateCode(): string {
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
    const status = searchParams.get('status');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {};

    if (status === 'active') {
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
    } else if (status === 'expired') {
      query.$or = [
        { isActive: false },
        { expiresAt: { $lte: new Date() } }
      ];
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
      codes: codes.map(c => ({
        id: c._id,
        code: c.code,
        createdBy: (c.createdBy as unknown as { username?: string })?.username || 'System',
        usedCount: c.currentUses,
        maxUses: c.maxUses,
        expiresAt: c.expiresAt,
        isActive: c.isActive && new Date(c.expiresAt) > new Date(),
        createdAt: c.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
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

    const { count = 1, maxUses = 10, expiresInDays = 30 } = await req.json();

    const codes = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      const code = await InviteCode.create({
        code: generateCode(),
        createdBy: req.user?.userId,
        maxUses,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      });
      codes.push(code);
    }

    return NextResponse.json({
      success: true,
      codes: codes.map(c => ({
        id: c._id,
        code: c.code,
        maxUses: c.maxUses,
        expiresAt: c.expiresAt
      }))
    });
  } catch (error: unknown) {
    console.error('Create invite codes error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '创建邀请码失败' } },
      { status: 500 }
    );
  }
});

export const DELETE = withAdminAuth(async (req: AuthenticatedRequest) => {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少邀请码ID' } },
        { status: 400 }
      );
    }

    await InviteCode.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete invite code error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '删除邀请码失败' } },
      { status: 500 }
    );
  }
});
