import { NextResponse } from 'next/server';
import { consolidatePersonaEvolution } from '@/lib/persona/evolution';
import { storageRepo } from '@/lib/storage/repository';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const snapshots = await storageRepo.listSnapshots(decodedSlug);
    return NextResponse.json({ success: true, snapshots });
  } catch (error) {
    console.error('List snapshots error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list snapshots' },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const result = await consolidatePersonaEvolution(decodedSlug, {
      force: true,
      reason: '手动触发记忆与习惯整理',
    });
    const snapshots = await storageRepo.listSnapshots(decodedSlug);

    return NextResponse.json({
      success: true,
      ...result,
      snapshots,
    });
  } catch (error) {
    console.error('Evolve persona error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to consolidate persona evolution' },
      { status: 500 }
    );
  }
}
