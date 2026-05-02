import { NextResponse } from 'next/server';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { EmotionEngine, inferPersonalityTraits } from '@/lib/emotion/engine';

const emotionEngines = new Map<string, EmotionEngine>();

function getEmotionEngine(slug: string, personaMd: string, savedState?: Record<string, unknown>): EmotionEngine {
  if (emotionEngines.has(slug)) {
    return emotionEngines.get(slug)!;
  }

  const personality = inferPersonalityTraits(personaMd);
  const engine = savedState 
    ? EmotionEngine.fromJSON(savedState, personality)
    : new EmotionEngine(personality);

  emotionEngines.set(slug, engine);
  return engine;
}

export async function POST(request: Request) {
  try {
    const { messages, slug, emotionState } = await request.json();

    if (!messages || !slug) {
      return NextResponse.json({ error: 'Missing messages or slug' }, { status: 400 });
    }

    const assembler = new PromptAssembler();
    const personaData = await assembler.loadPersona(slug);
    const lastUserMessage = messages[messages.length - 1]?.content;

    const engine = getEmotionEngine(slug, personaData.persona_md, emotionState);

    if (lastUserMessage) {
      engine.processEvent({
        type: 'message',
        content: lastUserMessage,
        sender: 'user',
        timestamp: new Date()
      });
    }

    const emotionDescription = engine.getEmotionDescription();
    const currentEmotion = engine.getCurrentState();

    const systemPrompt = assembler.assembleSystemPrompt(
      personaData,
      {
        emotion: currentEmotion.primary,
        intensity: currentEmotion.intensity,
        attitude: emotionDescription
      },
      lastUserMessage
    );

    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.LLM_MODEL || 'gpt-4-turbo';

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const endpoint = baseUrl.endsWith('/chat/completions') 
      ? baseUrl 
      : `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { 
            role: 'system', 
            content: systemPrompt + "\n\n**多媒体指令**：你可以模拟发送图片或语音。格式如下：\n- 图片：`[PHOTO: 画面描述]`\n- 语音：`[VOICE: 秒数]`\n请在符合情境时使用。不要频繁使用，保持惊喜感。" 
          },
          ...messages,
        ],
        temperature: 0.85,
      }),
    });

    const result = await response.json();
    
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    if (result.choices && result.choices[0]) {
      let content = result.choices[0].message.content;
      const moodMatch = content.match(/\[MOOD:\s*(.+?)\]/);
      let mood = '';
      
      if (moodMatch) {
        mood = moodMatch[1];
        content = content.replace(moodMatch[0], '').trim();
        result.choices[0].message.content = content;
      }
      
      result.mood = mood;
      result.emotionState = engine.toJSON();

      engine.processEvent({
        type: 'message',
        content: content,
        sender: 'persona',
        timestamp: new Date()
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
