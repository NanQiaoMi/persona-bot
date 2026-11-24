import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaSoulBundle } from '@/lib/storage/types';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const bundle = await storageRepo.exportSoulBundle(decodedSlug);
    if (!bundle) {
      return NextResponse.json(
        { success: false, error: 'Persona not found' },
        { status: 404 }
      );
    }

    const safeFileSlug = decodedSlug.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-');
    const encodedFilename = encodeURIComponent(`persona-soul-${safeFileSlug}.json`);

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="persona-soul.json"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    console.error('Export soul bundle error:', error);
    return NextResponse.json(
      { success: false, error: '导出灵魂包失败' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const decodedSlug = decodeURIComponent(slug);
    const body = (await request.json().catch(() => null)) as Partial<PersonaSoulBundle> | null;

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: '请求体必须是合法 JSON' },
        { status: 400 }
      );
    }

    const persona = await storageRepo.importSoulBundle(decodedSlug, body);
    const snapshots = await storageRepo.listSnapshots(decodedSlug);

    return NextResponse.json({
      success: true,
      persona,
      snapshots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入灵魂包失败';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
