import { NextResponse } from 'next/server';
import { runPythonTool } from '@/lib/python-runner';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const slug = formData.get('slug') as string;
    const targetName = formData.get('targetName') as string;
    const type = (formData.get('type') as string) || 'wechat';

    if (!file || !slug) {
      return NextResponse.json({ error: 'Missing file or slug' }, { status: 400 });
    }

    const personaDir = path.join(process.cwd(), 'exes', slug);
    const knowledgeDir = path.join(personaDir, 'knowledge');
    
    // Ensure directories exist
    await fs.mkdir(path.join(process.cwd(), 'uploads'), { recursive: true });
    await fs.mkdir(knowledgeDir, { recursive: true });

    const uploadPath = path.join(process.cwd(), 'uploads', `${slug}-${file.name}`);
    
    // Save original file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(uploadPath, buffer);

    let scriptName = '';
    let args: string[] = [];
    const outPath = path.join(knowledgeDir, `${type}_out.txt`);

    switch (type) {
      case 'wechat':
        scriptName = 'wechat_parser.py';
        args = ['--file', uploadPath, '--target', targetName || 'Persona', '--output', outPath];
        break;
      case 'imessage':
        scriptName = 'imessage_parser.py';
        args = ['--file', uploadPath, '--target', targetName || 'Persona', '--output', outPath];
        break;
      default:
        return NextResponse.json({ error: 'Unsupported parser type' }, { status: 400 });
    }

    const result = await runPythonTool(scriptName, args);

    if (result.code !== 0) {
      console.error('Parser failed:', result.stderr);
      return NextResponse.json({ error: 'Parser failed', detail: result.stderr }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'File parsed successfully', output: outPath });
  } catch (error: any) {
    console.error('Error parsing file:', error);
    return NextResponse.json({ error: 'Failed to parse file', detail: error.message }, { status: 500 });
  }
}
