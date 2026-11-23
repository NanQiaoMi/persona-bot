import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    if (!slug) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少slug参数' } },
        { status: 400 }
      );
    }

    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    const messages = await storageRepo.getConversation(slug, limit);
    return NextResponse.json({
      success: true,
      messages,
      emotionState: persona.emotionState,
      intimacy: persona.intimacy,
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取聊天记录失败' } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { slug, messages, emotionState, intimacy } = await request.json();

    if (!slug || !Array.isArray(messages)) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少必要参数' } },
        { status: 400 }
      );
    }

    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    await storageRepo.saveConversation(slug, messages);

    if (emotionState || typeof intimacy === 'number') {
      await storageRepo.updateEmotionAndIntimacy(
        slug,
        emotionState ? { ...persona.emotionState, ...emotionState, lastUpdated: new Date().toISOString() } : persona.emotionState,
        typeof intimacy === 'number' ? intimacy : persona.intimacy
      );
    }

    return NextResponse.json({
      success: true,
      savedCount: messages.length,
    });
  } catch (error) {
    console.error('Save conversation error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '保存聊天记录失败' } },
      { status: 500 }
    );
  }
}
