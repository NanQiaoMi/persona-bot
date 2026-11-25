import { NextResponse } from 'next/server';
import { executeAmbientScene } from '@/lib/group/ambient-orchestrator';
import { GroupNotFoundError } from '@/lib/group/group-orchestrator';

export const dynamic = 'force-dynamic';

/**
 * 群聊自发闲聊：
 * - mode=idle：你停在群里一会儿没说话（userIdleMs 毫秒），有人起个话题
 * - mode=catchup：隔几小时再打开群，补上你不在时大家聊的
 * 不满足条件（冷却中、刚有人说话、大家都睡了…）时返回 ok=false 和原因，不报错。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === 'catchup' ? 'catchup' : 'idle';
    const userIdleMs = Number.isFinite(Number(body?.userIdleMs)) ? Number(body.userIdleMs) : 0;
    const result = await executeAmbientScene({
      groupId: id,
      mode,
      userIdleMs,
      modelId: typeof body?.modelId === 'string' ? body.modelId : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof GroupNotFoundError) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: '群聊不存在' } },
        { status: 404 }
      );
    }
    console.error('Group ambient error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '群聊自发闲聊失败' } },
      { status: 500 }
    );
  }
}
