import { NextResponse } from 'next/server';
import { generateProactiveMessage } from '@/lib/grok/proactive-engine';
import { resolveLlmConfig } from '@/lib/llm/client';
import { storageRepo } from '@/lib/storage/repository';
import { ConversationMessage } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

/**
 * 主动消息：
 * - idleFollowup=true：刚聊着对方突然不回，轻敲一下（第 nudgeCount 次）
 * - 否则：按时段 / 多久没聊主动打招呼
 * 有模型时按角色人设生成，没有时走离线话术；都不会 500。
 */
export async function POST(request: Request) {
  try {
    const {
      slug,
      hoursSinceLastChat,
      currentHour,
      persist,
      idleFollowup,
      idleSeconds = 45,
      nudgeCount = 1,
    } = await request.json();

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const persona = await storageRepo.getPersona(slug);
    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const settings = await storageRepo.getSettings();
    const llm = resolveLlmConfig(settings);
    const history = await storageRepo.getConversation(slug, 8);

    let computedHours = typeof hoursSinceLastChat === 'number' ? hoursSinceLastChat : 0;
    if (!idleFollowup && hoursSinceLastChat === undefined) {
      const lastMsg = history[history.length - 1];
      computedHours = lastMsg?.timestamp
        ? Math.max(0, (Date.now() - new Date(lastMsg.timestamp).getTime()) / 3_600_000)
        : 8; // 全新会话视为很久没聊
    }

    const result = await generateProactiveMessage(
      persona,
      {
        kind: idleFollowup ? 'idle' : 'greeting',
        hoursSinceLastChat: computedHours,
        currentHour: typeof currentHour === 'number' ? currentHour : new Date().getHours(),
        idleSeconds,
        nudgeCount,
        recentMessages: history,
      },
      llm
    );

    const message: ConversationMessage = {
      id: `msg_${Date.now()}_${idleFollowup ? 'idle' : 'proactive'}`,
      role: 'assistant',
      content: result.content,
      timestamp: new Date().toISOString(),
      thought: idleFollowup ? undefined : result.thought,
      mood: result.moodLabel,
      bursts: result.bursts,
      intimacyChange: idleFollowup ? undefined : result.intimacyChange,
      isFollowup: idleFollowup ? true : undefined,
      modelUsed: result.source === 'llm' ? result.modelUsed : '离线演示',
    };

    if (persist !== false) {
      if (!idleFollowup) {
        const newIntimacy = Math.max(0, Math.min(100, persona.intimacy + result.intimacyChange));
        await storageRepo.updateEmotionAndIntimacy(slug, result.emotionState, newIntimacy);
      }
      await storageRepo.appendMessages(slug, [message]);
    }

    return NextResponse.json({
      success: true,
      ...result,
      message,
    });
  } catch (error) {
    console.error('Proactive API error:', error);
    return NextResponse.json({ error: 'Failed to generate proactive message' }, { status: 500 });
  }
}
