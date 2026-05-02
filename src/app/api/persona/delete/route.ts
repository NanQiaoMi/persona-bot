import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// 删除Persona
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

    const personaDir = path.join(process.cwd(), 'exes', slug);
    
    // 检查目录是否存在
    try {
      await fs.access(personaDir);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: '3001', message: 'Persona不存在' } },
        { status: 404 }
      );
    }

    // 删除目录
    await fs.rm(personaDir, { recursive: true, force: true });

    return NextResponse.json({
      success: true,
      message: `Persona ${slug} 已删除`
    });
  } catch (error: any) {
    console.error('Delete persona error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '删除Persona失败' } },
      { status: 500 }
    );
  }
}
