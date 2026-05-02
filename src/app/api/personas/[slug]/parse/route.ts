import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import Persona from '@/lib/db/models/Persona';
import { parserFactory } from '@/lib/parsers/factory';
import { ParseOptions } from '@/lib/parsers/types';

export const POST = withAuth(async (req: AuthenticatedRequest, context: { params: Promise<{ slug: string }> }) => {
  try {
    const { slug } = await context.params;
    const userId = req.user?.userId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: '1001', message: '未授权' } },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const targetName = formData.get('targetName') as string;
    const parserType = (formData.get('type') as string) || 'wechat';

    if (!file || !targetName) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少文件或目标名称' } },
        { status: 400 }
      );
    }

    await connectDB();

    // 验证Persona存在
    const persona = await Persona.findOne({ slug, userId });
    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    // 读取文件内容
    const content = await file.text();

    // 解析聊天记录
    const options: ParseOptions = {
      type: parserType as ParseOptions['type'],
      targetName
    };

    const result = parserFactory.parse(options, content);

    // 更新Persona
    await Persona.findOneAndUpdate(
      { slug, userId },
      {
        $push: {
          knowledgeSources: {
            type: 'chat_log',
            source: file.name,
            parsedAt: new Date(),
            messageCount: result.metadata.targetCount,
            dateRange: result.metadata.dateRange
          }
        }
      }
    );

    return NextResponse.json({
      success: true,
      result: {
        messages: result.messages.slice(0, 100), // 只返回前100条
        metadata: result.metadata,
        statistics: result.statistics
      }
    });
  } catch (error: unknown) {
    console.error('Parse error:', error);
    const message = error instanceof Error ? error.message : '解析失败';
    return NextResponse.json(
      { success: false, error: { code: '5001', message } },
      { status: 500 }
    );
  }
});