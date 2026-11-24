import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { GENERATED_MEDIA_DIR } from '@/lib/grok/image-generator';

export const dynamic = 'force-dynamic';

const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  if (!filename || !SAFE_FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const targetPath = path.join(GENERATED_MEDIA_DIR, filename);
  try {
    const buffer = await fs.readFile(targetPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png';

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }
}
