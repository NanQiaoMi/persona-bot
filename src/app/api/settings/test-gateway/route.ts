import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function classifyGatewayModels(models: string[]): {
  chatModels: string[];
  imageModels: string[];
} {
  const imageRegex = /image|dall-e|flux|imagen|midjourney/i;
  const nonChatRegex = /image|dall-e|flux|imagen|midjourney|whisper|tts|embedding|moderation/i;

  const imageModels = models.filter((id) => imageRegex.test(id));
  const chatModels = models
    .filter((id) => !nonChatRegex.test(id))
    .sort((a, b) => {
      const aReserved = /reserved|alpha/i.test(a) ? 1 : 0;
      const bReserved = /reserved|alpha/i.test(b) ? 1 : 0;
      if (aReserved !== bReserved) return aReserved - bReserved;
      return a.localeCompare(b);
    });

  return { chatModels, imageModels };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawBaseUrl = String(body?.baseUrl || 'http://127.0.0.1:18630/v1').trim();
    const baseUrl = rawBaseUrl.replace(/\/$/, '');
    const apiKey = String(body?.apiKey || '').trim();
    const chatModel = String(body?.chatModel || 'gpt-5.6').trim();

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
      const modelsRes = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (modelsRes.ok) {
        const json = await modelsRes.json().catch(() => ({}));
        const models = Array.isArray(json?.data)
          ? (json.data as Array<{ id?: string }>)
              .map((m) => m.id)
              .filter((id): id is string => Boolean(id))
          : [];
        const { chatModels, imageModels } = classifyGatewayModels(models);
        return NextResponse.json({
          success: true,
          reachable: true,
          authStatus: 'ok',
          statusCode: modelsRes.status,
          models,
          chatModels,
          imageModels,
          message:
            models.length > 0
              ? `✓ 本地网关已连通，拉取到 ${chatModels.length} 个对话模型与 ${imageModels.length} 个生图模型`
              : '✓ 本地网关已连通，认证状态正常',
        });
      }

      if (modelsRes.status === 401 || modelsRes.status === 403) {
        return NextResponse.json({
          success: true,
          reachable: true,
          authStatus: 'unauthorized',
          statusCode: modelsRes.status,
          message: `网关端口已连通，但返回未登录（HTTP ${modelsRes.status}）。请先在本地网关客户端登录并复制密钥填入 API Key`,
        });
      }

      // Some gateways only expose /chat/completions and return 404/405 for /models
      if (modelsRes.status === 404 || modelsRes.status === 405) {
        const chatRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            model: chatModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 4,
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (chatRes.ok) {
          return NextResponse.json({
            success: true,
            reachable: true,
            authStatus: 'ok',
            statusCode: chatRes.status,
            models: [],
            message: `✓ 网关对话接口已连通（${chatModel}）`,
          });
        }

        if (chatRes.status === 401 || chatRes.status === 403) {
          return NextResponse.json({
            success: true,
            reachable: true,
            authStatus: 'unauthorized',
            statusCode: chatRes.status,
            message: `网关已连通但未登录（HTTP ${chatRes.status}），请先登录网关或填入调用密钥`,
          });
        }

        return NextResponse.json({
          success: true,
          reachable: true,
          authStatus: 'error',
          statusCode: chatRes.status,
          message: `网关已响应（HTTP ${chatRes.status}），请检查模型名称或登录状态`,
        });
      }

      return NextResponse.json({
        success: true,
        reachable: true,
        authStatus: 'error',
        statusCode: modelsRes.status,
        message: `网关返回状态 HTTP ${modelsRes.status}，请确认接口路径与密钥`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '连接失败';
      return NextResponse.json({
        success: true,
        reachable: false,
        authStatus: 'offline',
        message: `${baseUrl} 没有响应`,
        detail: msg,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
