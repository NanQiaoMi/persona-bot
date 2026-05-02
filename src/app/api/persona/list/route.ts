import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// 获取Persona列表
export async function GET() {
  try {
    const exesDir = path.join(process.cwd(), 'exes');
    
    // 检查目录是否存在
    try {
      await fs.access(exesDir);
    } catch {
      return NextResponse.json({
        success: true,
        personas: []
      });
    }

    const dirs = await fs.readdir(exesDir);
    const personas = [];

    for (const slug of dirs) {
      // 跳过隐藏文件和.gitkeep
      if (slug.startsWith('.') || slug === '.gitkeep') continue;
      
      const metaPath = path.join(exesDir, slug, 'meta.json');
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent);
        personas.push({
          slug,
          ...meta
        });
      } catch {
        // 如果没有meta.json，跳过
        continue;
      }
    }

    // 按创建时间排序
    personas.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({
      success: true,
      personas
    });
  } catch (error: any) {
    console.error('List personas error:', error);
    return NextResponse.json(
      { success: false, error: { code: '5001', message: '获取Persona列表失败' } },
      { status: 500 }
    );
  }
}
