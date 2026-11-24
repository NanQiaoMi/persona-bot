import fs from 'fs/promises';
import path from 'path';
import {
  LOCAL_CHAT_MODELS,
  LOCAL_GATEWAY_BASE_URL,
  LOCAL_IMAGE_MODELS,
} from './models';

export { LOCAL_CHAT_MODELS, LOCAL_GATEWAY_BASE_URL, LOCAL_IMAGE_MODELS };

export const GENERATED_MEDIA_DIR = path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  '.data',
  'generated-media'
);

export function isLocalGatewayUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(
    url.trim()
  );
}

/**
 * 为「贴纸表情包」与「情境照片」分别构造风格稳定的文生图 Prompt
 */
export function buildMediaGenerationPrompt(
  kind: 'photo' | 'sticker',
  caption: string,
  personaName: string,
  personaStyle?: string,
  appearanceAnchor?: string
): string {
  const cleanCaption = caption.trim() || '日常开心瞬间';
  const styleHint = personaStyle ? ` (${personaStyle})` : '';
  const anchorLine = appearanceAnchor?.trim()
    ? `Consistent character appearance anchor: "${appearanceAnchor.trim()}".`
    : '';

  if (kind === 'sticker') {
    return [
      `Cute expressive messaging chat sticker illustration of an adorable stylized character representing "${personaName}"${styleHint}.`,
      anchorLine,
      `Expressive exaggerated facial emotion and body pose showing: "${cleanCaption}".`,
      'Clean solid off-white minimal background, thick clean outline, vibrant flat-matte vector sticker aesthetic, crisp centered composition, no watermark, no messy clutter.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    `Natural candid lifestyle photograph matching this exact description: "${cleanCaption}".`,
    anchorLine,
    `Style tone matching "${personaName}"${styleHint}.`,
    'Realistic photography, natural lighting, authentic lens depth of field, high detail, aesthetic framing, no watermark, no text overlays.',
  ]
    .filter(Boolean)
    .join(' ');
}

function normalizeExt(mimeOrUrl: string): 'png' | 'jpg' | 'webp' {
  const lower = mimeOrUrl.toLowerCase();
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  if (lower.includes('webp')) return 'webp';
  return 'png';
}

export async function saveGeneratedMediaBuffer(
  buffer: Buffer,
  ext: 'png' | 'jpg' | 'webp' = 'png',
  prefix = 'media'
): Promise<string> {
  await fs.mkdir(GENERATED_MEDIA_DIR, { recursive: true });
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'media';
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `${safePrefix}_${Date.now()}_${rand}.${ext}`;
  const fullPath = path.join(GENERATED_MEDIA_DIR, filename);
  await fs.writeFile(fullPath, buffer);
  return `/api/media/${filename}`;
}

export interface GenerateMediaParams {
  kind: 'photo' | 'sticker';
  caption: string;
  personaName: string;
  personaStyle?: string;
  appearanceAnchor?: string;
  baseUrl: string;
  apiKey?: string;
  imageModel: string;
}

export interface GenerateMediaResult {
  imageUrl?: string;
  model: string;
  prompt: string;
  errorHint?: string;
}

/**
 * 调用 OpenAI 兼容 `/images/generations` 接口生成图片或表情包并持久化落盘
 */
export async function generatePersonaMedia(
  params: GenerateMediaParams
): Promise<GenerateMediaResult> {
  const cleanBase = params.baseUrl.replace(/\/$/, '');
  const endpoint = `${cleanBase}/images/generations`;
  const model = params.imageModel || 'gpt-image-2.6';
  const prompt = buildMediaGenerationPrompt(
    params.kind,
    params.caption,
    params.personaName,
    params.personaStyle,
    params.appearanceAnchor
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.apiKey && params.apiKey !== 'your-api-key') {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: '1024x1024',
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        model,
        prompt,
        errorHint: `本地网关未登录（HTTP ${res.status}），请先在客户端登录后填入密钥以生成真实图片`,
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        model,
        prompt,
        errorHint: `生图接口返回异常（HTTP ${res.status}）${errText ? `: ${errText.slice(0, 60)}` : ''}`,
      };
    }

    const json = await res.json();
    const first = json?.data?.[0];

    if (first?.b64_json) {
      const buf = Buffer.from(String(first.b64_json), 'base64');
      const localUrl = await saveGeneratedMediaBuffer(
        buf,
        'png',
        params.kind === 'sticker' ? 'sticker' : 'photo'
      );
      return { imageUrl: localUrl, model, prompt };
    }

    if (first?.url) {
      const remoteUrl = String(first.url);
      if (remoteUrl.startsWith('data:image/')) {
        const match = remoteUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (match) {
          const ext = normalizeExt(match[1]);
          const buf = Buffer.from(match[2], 'base64');
          const localUrl = await saveGeneratedMediaBuffer(
            buf,
            ext,
            params.kind === 'sticker' ? 'sticker' : 'photo'
          );
          return { imageUrl: localUrl, model, prompt };
        }
      }

      // Download remote URL locally so chat history images never expire
      try {
        const imgRes = await fetch(remoteUrl, {
          signal: AbortSignal.timeout(15000),
        });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          const ext = normalizeExt(contentType);
          const arrBuf = await imgRes.arrayBuffer();
          const localUrl = await saveGeneratedMediaBuffer(
            Buffer.from(arrBuf),
            ext,
            params.kind === 'sticker' ? 'sticker' : 'photo'
          );
          return { imageUrl: localUrl, model, prompt };
        }
      } catch {
        // Fallback to returning remoteUrl directly if binary download fails
      }

      return { imageUrl: remoteUrl, model, prompt };
    }

    return {
      model,
      prompt,
      errorHint: '生图接口未返回有效图片数据，已保留文字描述卡片',
    };
  } catch {
    return {
      model,
      prompt,
      errorHint: '图片网关暂未连通，已展示文字情境卡片',
    };
  }
}
