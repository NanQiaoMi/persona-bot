import { NextResponse } from 'next/server';
import { generateProactiveGreeting } from '@/lib/grok/proactive-engine';
import { parseStructuredModelOutput } from '@/lib/grok/stream-orchestrator';
import { chatCompletion, resolveLlmConfig } from '@/lib/llm/client';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { storageRepo } from '@/lib/storage/repository';
import { ConversationMessage } from '@/lib/storage/types';

export const dynamic = 'force-dynamic';

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

    // Autonomous context-aware idle nudge ("用户一直没回答时主动追问")
    if (idleFollowup) {
      const settings = await storageRepo.getSettings();
      const history = await storageRepo.getConversation(slug, 8);
      const llm = resolveLlmConfig(settings);
      const canCallUpstream = llm.canCall;

      let rawNudge = '';
      let usedModel = '离线演示';

      if (canCallUpstream) {
        try {
          const assembler = new PromptAssembler();
          const systemPrompt = assembler.assembleFromRecord(persona, {
            mode: persona.defaultMode,
            thinkMode: false,
            lastUserMessage: history[history.length - 1]?.content || '',
          });

          const recentMsgs = history.slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          }));

          const nudgeInstruction =
            nudgeCount >= 2
              ? `对方从刚刚开始一直没回复你（距今约 ${Math.round(idleSeconds)} 秒，这是第 ${nudgeCount} 次轻量敲一下）。请完全保持你的人设性格，自然发一句短关心、幽默吐槽或者自己正在干嘛的分享（最多 2 句，可用 [BURST] 拆分），别显得焦虑或像客服催单，不要输出 <thought> 标签。`
              : `对方看着屏幕已经超过 ${Math.round(idleSeconds)} 秒没回你上一条消息了（这是第 1 次自然追问）。请紧密结合你们上一句聊到的话题，完全按照你的人设口吻，用 1~2 句极其自然的话主动追问或轻敲对方（可用 [BURST] 拆分，不要重复上一句原话，不要输出 <thought> 标签）。`;

          const content = await chatCompletion(
            llm,
            [
              { role: 'system', content: systemPrompt },
              ...recentMsgs,
              { role: 'user', content: `[系统情境提示：${nudgeInstruction}]` },
            ],
            { temperature: 0.85, timeoutMs: 20000 }
          );
          if (content.trim()) {
            rawNudge = content.trim();
            usedModel = llm.model;
          }
        } catch {
          // Fall back to persona greeting engine below
        }
      }

      if (!rawNudge) {
        const lastBotContent =
          history.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ||
          '';
        if (persona.defaultMode === 'fun') {
          rawNudge =
            nudgeCount >= 2
              ? '喂，真挂机啦？[BURST] 要真去忙了记得回来冒个泡，我先刷会儿别的等你。'
              : `人呢，不会看着屏幕突然呆住了吧？[BURST] 刚刚说的${lastBotContent ? '那事' : '话题'}你到底怎么想的呀～`;
        } else if (persona.defaultMode === 'companion') {
          rawNudge =
            nudgeCount >= 2
              ? '看你一直没说话，是不是忙别的事去啦？[BURST] 忙完再回我也行，我一直都在哦 🌸'
              : '怎么突然安静下来啦？[BURST] 是不是刚才哪里累到了，随时跟我说呀。';
        } else {
          rawNudge =
            nudgeCount >= 2
              ? '看你半天没回，先忙你的吧，随时回来接上刚才的话。'
              : '看你停在这里好一会儿了，是不是还在想怎么回我？[BURST] 想到哪句直接发就行。';
        }
      }

      const parsed = parseStructuredModelOutput(rawNudge);
      const message: ConversationMessage = {
        id: `msg_${Date.now()}_idle`,
        role: 'assistant',
        content: parsed.cleanReply,
        timestamp: new Date().toISOString(),
        mood: parsed.mood || persona.emotionState.moodLabel,
        bursts: parsed.bursts,
        isFollowup: true,
        modelUsed: usedModel,
      };

      if (persist !== false) {
        await storageRepo.appendMessages(slug, [message]);
      }

      return NextResponse.json({
        success: true,
        message,
      });
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

    const message: ConversationMessage = {
      id: `msg_${Date.now()}_proactive`,
      role: 'assistant',
      content: result.content,
      timestamp: new Date().toISOString(),
      thought: result.thought,
      mood: result.moodLabel,
      bursts: result.bursts,
      intimacyChange: result.intimacyChange,
    };

    if (persist !== false) {
      const newIntimacy = Math.max(0, Math.min(100, persona.intimacy + result.intimacyChange));
      await storageRepo.updateEmotionAndIntimacy(slug, result.emotionState, newIntimacy);
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
