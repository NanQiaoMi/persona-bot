import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';
import { countPendingMedia, mediaFingerprint } from '@/lib/media/media-fingerprint';

export const dynamic = 'force-dynamic';

/**
 * 轻量轮询：只返回会话的图片进度指纹与待出图数量（几十字节）。
 * 页面发现指纹变了才去拉完整消息。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug') || undefined;
    const groupId = searchParams.get('groupId') || undefined;
    if (!slug && !groupId) {
      return NextResponse.json({ success: false, error: 'Missing slug or groupId' }, { status: 400 });
    }
    const messages = groupId
      ? await storageRepo.getGroupConversation(groupId, 100)
      : await storageRepo.getConversation(slug!, 100);
    return NextResponse.json(
      { success: true, fingerprint: mediaFingerprint(messages), pending: countPendingMedia(messages) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // 出错时让页面退回拉完整消息
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
