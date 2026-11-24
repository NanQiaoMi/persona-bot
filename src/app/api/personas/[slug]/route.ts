import { NextResponse } from 'next/server';
import { ensurePersonaSpec, reconcileSpecWithMarkdown } from '@/lib/persona/spec';
import { storageRepo } from '@/lib/storage/repository';

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const persona = await storageRepo.getPersona(slug);

    if (!persona) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      persona,
    });
  } catch (error) {
    console.error('Get persona error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取Persona失败' } },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const existing = await storageRepo.getPersona(slug);

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    const updated = await storageRepo.updatePersona(existing.slug, (current) => ({
      ...current,
      ...body,
      // 直接编辑 persona.md 时，把 6/7/纠偏小节的改动同步回结构化 learned 条目
      spec:
        typeof body.personaMd === 'string' && !body.spec
          ? reconcileSpecWithMarkdown(
              ensurePersonaSpec(current.personaMd, current.spec),
              body.personaMd
            )
          : body.spec || current.spec,
      slug: current.slug,
      profile: {
        ...current.profile,
        ...(body.profile || {}),
      },
      emotionState: {
        ...current.emotionState,
        ...(body.emotionState || {}),
      },
    }));

    return NextResponse.json({ success: true, persona: updated });
  } catch (error) {
    console.error('Update persona error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '更新Persona失败' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const ok = await storageRepo.deletePersona(slug);

    if (!ok) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete persona error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '删除Persona失败' } },
      { status: 500 }
    );
  }
}
