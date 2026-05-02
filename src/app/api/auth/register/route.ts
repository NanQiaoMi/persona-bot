import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import InviteCode from '@/lib/db/models/InviteCode';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';

export async function POST(request: Request) {
  try {
    await connectDB();

    const { username, password, inviteCode } = await request.json();

    if (!username || !password || !inviteCode) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '用户名、密码和邀请码为必填项' } },
        { status: 400 }
      );
    }

    if (username.length < 3 || username.length > 30) {
      return NextResponse.json(
        { success: false, error: { code: '2002', message: '用户名长度应为3-30个字符' } },
        { status: 400 }
      );
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: { code: '2003', message: passwordValidation.errors[0] } },
        { status: 400 }
      );
    }

    const code = await InviteCode.findOne({
      code: inviteCode.toUpperCase(),
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!code) {
      return NextResponse.json(
        { success: false, error: { code: '1004', message: '邀请码无效或已过期' } },
        { status: 400 }
      );
    }

    if (code.currentUses >= code.maxUses) {
      return NextResponse.json(
        { success: false, error: { code: '1004', message: '邀请码已达到使用上限' } },
        { status: 400 }
      );
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: '2002', message: '用户名已存在' } },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      username,
      passwordHash,
      inviteCodeId: code._id,
    });

    code.currentUses += 1;
    code.usedBy.push(user._id);
    await code.save();

    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error: unknown) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '注册失败，请稍后重试' } },
      { status: 500 }
    );
  }
}
