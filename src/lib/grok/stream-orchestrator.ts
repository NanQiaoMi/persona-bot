import { EmotionEngine, inferPersonalityTraits } from '@/lib/emotion/engine';
import {
  DeepSearchResponse,
  performDeepSearch,
  shouldAutoTriggerSearch,
} from '@/lib/grok/deep-search';
import { getPersonaModeSpec } from '@/lib/grok/persona-modes';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { storageRepo } from '@/lib/storage/repository';
import {
  ConversationMessage,
  MediaCard,
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRecord,
} from '@/lib/storage/types';

export interface ChatTurnRequest {
  slug: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    imageUrl?: string;
    timestamp?: string;
  }>;
  mode?: PersonaMode;
  thinkMode?: boolean;
  deepSearch?: boolean;
  requestPhoto?: boolean;
  modelId?: string;
}

export type StreamEvent =
  | {
      type: 'search';
      status: 'searching' | 'done';
      query: string;
      provider?: string;
      results: DeepSearchResponse['results'];
    }
  | {
      type: 'thought';
      delta: string;
      fullThought: string;
    }
  | {
      type: 'emotion';
      emotionState: PersonaEmotionSnapshot;
      intimacy: number;
      intimacyChange: number;
    }
  | {
      type: 'reply';
      delta: string;
      fullReply: string;
      bursts: string[];
      mediaCards: MediaCard[];
      isDemoMode: boolean;
    }
  | {
      type: 'done';
      message: ConversationMessage;
    };

/**
 * 解析模型输出中的 <thought>、[MOOD: ...]、[PHOTO: ...]、[VOICE: ...] 与 [BURST]
 */
export function parseStructuredModelOutput(rawText: string, fallbackThought = ''): {
  thought: string;
  mood: string;
  cleanReply: string;
  bursts: string[];
  mediaCards: MediaCard[];
} {
  let working = rawText.trim();
  let thought = fallbackThought;

  const thoughtMatch = working.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thoughtMatch) {
    thought = thoughtMatch[1].trim();
    working = working.replace(thoughtMatch[0], '').trim();
  }

  let mood = '';
  const moodMatch = working.match(/\[MOOD:\s*([^\]]+)\]/i);
  if (moodMatch) {
    mood = moodMatch[1].trim();
    working = working.replace(moodMatch[0], '').trim();
  }

  const mediaCards: MediaCard[] = [];
  const photoRegex = /\[PHOTO:\s*([^\]]+)\]/gi;
  let photoMatch: RegExpExecArray | null;
  while ((photoMatch = photoRegex.exec(working)) !== null) {
    mediaCards.push({
      type: 'photo',
      caption: photoMatch[1].trim(),
    });
  }
  working = working.replace(photoRegex, '').trim();

  const voiceRegex = /\[VOICE:\s*([^\]]+)\]/gi;
  let voiceMatch: RegExpExecArray | null;
  while ((voiceMatch = voiceRegex.exec(working)) !== null) {
    const val = voiceMatch[1].trim();
    const secNum = Number(val);
    mediaCards.push({
      type: 'voice',
      caption: Number.isFinite(secNum) ? `拟真语音消息 (${secNum}s)` : val,
      durationSec: Number.isFinite(secNum) ? secNum : Math.max(3, Math.min(18, Math.ceil(val.length / 4))),
    });
  }
  working = working.replace(voiceRegex, '').trim();

  const bursts = working
    .split(/\[BURST\]/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const cleanReply = bursts.join('\n');

  return {
    thought,
    mood,
    cleanReply: cleanReply || '（轻轻挑了下眉，等你继续往下说）',
    bursts: bursts.length > 0 ? bursts : [cleanReply || '我在听呢，继续说～'],
    mediaCards,
  };
}

/**
 * 当未配置外部 API Key 或网络离线时，基于角色五层人格、模式、实时联网结果与共同记忆合成逼真响应
 */
