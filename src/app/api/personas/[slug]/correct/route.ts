import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const { userInput, botResponse, correction, category } = await request.json();

    if (!correction || typeof correction !== 'string') {
      return NextResponse.json({ error: 'Correction reason is required' }, { status: 400 });
    }

    const updated = await storageRepo.addCorrection(slug, {
      userInput: userInput || '',
      botResponse: botResponse || '',
      correction: correction.trim(),
      category: category || 'style',
    });

    if (!updated) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      persona: updated,
    });
  } catch (error) {
    console.error('Add correction error:', error);
    return NextResponse.json({ error: 'Failed to add correction' }, { status: 500 });
  }
}
