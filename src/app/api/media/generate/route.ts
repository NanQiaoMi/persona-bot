import { NextResponse } from 'next/server';
import { runMediaJob } from '@/lib/media/media-jobs';

export const dynamic = 'force-dynamic';

/**
 * 生成一张照片 / 表情包并写回对应消息（单聊或群聊）。
 * 同一张卡片已经在生成时（比如服务端已自动开始），等同一个任务的结果，不会重复生成。
 * manual: true 表示你点了「重试」，不受自动重试次数限制。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { slug, messageId, cardIndex = 0, groupId, manual } = body || {};

    if (!slug || !messageId) {
      return NextResponse.json({ success: false, error: 'Missing slug or messageId' }, { status: 400 });
    }

    const result = await runMediaJob(
      {
        slug: String(slug),
        messageId: String(messageId),
        cardIndex: Number.isInteger(cardIndex) ? cardIndex : 0,
        groupId: typeof groupId === 'string' && groupId ? groupId : undefined,
      },
      { manual: Boolean(manual) }
    );

    if (result.skipped === 'not_found' || result.skipped === 'not_visual') {
      return NextResponse.json({ success: false, error: '找不到这张图片对应的消息' });
    }
    return NextResponse.json({
      success: Boolean(result.card),
      card: result.card,
      skipped: result.skipped,
      autoLockedReference: Boolean(result.autoLockedReference),
      shouldRefineReference: Boolean(result.shouldRefineReference),
      ...(result.sourcePhotoUrl ? { sourcePhotoUrl: result.sourcePhotoUrl } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
