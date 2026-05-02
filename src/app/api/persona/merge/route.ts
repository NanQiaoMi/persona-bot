import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { slug, newData } = await request.json();

    if (!slug || !newData) {
      return NextResponse.json({ error: 'Slug and new data are required' }, { status: 400 });
    }

    const personaDir = path.join(process.cwd(), 'exes', slug);
    const personaPath = path.join(personaDir, 'persona.md');
    const memoriesPath = path.join(personaDir, 'memories.md');

    // In a real implementation, we would call the LLM here using merger.md
    // For now, we'll implement the shell and assume the frontend handles the LLM call for merging
    // or we'll add a separate LLM utility for background tasks.

    // Mock implementation: Append to files
    if (newData.personaUpdate) {
      await fs.appendFile(personaPath, `\n\n## 追加更新 (${new Date().toLocaleDateString()})\n${newData.personaUpdate}`);
    }
    
    if (newData.memoriesUpdate) {
      await fs.appendFile(memoriesPath, `\n\n## 追加记忆 (${new Date().toLocaleDateString()})\n${newData.memoriesUpdate}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Merge API Error:', error);
    return NextResponse.json({ error: 'Failed to merge data' }, { status: 500 });
  }
}
