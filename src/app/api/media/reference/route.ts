import { NextResponse } from 'next/server';
import { saveGeneratedMediaBuffer } from '@/lib/grok/image-generator';
import { storageRepo } from '@/lib/storage/repository';

export const dynamic = 'force-dynamic';

/**
 * 上传并锁定角色人物一致性参考图（保存到 .data/generated-media/ 并写入 profile.referenceImageUrl）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, dataUrl } = body || {};

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing slug' },
        { status: 400 }
      );
    }

    if (!dataUrl || typeof dataUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing dataUrl' },
        { status: 400 }
      );
    }

    const match = dataUrl.match(
      /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i
    );
    if (!match) {
      return NextResponse.json(
        { success: false, error: '仅支持 PNG/JPG/WEBP 格式图片' },
        { status: 400 }
      );
    }

    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json(
        { success: false, error: 'Persona not found' },
        { status: 404 }
      );
    }

    const extRaw = match[1].toLowerCase();
    const ext = extRaw === 'jpeg' || extRaw === 'jpg' ? 'jpg' : extRaw === 'webp' ? 'webp' : 'png';
    const buf = Buffer.from(match[2], 'base64');
    const referenceImageUrl = await saveGeneratedMediaBuffer(buf, ext, 'ref');

    const updated = await storageRepo.updatePersona(persona.slug, (current) => ({
      ...current,
      profile: {
        ...current.profile,
        referenceImageUrl,
      },
      updatedAt: new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      referenceImageUrl,
      persona: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
