import { NextResponse } from 'next/server';
import { runOutreach } from '@/lib/proactive/outreach-service';

export const dynamic = 'force-dynamic';

/**
 * 所有 Bot 主动找你（工作台开着时定时来问）：
 * - mode=tick：例行检查，最多一个人来找你
 * - mode=catchup：刚打开工作台，补上你不在时的（最多两条）
 * activeSlug：你正在看的单聊，TA 不会再额外主动来找你。
 * 出错时返回空列表，不会 500。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === 'catchup' ? 'catchup' : 'tick';
    const activeSlug = typeof body?.activeSlug === 'string' ? body.activeSlug : undefined;
    const sent = await runOutreach({ mode, activeSlug });
    return NextResponse.json({
      success: true,
      sent: sent.map((s) => ({ slug: s.slug, name: s.name, message: s.message })),
    });
  } catch (error) {
    console.error('Proactive tick error:', error);
    return NextResponse.json({ success: true, sent: [] });
  }
}
