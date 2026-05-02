import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import InviteCode from '@/lib/db/models/InviteCode';
import { hashPassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';

// POST /api/dev/create-test-user - 创建测试用户（仅开发环境）
export async function POST() {
  // 仅在开发环境允许
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: '此接口仅在开发环境可用' },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const testUsername = 'testuser';
    const testPassword = 'Test123456';

    // 检查是否已存在测试用户
    const existingUser = await User.findOne({ username: testUsername });
    if (existingUser) {
      // 生成 token
      const token = generateToken({
        userId: existingUser._id.toString(),
        username: existingUser.username,
        role: existingUser.role,
      });

      return NextResponse.json({
        success: true,
        message: '测试用户已存在',
        data: {
          token,
          user: {
            id: existingUser._id,
            username: existingUser.username,
            role: existingUser.role,
          },
          credentials: {
            username: testUsername,
            password: testPassword,
          },
        },
      });
    }

    // 创建或获取管理员用户
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      const adminPasswordHash = await hashPassword('Admin123456');
      adminUser = await User.create({
        username: 'admin',
        passwordHash: adminPasswordHash,
        role: 'admin',
      });
    }

    // 创建或获取邀请码
    const inviteCodeStr = 'TEST2024';
    let inviteCode = await InviteCode.findOne({ code: inviteCodeStr });
    if (!inviteCode) {
      inviteCode = await InviteCode.create({
        code: inviteCodeStr,
        createdBy: adminUser._id,
        maxUses: 100,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
    }

    // 创建测试用户
    const passwordHash = await hashPassword(testPassword);
    const testUser = await User.create({
      username: testUsername,
      passwordHash,
      role: 'user',
      inviteCodeId: inviteCode._id,
    });

    // 更新邀请码
    inviteCode.currentUses += 1;
    inviteCode.usedBy.push(testUser._id);
    await inviteCode.save();

    // 生成 token
    const token = generateToken({
      userId: testUser._id.toString(),
      username: testUser.username,
      role: testUser.role,
    });

    return NextResponse.json({
      success: true,
      message: '测试用户创建成功',
      data: {
        token,
        user: {
          id: testUser._id,
          username: testUser.username,
          role: testUser.role,
        },
        credentials: {
          username: testUsername,
          password: testPassword,
          inviteCode: inviteCodeStr,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Create test user error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建测试用户失败' },
      { status: 500 }
    );
  }
}
