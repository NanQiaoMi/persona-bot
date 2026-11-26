import {
  ChatTurnRequest,
  executeGrokChatTurn,
  StreamEvent,
} from '@/lib/grok/stream-orchestrator';
import { getMascotConfigForPersona } from '@/components/workspace/mascot-palette';
import { detectGroupIntent } from '@/lib/group/director';
import { createBotFromIntent, createdReplyText } from '@/lib/persona/chat-create';
import { detectCreateBotIntent } from '@/lib/persona/create-intent';
import { storageRepo } from '@/lib/storage/repository';
import {
  ConversationMessage,
  InterBotReport,
  PersonaSummary,
} from '@/lib/storage/types';

function selectSubBotsForPrompt(
  prompt: string,
  subBots: PersonaSummary[]
): PersonaSummary[] {
  if (subBots.length === 0) return [];

  const lower = prompt.toLowerCase();
  const explicitMatches = subBots.filter((bot) => {
    const tokens = [
      bot.name,
      bot.slug,
      bot.name.split(/\s+/)[0],
      bot.profile.occupation || '',
      ...(bot.profile.personalityTags || []),
    ]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2);
    return tokens.some((tok) => lower.includes(tok));
  });

  if (explicitMatches.length >= 2) {
    return explicitMatches.slice(0, 3);
  }

  if (explicitMatches.length === 1) {
    const rest = subBots.filter((b) => b.slug !== explicitMatches[0].slug);
    const wantsAll = /(所有|全部|大家|协同|汇总|一起|三个|几个|bot)/i.test(prompt);
    if (wantsAll && rest.length > 0) {
      return [explicitMatches[0], ...rest.slice(0, 2)];
    }
    return explicitMatches;
  }

  // Default: dispatch to up to 3 active sub-bots to collaborate & report back
  return subBots.slice(0, Math.min(3, subBots.length));
}

