import { NextResponse } from 'next/server';
import { applyWorldAction, type WorldAction } from '@/lib/persona/world';
import { storageRepo } from '@/lib/storage/repository';

export const dynamic = 'force-dynamic';

/** 世界设定列表（待确认 / 已收录 / 已忽略） */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const world = await storageRepo.getWorld(decodeURIComponent(slug));
  return NextResponse.json({ success: true, entries: world.entries });
}

/**
 * 操作一条世界设定：
 * { id, action: 'confirm' | 'dismiss' | 'restore' | 'delete' | 'edit', name?, description? }
 */
export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await request.json().catch(() => ({}));
    const actions: WorldAction['action'][] = ['confirm', 'dismiss', 'restore', 'delete', 'edit'];
    if (typeof body?.id !== 'string' || !actions.includes(body?.action)) {
      return NextResponse.json({ success: false, error: '缺少 id 或 action' }, { status: 400 });
    }
    const world = await storageRepo.updateWorld(decodeURIComponent(slug), (current) =>
      applyWorldAction(current, {
        id: body.id,
        action: body.action,
        name: typeof body.name === 'string' ? body.name : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
      })
    );
    return NextResponse.json({ success: true, entries: world.entries });
  } catch (error) {
    console.error('World update error:', error);
    return NextResponse.json({ success: false, error: '更新世界设定失败' }, { status: 500 });
  }
}
