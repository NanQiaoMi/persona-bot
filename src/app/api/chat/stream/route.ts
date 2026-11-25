import { executeGroupTurn } from '@/lib/group/group-orchestrator';
import { executeMasterBotTurn } from '@/lib/grok/master-orchestrator';
import { executeGrokChatTurn, StreamEvent } from '@/lib/grok/stream-orchestrator';

export const dynamic = 'force-dynamic';

/** 末尾连续的用户消息（连发合并后一起发来的那几条） */
function trailingUserTurns(
  messages: unknown
): Array<{ content: string; imageUrl?: string; timestamp?: string }> {
  if (!Array.isArray(messages)) return [];
  const out: Array<{ content: string; imageUrl?: string; timestamp?: string }> = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: string; content?: unknown; imageUrl?: unknown; timestamp?: unknown };
    if (m?.role !== 'user') break;
    out.unshift({
      content: typeof m.content === 'string' ? m.content : '',
      imageUrl: typeof m.imageUrl === 'string' ? m.imageUrl : undefined,
      timestamp: typeof m.timestamp === 'string' ? m.timestamp : undefined,
    });
  }
  return out.slice(-6);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const isGroupTurn = typeof body?.groupId === 'string' && body.groupId.trim() !== '';
    if (!isGroupTurn && (!body?.slug || !Array.isArray(body?.messages))) {
      return new Response(
        JSON.stringify({ error: 'Missing slug or messages' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: StreamEvent) => {
          const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        try {
          const payload = {
            slug: body.slug,
            mentionedSlug: body.mentionedSlug,
            messages: body.messages,
            mode: body.mode,
            thinkMode: body.thinkMode,
            deepSearch: body.deepSearch,
            requestPhoto: body.requestPhoto,
            requestSticker: body.requestSticker,
            modelId: body.modelId,
          };

          if (isGroupTurn) {
            const last = Array.isArray(body.messages)
              ? body.messages[body.messages.length - 1]
              : undefined;
            await executeGroupTurn(
              {
                groupId: body.groupId,
                userText: body.kickoff ? undefined : last?.content,
                userTurns: body.kickoff ? undefined : trailingUserTurns(body.messages),
                imageUrl: body.kickoff ? undefined : last?.imageUrl,
                timestamp: last?.timestamp,
                mode: body.mode,
                modelId: body.modelId,
                kickoff: Boolean(body.kickoff),
              },
              sendEvent
            );
          } else if (body.slug === 'master-bot' && !body.mentionedSlug) {
            await executeMasterBotTurn(payload, sendEvent);
          } else {
            await executeGrokChatTurn(payload, sendEvent);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Stream execution failed';
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
