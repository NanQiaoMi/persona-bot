import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const body = await request.json().catch(() => ({}));
    const snapshotId = typeof body?.snapshotId === 'string' ? body.snapshotId : '';

    if (!snapshotId || !/^[a-zA-Z0-9_-]+$/.test(snapshotId)) {
      return NextResponse.json(
        { success: false, error: '无效的快照 ID' },
        { status: 400 }
      );
    }

    const persona = await storageRepo.rollbackSnapshot(decodedSlug, snapshotId);
    if (!persona) {
      return NextResponse.json(
        { success: false, error: '未找到对应角色或快照文件' },
        { status: 404 }
      );
    }

    const snapshots = await storageRepo.listSnapshots(decodedSlug);
    return NextResponse.json({
      success: true,
      persona,
      snapshots,
    });
  } catch (error) {
    console.error('Rollback snapshot error:', error);
    return NextResponse.json(
      { success: false, error: '回滚快照失败' },
      { status: 500 }
    );
  }
}
