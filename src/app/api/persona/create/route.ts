import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { name, slug, basicInfo, personalityInfo } = data;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    const personaDir = path.join(process.cwd(), 'exes', slug);
    await fs.mkdir(personaDir, { recursive: true });
    await fs.mkdir(path.join(personaDir, 'versions'), { recursive: true });
    await fs.mkdir(path.join(personaDir, 'knowledge'), { recursive: true });

    const meta = {
      name,
      slug,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 'v1',
      profile: {
        ...basicInfo
      },
      tags: {
        ...personalityInfo
      }
    };

    await fs.writeFile(
      path.join(personaDir, 'meta.json'),
      JSON.stringify(meta, null, 2)
    );

    return NextResponse.json({ success: true, slug });
  } catch (error) {
    console.error('Error creating persona:', error);
    return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 });
  }
}
