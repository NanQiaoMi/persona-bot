import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const group = await storageRepo.getGroup(id);
    if (!group) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: '群聊不存在' } },
        { status: 404 }
      );
    }
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const messages = await storageRepo.getGroupConversation(group.id, Number.isFinite(limit) ? limit : 100);
    return NextResponse.json({ success: true, group, messages });
  } catch (error) {
    console.error('Get group error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取群聊失败' } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const patch: { name?: string; topic?: string; lastMessage?: string } = {};
    if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 30);
    if (typeof body?.topic === 'string') patch.topic = body.topic.trim().slice(0, 120) || undefined;
    if (body?.clearMessages === true) {
      await storageRepo.saveGroupConversation(id, []);
      patch.lastMessage = '';
    }
    const group = await storageRepo.updateGroup(id, patch);
    if (!group) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: '群聊不存在' } },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, group });
  } catch (error) {
    console.error('Update group error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '更新群聊失败' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const removed = await storageRepo.deleteGroup(id);
    return NextResponse.json({ success: removed });
  } catch (error) {
    console.error('Delete group error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '删除群聊失败' } },
      { status: 500 }
    );
  }
}
