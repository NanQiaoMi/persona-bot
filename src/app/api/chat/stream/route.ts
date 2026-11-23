import { executeMasterBotTurn } from '@/lib/grok/master-orchestrator';
import { executeGrokChatTurn, StreamEvent } from '@/lib/grok/stream-orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body?.slug || !Array.isArray(body?.messages)) {
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
            messages: body.messages,
            mode: body.mode,
            thinkMode: body.thinkMode,
            deepSearch: body.deepSearch,
            requestPhoto: body.requestPhoto,
            requestSticker: body.requestSticker,
            modelId: body.modelId,
          };

          if (body.slug === 'master-bot') {
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