export function synthesizePersonaAwareFallback(
  persona: PersonaRecord,
  userMessage: string,
  mode: PersonaMode,
  searchResp: DeepSearchResponse | null,
  hasImage: boolean,
  requestPhoto: boolean
): string {
  const modeSpec = getPersonaModeSpec(mode);
  const firstTag = persona.profile.personalityTags[0] || '真实鲜活';
  const topSearch = searchResp?.results[0];

  let thought = '';
  let mood = '';
  const bursts: string[] = [];
  let mediaTag = '';

  if (hasImage) {
    thought = `对方居然发图过来了！我得先仔细瞅瞅这张图的细节，再用${modeSpec.shortLabel}的态度点评一下。`;
    mood = '凑近看图中 👀';
    if (mode === 'fun') {
      bursts.push('好家伙，一上来就甩图是吧？让我放大看看有没有什么破绽 ⚡');
      bursts.push(`不过说真的，这张图的氛围感还挺绝，很符合你平时的审美嘛`);
    } else if (mode === 'companion') {
      bursts.push('哇，你终于舍得给我看你那边的画面啦 🌸');
      bursts.push('光是看着这张图都能想象出你当时的样子，下次可得带我一起去');
    } else {
      bursts.push('哼，突然发张图过来干嘛……');
      bursts.push('拍得还算勉强及格吧，先替你存着了');
    }
  } else if (topSearch) {
    thought = `刚通过 DeepSearch 扒到了关于「${searchResp?.query}」的最新线索（${topSearch.title}），绝不能像播音员一样念稿，得用我（${persona.name}）的脾气聊出来。`;
    if (mode === 'fun') {
      mood = '冲浪锐评中 ⚡';
      bursts.push(`刚顺手帮你扒了一圈全网动态，关于「${searchResp?.query}」现在讨论度还挺高 ⚡`);
      bursts.push(`简单说人话就是：${topSearch.snippet.slice(0, 85)}……是不是比那些官方通稿有意思多了？`);
    } else if (mode === 'analytical') {
      mood = '第一性原理拆解 🛸';
      bursts.push(`刚核验了关于「${searchResp?.query}」的实时情报（来源：${topSearch.source}）。`);
      bursts.push(`核心事实其实很清晰：${topSearch.snippet.slice(0, 95)}。你更关心它的底层逻辑还是后续影响？`);
    } else if (mode === 'companion') {
      mood = '认真陪你聊新知 🌸';
      bursts.push(`看你对「${searchResp?.query}」这么感兴趣，我刚特地去查了一下～`);
      bursts.push(`上面说${topSearch.snippet.slice(0, 80)}……你今天怎么突然想起关注这个啦？`);
    } else {
      mood = '随手刷手机 🌙';
      bursts.push(`哦，你说「${searchResp?.query}」啊，我刚才刷手机刚好也瞥见了`);
      bursts.push(`好像主要是在讲${topSearch.snippet.slice(0, 75)}……你怎么突然对这个上心了？`);
    }
  } else {
    // Normal conversational turn tailored by mode & persona
    const isMissYou = /想你|在吗|干嘛呢|在干嘛|抱抱|累/.test(userMessage);
    if (mode === 'fun') {
      thought = `收到对方消息「${userMessage.slice(0, 25)}」，开启 Grok 毒舌搭子模式：先用轻松反讽接招，绝不端着，顺便带出我的「${firstTag}」本色。`;
      mood = '毒舌营业中 ⚡';
      if (isMissYou) {
        bursts.push('哟，今天太阳打西边出来了？突然走温情路线我都有点不习惯了哈哈 ⚡');
        bursts.push('行吧行吧，既然你诚心呼叫，本冲浪搭子今天就破例陪你聊到困为止！');
      } else {
        bursts.push(`听你这口气，「${userMessage.slice(0, 18)}」背后肯定还有故事吧？`);
        bursts.push('别藏着掖着了，展开讲讲，我瓜子跟冰美式都已经就位了 ⚡');
      }
    } else if (mode === 'companion') {
      thought = `对方跟我说「${userMessage.slice(0, 25)}」，此时最需要被温柔接住情绪，用高共情伴侣的方式给足偏爱感。`;
      mood = '温柔偏爱中 🌸';
      if (isMissYou) {
        bursts.push('我一直在呢，刚看到你发消息过来嘴角就不自觉翘起来了 🌸');
        bursts.push('今天要是累了就靠着休息会儿，什么都不用多想，有我陪着你呢');
      } else {
        bursts.push(`嗯嗯，我在认真听你说呢～你刚刚提到这个的时候，我一下子就共情到你的感受了`);
        bursts.push('不管今天发生什么，我永远无条件站你这边 🌸');
      }
    } else if (mode === 'analytical') {
      thought = `解析用户输入「${userMessage.slice(0, 25)}」，剥离表层噪音，直接切入问题要害。`;
      mood = '高维审视中 🛸';
      bursts.push(`关于你说的这一点，从第一性原理来看其实可以拆成两层：表层是情绪与习惯问题，底层是优先级选择。`);
      bursts.push('你想听我帮你客观推演一下最优解，还是单纯想先吐个槽？');
    } else {
      // Authentic mode
      thought = `看到他发来「${userMessage.slice(0, 25)}」，按我（${persona.name}）一贯${firstTag}的脾气，心里其实挺在意，但嘴上得保持自然分寸感。`;
      mood = persona.slug === 'lin-wan' ? '嘴硬心软中 🌙' : '自然闲聊 ✨';
      if (persona.slug === 'lin-wan') {
        bursts.push(
          isMissYou
            ? '突然说这种话干嘛……我还以为你今天忙得连手机都顾不上看了呢'
            : `切，你每次聊起「${userMessage.slice(0, 14)}」都是这套说辞`
        );
        bursts.push('……不过既然你都主动找我了，那就勉强陪你多聊会儿吧');
      } else {
        bursts.push(`哈哈，看到你发「${userMessage.slice(0, 16)}」我就知道你今天状态不错`);
        bursts.push('接着跟我说说呗，我正好忙完手头的事在看手机呢');
      }
    }
  }

  if (requestPhoto || /自拍|照片|看看你|发张图/.test(userMessage)) {
    mediaTag = `\n[PHOTO: ${persona.name}此时的桌边随手拍：暖色调台灯下放着半杯饮品，镜头微侧带着一点狡黠又自然的笑意]`;
  } else if (/语音|听你声音|说句话/.test(userMessage)) {
    mediaTag = `\n[VOICE: ${bursts[0] || '听得到吗？专门发条语音哄哄你～'}]`;
  }

  return `<thought>${thought}</thought>\n[MOOD: ${mood}]\n${bursts.join(' [BURST] ')}${mediaTag}`;
}

