import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function POST(request: Request) {
  try {
    const { slug, newData, correction } = await request.json();

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    if (correction) {
      const updated = await storageRepo.addCorrection(slug, {
        userInput: correction.userInput || '',
        botResponse: correction.original || correction.botResponse || '',
        correction: correction.reason || correction.correction || '',
        category: correction.type || 'style',
      });
      if (!updated) {
        return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, persona: updated });
    }

    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    if (newData?.personaUpdate) {
      persona.personaMd = `${persona.personaMd.trimEnd()}\n\n## 追加更新 (${new Date().toLocaleDateString('zh-CN')})\n${newData.personaUpdate}`;
    }
    if (newData?.memoriesUpdate) {
      persona.memoriesMd = `${persona.memoriesMd.trimEnd()}\n\n## 追加记忆 (${new Date().toLocaleDateString('zh-CN')})\n${newData.memoriesUpdate}`;
    }

    await storageRepo.savePersona(persona);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Merge API Error:', error);
    return NextResponse.json({ error: 'Failed to merge data' }, { status: 500 });
  }
}
