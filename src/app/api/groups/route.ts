import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const groups = await storageRepo.listGroups();
    return NextResponse.json({ success: true, groups });
  } catch (error) {
    console.error('List groups error:', error);
    return NextResponse.json({ success: true, groups: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawSlugs: unknown[] = Array.isArray(body?.memberSlugs) ? body.memberSlugs : [];
    const requested = rawSlugs.filter((s): s is string => typeof s === 'string' && s.trim() !== '');

    const personas = await storageRepo.listPersonas();
    const valid = new Set(
      personas.filter((p) => !p.isMaster && p.slug !== 'master-bot').map((p) => p.slug)
    );
    const memberSlugs = Array.from(new Set(requested)).filter((s) => valid.has(s));

    if (memberSlugs.length < 2) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '群聊至少需要选 2 位角色' } },
        { status: 400 }
      );
    }

    const names = memberSlugs
      .map((s) => personas.find((p) => p.slug === s)?.name.split(/\s+/)[0])
      .filter(Boolean)
      .slice(0, 3);
    const name =
      typeof body?.name === 'string' && body.name.trim()
        ? body.name
        : `${names.join('、')}的群`;

    const group = await storageRepo.createGroup({
      name,
      memberSlugs,
      topic: typeof body?.topic === 'string' ? body.topic : undefined,
    });
    return NextResponse.json({ success: true, group });
  } catch (error) {
    console.error('Create group error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '建群失败' } },
      { status: 500 }
    );
  }
}