export async function executeMasterBotTurn(
  req: ChatTurnRequest,
  onEvent?: (event: StreamEvent) => void
): Promise<ConversationMessage> {
  const master = await storageRepo.getPersona('master-bot');
  const allPersonas = await storageRepo.listPersonas();
  const subBots = allPersonas.filter((p) => !p.isMaster && p.slug !== 'master-bot');

  const lastUserMsgObj = req.messages[req.messages.length - 1] || {
    role: 'user' as const,
    content: '',
  };
  const lastUserText = lastUserMsgObj.content || '';

  // 「拉个群聊聊 X」：建群并在主频道留下入群卡片，而不是派活汇总
  const groupIntent = detectGroupIntent(lastUserText, subBots);
  if (groupIntent && groupIntent.members.length >= 2) {
    const group = await storageRepo.createGroup({
      name: groupIntent.name,
      memberSlugs: groupIntent.members.map((m) => m.slug),
      topic: groupIntent.topic,
    });
    const memberNames = groupIntent.members.map((m) => m.name);
    const content = groupIntent.topic
      ? `群建好了，拉了${memberNames.join('、')}进来，话题就聊「${groupIntent.topic}」，点下面进群`
      : `群建好了，拉了${memberNames.join('、')}进来，点下面进群`;
    const nowIso = new Date().toISOString();
    const userRecord: ConversationMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: lastUserText,
      timestamp: lastUserMsgObj.timestamp || nowIso,
      imageUrl: lastUserMsgObj.imageUrl,
    };
    const reply: ConversationMessage = {
      id: `msg_${Date.now()}_master_group`,
      role: 'assistant',
      content,
      timestamp: nowIso,
      bursts: [content],
      groupInvite: {
        groupId: group.id,
        name: group.name,
        memberNames,
        topic: group.topic,
      },
    };
    await storageRepo.appendMessages('master-bot', [userRecord, reply]);
    onEvent?.({ type: 'message_part', message: reply, index: 0, total: 1, hasMore: false });
    onEvent?.({ type: 'done', message: reply, messages: [reply] });
    return reply;
  }

  // 「帮我建一个 XX 的 bot，叫 X」：直接建好，并在主频道留一张新 Bot 卡片
  const createIntent = detectCreateBotIntent(lastUserText);
  if (createIntent) {
    onEvent?.({ type: 'status', text: `正在给${createIntent.name || '新 Bot'}捏人设...` });
    const { card } = await createBotFromIntent(createIntent);
    const content = createdReplyText(card, { autoNamed: !createIntent.name });
    const nowIso = new Date().toISOString();
    const userRecord: ConversationMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: lastUserText,
      timestamp: lastUserMsgObj.timestamp || nowIso,
      imageUrl: lastUserMsgObj.imageUrl,
    };
    const reply: ConversationMessage = {
      id: `msg_${Date.now()}_master_create`,
      role: 'assistant',
      content,
      timestamp: nowIso,
      bursts: [content],
      botCreated: card,
    };
    await storageRepo.appendMessages('master-bot', [userRecord, reply]);
    onEvent?.({ type: 'message_part', message: reply, index: 0, total: 1, hasMore: false });
    onEvent?.({ type: 'done', message: reply, messages: [reply] });
    return reply;
  }

  const targets = selectSubBotsForPrompt(lastUserText, subBots);

  if (targets.length === 0) {
    return executeGrokChatTurn({ ...req, slug: 'master-bot' }, onEvent);
  }

  const startMs = Date.now();
  const targetNames = targets.map((b) => b.name).join('、');
  onEvent?.({
    type: 'status',
    text: `正在调度 ${targets.length} 个 Bot (${targetNames})...`,
  });

  if (req.thinkMode !== false) {
    const initialThought = `收到主控指令，准备分派给 ${targets.length} 个专业子 Bot 并行处理：${targetNames}。`;
    onEvent?.({
      type: 'thought',
      delta: initialThought,
      fullThought: initialThought,
      durationMs: 250,
    });
  }

  const reports: InterBotReport[] = [];
  let completedCount = 0;

  await Promise.all(
    targets.map(async (bot, idx) => {
      const mascot = getMascotConfigForPersona(bot.slug, bot.profile, idx);
      try {
        const subResult = await executeGrokChatTurn({
          slug: bot.slug,
          messages: [
            {
              role: 'user',
              content: `[来自主控 Bot「${master?.name || '猫咪的bot'}」的任务分派]\n${lastUserText}\n\n请用你的专业视角给出简洁、可核查的核心发现（2~4句即可）。`,
              timestamp: new Date().toISOString(),
            },
          ],
          mode: req.mode || bot.defaultMode || 'analytical',
          thinkMode: false,
          deepSearch: Boolean(req.deepSearch),
          requestPhoto: false,
          modelId: req.modelId,
        });

        completedCount += 1;
        onEvent?.({
          type: 'status',
          text: `${bot.name} 已回传结果 (${completedCount}/${targets.length})...`,
        });

        reports.push({
          slug: bot.slug,
          name: bot.name,
          shape: mascot.shape,
          color: mascot.color,
          summary: subResult.content.replace(/\s+/g, ' ').trim(),
          timestamp: subResult.timestamp,
        });
      } catch (err) {
        completedCount += 1;
        const msg = err instanceof Error ? err.message : '执行异常';
        reports.push({
          slug: bot.slug,
          name: bot.name,
          shape: mascot.shape,
          color: mascot.color,
          summary: `执行受阻（${msg}），已标记待重查。`,
          timestamp: new Date().toISOString(),
        });
      }
    })
  );

  onEvent?.({
    type: 'status',
    text: `正在汇总 ${reports.length} 个 Bot 的汇报...`,
  });

  const summaryLines = reports.map((r) => {
    const snippet = r.summary.length > 92 ? `${r.summary.slice(0, 92)}...` : r.summary;
    return `- **${r.name}**：${snippet}`;
  });

  const masterReply = [
    `${reports.length} 个助手已交回本轮执行结果，完整明细与待核验项已归档记录：`,
    '',
    ...summaryLines,
    '',
    `如需让某位助手继续深挖，直接点击上方「${reports.length} 个 Bot」查看往来详情，或在对应 Bot 频道继续追问。`,
  ].join('\n');

  const durationMs = Math.max(480, Date.now() - startMs);
  if (req.thinkMode !== false) {
    const fullThought = `已分派任务给 ${targetNames}，累计收到 ${reports.length} 条跨 Bot 汇报，完成第一阶段交叉汇总（耗时 ${(durationMs / 1000).toFixed(1)}s）。`;
    onEvent?.({
      type: 'thought',
      delta: '',
      fullThought,
      durationMs,
    });
  }

  const bursts = masterReply.split('\n\n').filter(Boolean);
  const step = Math.max(10, Math.ceil(masterReply.length / 8));
  let acc = '';
  for (let i = 0; i < masterReply.length; i += step) {
    const delta = masterReply.slice(i, i + step);
    acc += delta;
    onEvent?.({
      type: 'reply',
      delta,
      fullReply: acc,
      bursts,
      mediaCards: [],
      isDemoMode: false,
    });
  }

  const assistantMessage: ConversationMessage = {
    id: `msg_${Date.now()}_master`,
    role: 'assistant',
    content: masterReply,
    timestamp: new Date().toISOString(),
    thought:
      req.thinkMode !== false
        ? `已协同 ${targetNames} 完成任务分发与跨 Bot 结果归档。`
        : undefined,
    thoughtDurationMs: req.thinkMode !== false ? durationMs : undefined,
    interBotReports: reports,
    mode: req.mode || master?.defaultMode || 'analytical',
    bursts,
    isDemoMode: false,
  };

  const userMessageRecord: ConversationMessage = {
    id: `msg_${Date.now()}_user`,
    role: 'user',
    content: lastUserText,
    timestamp: lastUserMsgObj.timestamp || new Date().toISOString(),
    imageUrl: lastUserMsgObj.imageUrl,
    mode: req.mode || 'analytical',
  };

  await storageRepo.appendMessages('master-bot', [userMessageRecord, assistantMessage]);

  onEvent?.({
    type: 'done',
    message: assistantMessage,
  });

  return assistantMessage;
}
