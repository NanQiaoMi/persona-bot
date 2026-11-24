import { NextResponse } from 'next/server';
import { resolveLlmConfig } from '@/lib/llm/client';
import { refineCorrection } from '@/lib/persona/correction';
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

    // 把口语化反馈（或聊天气泡里的快捷选项）提炼成一条明确的行为规则
    const settings = await storageRepo.getSettings();
    const refined = await refineCorrection(
      { feedback: correction, botResponse, userInput },
      resolveLlmConfig(settings)
    );

    const updated = await storageRepo.addCorrection(slug, {
      userInput: userInput || '',
      botResponse: botResponse || '',
      correction: refined.rule,
      category: category || 'style',
    });

    if (!updated) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      rule: refined.rule,
      refined: refined.refined,
      persona: updated,
    });
  } catch (error) {
    console.error('Add correction error:', error);
    return NextResponse.json({ error: 'Failed to add correction' }, { status: 500 });
  }
}