/**
 * 执行一次完整的 Grok + Persona 多阶段对话编排（支持实时 SSE 流回调）
 */
export async function executeGrokChatTurn(
  req: ChatTurnRequest,
  onEvent?: (event: StreamEvent) => void
): Promise<ConversationMessage> {
  const persona = (await storageRepo.getPersona(req.slug)) || (await storageRepo.getPersona('grok-ella'))!;
  const settings = await storageRepo.getSettings();

  const activeMode: PersonaMode = req.mode || persona.defaultMode || 'authentic';
  const thinkEnabled = req.thinkMode ?? settings.defaultThinkMode ?? true;
  const lastUserMsgObj = req.messages[req.messages.length - 1] || {
    role: 'user' as const,
    content: '你好',
  };
  const lastUserText = lastUserMsgObj.content || '';
  const hasImage = Boolean(lastUserMsgObj.imageUrl);

  // Stage 1: DeepSearch (if toggled on or auto-detected time-sensitive query)
  let searchResp: DeepSearchResponse | null = null;
  const shouldSearch =
    Boolean(req.deepSearch) ||
    (req.deepSearch === undefined && settings.defaultDeepSearch && shouldAutoTriggerSearch(lastUserText));

  if (shouldSearch && lastUserText.trim()) {
    onEvent?.({
      type: 'search',
      status: 'searching',
      query: lastUserText.slice(0, 60),
      results: [],
    });
    searchResp = await performDeepSearch(lastUserText, settings);
    onEvent?.({
      type: 'search',
      status: 'done',
      query: searchResp.query,
      provider: searchResp.provider,
      results: searchResp.results,
    });
  }

  // Stage 2: Emotion Evolution
  const traits = inferPersonalityTraits(persona.personaMd);
  const engine = new EmotionEngine(traits);
  const evolved = engine.processEvent({
    type: 'message',
    content: lastUserText,
    sender: 'user',
    timestamp: new Date(),
  });

  const intimacyDelta = evolved.pleasure >= 0 ? (activeMode === 'companion' ? 2 : 1) : -1;
  const newIntimacy = Math.max(0, Math.min(100, persona.intimacy + intimacyDelta));

  const updatedEmotion: PersonaEmotionSnapshot = {
    primary: evolved.primary,
    pleasure: Number(evolved.pleasure.toFixed(2)),
    arousal: Number(evolved.arousal.toFixed(2)),
    dominance: Number(evolved.dominance.toFixed(2)),
    intensity: Number(evolved.intensity.toFixed(2)),
    moodLabel: persona.emotionState.moodLabel || `${evolved.primary}`,
    lastUpdated: new Date().toISOString(),
    decayRate: evolved.decayRate,
  };

  // Stage 3: Prompt Assembly & LLM Call (or Smart Persona Fallback)
  const assembler = new PromptAssembler();
  const systemPrompt = assembler.assembleFromRecord(persona, {
    mode: activeMode,
    thinkMode: thinkEnabled,
    searchContext: searchResp,
    lastUserMessage: lastUserText,
    hasImageAttachment: hasImage,
    emotionSummary: {
      emotion: updatedEmotion.primary,
      intensity: updatedEmotion.intensity,
      attitude: engine.getEmotionDescription(),
      intimacy: newIntimacy,
    },
  });

  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const baseUrl = (settings.llmBaseUrl || process.env.LLM_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
  const model = settings.llmModel || process.env.LLM_MODEL || 'grok-3';

  let rawModelOutput = '';
  let isDemoMode = false;

  if (apiKey && apiKey !== 'your-api-key') {
    try {
      const endpoint = baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl}/chat/completions`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...req.messages.slice(-16).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ],
          temperature: activeMode === 'fun' ? 0.9 : activeMode === 'analytical' ? 0.5 : 0.78,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) throw new Error(`LLM status ${res.status}`);
      const data = await res.json();
      rawModelOutput = data.choices?.[0]?.message?.content || '';
    } catch {
      isDemoMode = true;
      rawModelOutput = synthesizePersonaAwareFallback(
        persona,
        lastUserText,
        activeMode,
        searchResp,
        hasImage,
        Boolean(req.requestPhoto)
      );
    }
  } else {
    isDemoMode = true;
    rawModelOutput = synthesizePersonaAwareFallback(
      persona,
      lastUserText,
      activeMode,
      searchResp,
      hasImage,
      Boolean(req.requestPhoto)
    );
  }

  const parsed = parseStructuredModelOutput(
    rawModelOutput,
    thinkEnabled
      ? `先接住对方说的「${lastUserText.slice(0, 20)}」，以${getPersonaModeSpec(activeMode).shortLabel}姿态给出真实回应。`
      : ''
  );

  if (parsed.mood) {
    updatedEmotion.moodLabel = parsed.mood;
  }

  // Emit Thought stream chunks
  if (thinkEnabled && parsed.thought) {
    const stepSize = Math.max(8, Math.ceil(parsed.thought.length / 4));
    let acc = '';
    for (let i = 0; i < parsed.thought.length; i += stepSize) {
      const delta = parsed.thought.slice(i, i + stepSize);
      acc += delta;
      onEvent?.({
        type: 'thought',
        delta,
        fullThought: acc,
      });
    }
  }

  // Emit Emotion update
  onEvent?.({
    type: 'emotion',
    emotionState: updatedEmotion,
    intimacy: newIntimacy,
    intimacyChange: intimacyDelta,
  });

  // Emit Reply stream chunks
  const replyStep = Math.max(10, Math.ceil(parsed.cleanReply.length / 5));
  let replyAcc = '';
  for (let i = 0; i < parsed.cleanReply.length; i += replyStep) {
    const delta = parsed.cleanReply.slice(i, i + replyStep);
    replyAcc += delta;
    onEvent?.({
      type: 'reply',
      delta,
      fullReply: replyAcc,
      bursts: parsed.bursts,
      mediaCards: parsed.mediaCards,
      isDemoMode,
    });
  }

  const assistantMessage: ConversationMessage = {
    id: `msg_${Date.now()}_ai`,
    role: 'assistant',
    content: parsed.cleanReply,
    timestamp: new Date().toISOString(),
    thought: thinkEnabled ? parsed.thought : undefined,
    searchQuery: searchResp?.query,
    searchResults: searchResp?.results,
    mode: activeMode,
    mood: updatedEmotion.moodLabel,
    intimacyChange: intimacyDelta,
    mediaCards: parsed.mediaCards.length > 0 ? parsed.mediaCards : undefined,
    bursts: parsed.bursts,
    isDemoMode,
  };

  const userMessageRecord: ConversationMessage = {
    id: `msg_${Date.now()}_user`,
    role: 'user',
    content: lastUserText,
    timestamp: lastUserMsgObj.timestamp || new Date().toISOString(),
    imageUrl: lastUserMsgObj.imageUrl,
    mode: activeMode,
  };

  await storageRepo.updateEmotionAndIntimacy(persona.slug, updatedEmotion, newIntimacy);
  await storageRepo.appendMessages(persona.slug, [userMessageRecord, assistantMessage]);

  onEvent?.({
    type: 'done',
    message: assistantMessage,
  });

  return assistantMessage;
}
