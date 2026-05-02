import { NextResponse } from 'next/server';
import { parseWeChatChat, parseIMessageChat, createSkill, updateSkill, listSkills, loadAllPrompts } from '@/lib/ex-skill-integration';
import fs from 'fs/promises';
import path from 'path';

/**
 * Ex-Skill 工具集成 API
 * 
 * POST /api/ex-skill/parse - 解析聊天记录
 * POST /api/ex-skill/create - 创建Skill
 * POST /api/ex-skill/update - 更新Skill
 * GET /api/ex-skill/list - 列出所有Skill
 * GET /api/ex-skill/prompts - 加载所有Prompt
 */

// 解析聊天记录
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const action = formData.get('action') as string;
    
    if (action === 'parse') {
      // 解析聊天记录
      const file = formData.get('file') as File;
      const targetName = formData.get('targetName') as string;
      const type = (formData.get('type') as string) || 'wechat';
      
      if (!file || !targetName) {
        return NextResponse.json(
          { success: false, error: 'Missing file or targetName' },
          { status: 400 }
        );
      }
      
      // 保存上传的文件
      const uploadsDir = path.join(process.cwd(), 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      
      const filePath = path.join(uploadsDir, `${targetName}_${type}_${Date.now()}.${file.name.split('.').pop()}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      
      // 根据类型选择解析器
      let result;
      if (type === 'imessage') {
        result = await parseIMessageChat(filePath, targetName);
      } else {
        result = await parseWeChatChat(filePath, targetName);
      }
      
      // 清理上传的文件
      await fs.unlink(filePath).catch(() => {});
      
      return NextResponse.json(result);
    }
    
    if (action === 'create') {
      // 创建Skill
      const slug = formData.get('slug') as string;
      const name = formData.get('name') as string;
      const metaStr = formData.get('meta') as string;
      const memories = formData.get('memories') as string;
      const persona = formData.get('persona') as string;
      
      if (!slug || !name || !persona) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields' },
          { status: 400 }
        );
      }
      
      const meta = metaStr ? JSON.parse(metaStr) : { name };
      const result = await createSkill(slug, name, meta, memories || '', persona);
      
      return NextResponse.json(result);
    }
    
    if (action === 'update') {
      // 更新Skill
      const slug = formData.get('slug') as string;
      const memoriesPatch = formData.get('memoriesPatch') as string;
      const personaPatch = formData.get('personaPatch') as string;
      
      if (!slug) {
        return NextResponse.json(
          { success: false, error: 'Missing slug' },
          { status: 400 }
        );
      }
      
      const result = await updateSkill(slug, memoriesPatch, personaPatch);
      
      return NextResponse.json(result);
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Ex-Skill API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// 获取Skill列表和Prompt
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    if (action === 'list') {
      const result = await listSkills();
      return NextResponse.json(result);
    }
    
    if (action === 'prompts') {
      const prompts = await loadAllPrompts();
      return NextResponse.json({ success: true, prompts });
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Ex-Skill API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
