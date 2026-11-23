import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: { code: '2001', message: '缺少slug参数' } },
        { status: 400 }
      );
    }

    const deleted = await storageRepo.deletePersona(slug);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Persona ${slug} 已删除`,
    });
  } catch (error) {
    console.error('Delete persona error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '删除Persona失败' } },
      { status: 500 }
    );
  }
}
