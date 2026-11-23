import { NextResponse } from 'next/server';
import { WeChatParser } from '@/lib/parsers/wechat';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const targetName = (formData.get('targetName') as string) || 'Persona';

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const content = await file.text();
    const parser = new WeChatParser();
    const result = parser.parse(content, targetName);

    return NextResponse.json({
      success: true,
      message: 'File parsed successfully',
      metadata: result.metadata,
      statistics: result.statistics,
      preview: result.messages.slice(0, 30),
    });
  } catch (error) {
    console.error('Error parsing file:', error);
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to parse file', detail }, { status: 500 });
  }
}
