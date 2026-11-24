import { NextResponse } from 'next/server';
import { getMascotConfigForPersona } from '@/components/workspace/mascot-palette';
import { storageRepo } from '@/lib/storage/repository';
import { ConversationMessage } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

/**
 * 将子 Bot 的重要消息/成果汇报推送到主 Bot（master-bot）时间线
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fromSlug, content, summary } = body || {};

    if (!fromSlug || !content) {
      return NextResponse.json(
        { success: false, error: { message: '缺少来源 Bot 或汇报内容' } },
        { status: 400 }
      );
    }

    const fromPersona = await storageRepo.getPersona(fromSlug);
    const botName = fromPersona?.name || fromSlug;
    const mascot = getMascotConfigForPersona(fromSlug, fromPersona?.profile, 0);

    const reportText = (summary || content).trim();
    const relayMessage: ConversationMessage = {
      id: `msg_${Date.now()}_relay`,
      role: 'assistant',
      content: reportText,
      timestamp: new Date().toISOString(),
      fromBot: {
        slug: fromSlug,
        name: botName,
        shape: mascot.shape,
        color: mascot.color,
      },
      bursts: reportText.split('\n\n').filter(Boolean),
    };

    await storageRepo.appendMessages('master-bot', [relayMessage]);

    return NextResponse.json({
      success: true,
      message: relayMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '汇报失败';
    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}
