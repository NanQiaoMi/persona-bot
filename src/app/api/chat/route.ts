import { NextResponse } from 'next/server';
import { executeGrokChatTurn } from '@/lib/grok/stream-orchestrator';
import { storageRepo } from '@/lib/storage/repository';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, slug, mode, thinkMode, deepSearch, requestPhoto, modelId } = body;

    if (!messages || !slug) {
      return NextResponse.json({ error: 'Missing messages or slug' }, { status: 400 });
    }

    const assistantMessage = await executeGrokChatTurn({
      slug,
      messages,
      mode,
      thinkMode,
      deepSearch,
      requestPhoto,
      modelId,
    });

    const persona = await storageRepo.getPersona(slug);

    return NextResponse.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: assistantMessage.bursts?.join(' [BURST] ') || assistantMessage.content,
          },
        },
      ],
      message: assistantMessage,
      mood: assistantMessage.mood,
      thought: assistantMessage.thought,
      searchResults: assistantMessage.searchResults,
      emotionState: persona?.emotionState,
      intimacy: persona?.intimacy,
      intimacyChange: assistantMessage.intimacyChange,
      isDemoMode: assistantMessage.isDemoMode,
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
