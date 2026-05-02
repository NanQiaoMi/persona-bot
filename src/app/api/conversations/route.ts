import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';
import { connectDB } from '@/lib/db/mongodb';
import Conversation from '@/lib/db/models/Conversation';
import Persona from '@/lib/db/models/Persona';

// 获取聊天记录
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少slug参数' } },
        { status: 400 }
      );
    }

    await connectDB();

    // 查找Persona
    const persona = await Persona.findOne({ slug });
    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    // 查找或创建对话
    let conversation = await Conversation.findOne({
      personaId: persona._id
    }).sort({ lastActivity: -1 });

    if (!conversation) {
      return NextResponse.json({
        success: true,
        messages: [],
        emotionState: persona.emotionState
      });
    }

    // 返回最近的消息
    const messages = conversation.messages.slice(-limit);

    return NextResponse.json({
      success: true,
      messages: messages.map((m: { role: string; content: string; timestamp: Date }) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      })),
      emotionState: persona.emotionState
    });
  } catch (error: any) {
    console.error('Get conversation error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取聊天记录失败' } },
      { status: 500 }
    );
  }
}

// 保存聊天记录
export async function POST(request: Request) {
  try {
    const { slug, messages, emotionState } = await request.json();

    if (!slug || !messages || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少必要参数' } },
        { status: 400 }
      );
    }

    await connectDB();

    // 查找Persona
    const persona = await Persona.findOne({ slug });
    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    // 查找或创建对话
    let conversation = await Conversation.findOne({
      personaId: persona._id
    }).sort({ lastActivity: -1 });

    if (!conversation) {
      conversation = new Conversation({
        personaId: persona._id,
        messages: []
      });
    }

    // 添加新消息（避免重复）
    const existingTimestamps = new Set(
      conversation.messages.map((m: { timestamp?: Date }) => m.timestamp?.getTime())
    );

    const newMessages = messages.filter((m: { timestamp: string }) => {
      const timestamp = new Date(m.timestamp).getTime();
      return !existingTimestamps.has(timestamp);
    });

    conversation.messages.push(...newMessages.map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
      metadata: {
        mood: emotionState?.primaryEmotion
      }
    })));

    // 只保留最近500条消息
    if (conversation.messages.length > 500) {
      conversation.messages = conversation.messages.slice(-500);
    }

    conversation.lastActivity = new Date();
    await conversation.save();

    // 更新Persona的情感状态
    if (emotionState) {
      persona.emotionState = {
        ...persona.emotionState,
        ...emotionState,
        lastUpdated: new Date()
      };
      await persona.save();
    }

    return NextResponse.json({
      success: true,
      savedCount: newMessages.length
    });
  } catch (error: any) {
    console.error('Save conversation error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '保存聊天记录失败' } },
      { status: 500 }
    );
  }
}
