import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { GENERATED_MEDIA_DIR } from '@/lib/grok/image-generator';
import { SAFE_MEDIA_FILENAME_RE, ensureThumbnail } from '@/lib/media/thumbnails';

export const dynamic = 'force-dynamic';

const CACHE_HEADER = 'public, max-age=31536000, immutable';

function contentTypeOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  if (!filename || !SAFE_MEDIA_FILENAME_RE.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  // ?w=… 返回缩略图（没有就现场生成并存盘）；生成失败时退回原图
  const wantsThumb = new URL(request.url).searchParams.has('w');
  if (wantsThumb) {
    const thumbPath = await ensureThumbnail(GENERATED_MEDIA_DIR, filename);
    if (thumbPath) {
      try {
        const buffer = await fs.readFile(thumbPath);
        return new Response(new Uint8Array(buffer), {
          status: 200,
          headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE_HEADER },
        });
      } catch {
        // 退回原图
      }
    }
  }

  const targetPath = path.join(GENERATED_MEDIA_DIR, filename);
  try {
    const buffer = await fs.readFile(targetPath);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { 'Content-Type': contentTypeOf(filename), 'Cache-Control': CACHE_HEADER },
    });
  } catch {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }
}
