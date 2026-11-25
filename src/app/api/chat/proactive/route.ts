import { NextResponse } from 'next/server';
import { generateProactiveMessage } from '@/lib/grok/proactive-engine';
import { resolveLlmConfig } from '@/lib/llm/client';
import { getPresenceState } from '@/lib/persona/daily-rhythm';
import { getDueTopics, markAskedTopics } from '@/lib/persona/pending-topics';
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

    // 情境：角色此刻在做什么 + 对方之前提过、现在该有结果的事
    const extraContext: string[] = [];
    if (!persona.isMaster && persona.slug !== 'master-bot') {
      const presence = getPresenceState(persona);
      extraContext.push(
        presence.availability === 'asleep'
          ? `按作息你本该在睡觉（${presence.activity}），这会儿是醒着刷手机`
          : `你此刻${presence.activity}${presence.availability === 'busy' ? '（在忙，抽空发的）' : ''}`
      );
    }
    const memoryState = await storageRepo.getMemoryState(slug);
    const dueTopics = getDueTopics(memoryState.pendingTopics || [], new Date());
    if (!idleFollowup && dueTopics.length > 0) {
      extraContext.push(
        `对方之前说过「${dueTopics[0].snippet}」（${dueTopics[0].label}），现在应该有结果了，可以借这个由头关心一句`
      );
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
        extraContext,
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
      // 主动消息里已经问到的事，标记为问过，之后不再重复追问
      if (dueTopics.length > 0) {
        await storageRepo.updateMemoryState(slug, (state) => ({
          ...state,
          pendingTopics: markAskedTopics(state.pendingTopics || [], message.content, new Date()),
        }));
      }
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
