import { NextResponse } from 'next/server';
import { recoverMedia } from '@/lib/media/media-jobs';

export const dynamic = 'force-dynamic';

/**
 * 打开单聊 / 群聊时调用：把卡住或到点重试的照片 / 表情包重新排队补生成。
 * 返回 pending（还没出结果的张数）与 gatewayOnline（生图服务是否连得上），页面据此决定是否继续刷新。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = typeof body?.slug === 'string' && body.slug ? body.slug : undefined;
    const groupId = typeof body?.groupId === 'string' && body.groupId ? body.groupId : undefined;
    if (!slug && !groupId) {
      return NextResponse.json({ success: false, error: 'Missing slug or groupId' }, { status: 400 });
    }
    const result = await recoverMedia({ slug, groupId });
    return NextResponse.json({ success: true, ...result });
  } catch {
    // 补生成失败不影响正常聊天
    return NextResponse.json({ success: true, queued: 0, pending: 0, gatewayOnline: null });
  }
}
