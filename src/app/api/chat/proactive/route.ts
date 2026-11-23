import { NextResponse } from 'next/server';
import { generateProactiveGreeting } from '@/lib/grok/proactive-engine';
import { storageRepo } from '@/lib/storage/repository';

export async function POST(request: Request) {
  try {
    const { slug, hoursSinceLastChat, currentHour, persist } = await request.json();

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    let computedHours = typeof hoursSinceLastChat === 'number' ? hoursSinceLastChat : 0;
    if (hoursSinceLastChat === undefined) {
      const history = await storageRepo.getConversation(slug, 1);
      const lastMsg = history[history.length - 1];
      if (lastMsg?.timestamp) {
        const diffMs = Date.now() - new Date(lastMsg.timestamp).getTime();
        computedHours = Math.max(0, diffMs / (1000 * 60 * 60));
      } else {
        computedHours = 8; // Fresh conversation trigger
      }
    }

    const result = generateProactiveGreeting(
      persona,
      computedHours,
      typeof currentHour === 'number' ? currentHour : new Date().getHours()
    );

    if (persist !== false) {
      const newIntimacy = Math.max(0, Math.min(100, persona.intimacy + result.intimacyChange));
      await storageRepo.updateEmotionAndIntimacy(slug, result.emotionState, newIntimacy);
      await storageRepo.appendMessages(slug, [
        {
          id: `msg_${Date.now()}_proactive`,
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
          thought: result.thought,
          mood: result.moodLabel,
          bursts: result.bursts,
          intimacyChange: result.intimacyChange,
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Proactive API error:', error);
    return NextResponse.json({ error: 'Failed to generate proactive message' }, { status: 500 });
  }
}
