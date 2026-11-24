import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';
import { ConversationMessage } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

/**
 * 持久化由模型自主决策触发的延迟主动追发消息（两段式真人节奏）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, content, fromBot } = body || {};

    if (!slug || !content || !String(content).trim()) {
      return NextResponse.json(
        { success: false, error: 'Missing slug or content' },
        { status: 400 }
      );
    }

    const cleanContent = String(content).trim();
    const msg: ConversationMessage = {
      id: `msg_${Date.now()}_followup`,
      role: 'assistant',
      content: cleanContent,
      timestamp: new Date().toISOString(),
      fromBot: fromBot || undefined,
      isFollowup: true,
      bursts: [cleanContent],
    };

    await storageRepo.appendMessages(slug, [msg]);

    return NextResponse.json({
      success: true,
      message: msg,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Followup save failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
