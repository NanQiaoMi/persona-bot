import { NextResponse } from 'next/server';
import { getInflight, inflightKey } from '@/lib/chat/inflight';

export const dynamic = 'force-dynamic';

/** 这个单聊 / 群聊是否还有回复在生成（你切走再切回来时用） */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = inflightKey({
    slug: searchParams.get('slug') || undefined,
    groupId: searchParams.get('groupId') || undefined,
  });
  if (!key) {
    return NextResponse.json({ success: false, error: '缺少 slug 或 groupId' }, { status: 400 });
  }
  const info = getInflight(key);
  return NextResponse.json({
    success: true,
    inflight: Boolean(info),
    label: info?.label,
    startedAt: info?.startedAt,
  });
}
