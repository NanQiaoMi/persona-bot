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

export { isLocalGatewayUrl } from '@/lib/llm/client';

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

export function buildReferenceAwarePrompt(
  kind: 'photo' | 'sticker',
  caption: string,
  personaName: string,
  personaStyle?: string,
  appearanceAnchor?: string
): string {
  const cleanCaption = caption.trim() || '日常开心瞬间';
  const anchorLine = appearanceAnchor?.trim()
    ? `Maintain consistent traits: "${appearanceAnchor.trim()}".`
    : '';
  const styleHint = personaStyle ? ` (${personaStyle})` : '';

  if (kind === 'sticker') {
    return [
      `Create a cute messaging chat sticker preserving the exact character identity and facial features from the reference image (${personaName}${styleHint}).`,
      anchorLine,
      `Expression and pose: "${cleanCaption}". Clean minimal off-white background, vector sticker style.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    `Generate a natural candid photograph of the EXACT same person shown in the reference image (${personaName}${styleHint}), preserving her exact face, facial features, hairstyle, and identity.`,
    anchorLine,
    `New scene, pose, outfit and lighting: "${cleanCaption}".`,
    'Realistic smartphone candid photography, natural skin texture, authentic lighting, no watermark, no text overlays.',
  ]
    .filter(Boolean)
    .join(' ');
}

async function loadReferenceImageBuffer(
  referenceImageUrl?: string
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  if (!referenceImageUrl || !referenceImageUrl.trim()) return null;
  const trimmed = referenceImageUrl.trim();

  if (trimmed.startsWith('/api/media/')) {
    const rawName = trimmed.slice('/api/media/'.length).split('?')[0];
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/i.test(rawName)) {
      return null;
    }
    try {
      const fullPath = path.join(GENERATED_MEDIA_DIR, rawName);
      const buffer = await fs.readFile(fullPath);
      const ext = normalizeExt(rawName);
      const mimeType =
        ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
      return { buffer, filename: rawName, mimeType };
    } catch {
      return null;
    }
  }

  const dataMatch = trimmed.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i
  );
  if (dataMatch) {
    const mimeType = dataMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : dataMatch[1].toLowerCase();
    const ext = normalizeExt(mimeType);
    return {
      buffer: Buffer.from(dataMatch[2], 'base64'),
      filename: `reference.${ext}`,
      mimeType,
    };
  }

  return null;
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
  referenceImageUrl?: string;
  baseUrl: string;
  apiKey?: string;
  imageModel: string;
}

export interface GenerateMediaResult {
  imageUrl?: string;
  model: string;
  prompt: string;
  usedReferenceImage?: boolean;
  errorHint?: string;
}

async function extractMediaResponse(
  res: Response,
  kind: 'photo' | 'sticker',
  model: string,
  prompt: string,
  usedReferenceImage = false
): Promise<GenerateMediaResult | null> {
  const json = await res.json();
  const first = json?.data?.[0];

  if (first?.b64_json) {
    const buf = Buffer.from(String(first.b64_json), 'base64');
    const localUrl = await saveGeneratedMediaBuffer(
      buf,
      'png',
      kind === 'sticker' ? 'sticker' : 'photo'
    );
    return { imageUrl: localUrl, model, prompt, usedReferenceImage };
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
          kind === 'sticker' ? 'sticker' : 'photo'
        );
        return { imageUrl: localUrl, model, prompt, usedReferenceImage };
      }
    }

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
          kind === 'sticker' ? 'sticker' : 'photo'
        );
        return { imageUrl: localUrl, model, prompt, usedReferenceImage };
      }
    } catch {
      // Fallback to returning remoteUrl directly if binary download fails
    }

    return { imageUrl: remoteUrl, model, prompt, usedReferenceImage };
  }

  return null;
}

/**
 * 调用 OpenAI 兼容接口生成图片或表情包：若存在人物参考图，优先走 `/images/edits` 保持人物一致性，失败自动回退 `/images/generations`
 */
export async function generatePersonaMedia(
  params: GenerateMediaParams
): Promise<GenerateMediaResult> {
  const cleanBase = params.baseUrl.replace(/\/$/, '');
  const endpoint = `${cleanBase}/images/generations`;
  const editsEndpoint = `${cleanBase}/images/edits`;
  const model = params.imageModel || 'gpt-image-2.6';
  const prompt = buildMediaGenerationPrompt(
    params.kind,
    params.caption,
    params.personaName,
    params.personaStyle,
    params.appearanceAnchor
  );

  const authHeaders: Record<string, string> = {};
  if (params.apiKey && params.apiKey !== 'your-api-key') {
    authHeaders.Authorization = `Bearer ${params.apiKey}`;
  }

  // Try reference-guided /images/edits first when a reference image is configured
  const refImg = await loadReferenceImageBuffer(params.referenceImageUrl);
  if (refImg) {
    try {
      const refPrompt = buildReferenceAwarePrompt(
        params.kind,
        params.caption,
        params.personaName,
        params.personaStyle,
        params.appearanceAnchor
      );
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', refPrompt);
      form.append('n', '1');
      form.append('size', '1024x1024');
      form.append(
        'image',
        new Blob([new Uint8Array(refImg.buffer)], { type: refImg.mimeType }),
        refImg.filename
      );

      const editRes = await fetch(editsEndpoint, {
        method: 'POST',
        headers: authHeaders,
        body: form,
        signal: AbortSignal.timeout(120000),
      });

      if (editRes.ok) {
        const extracted = await extractMediaResponse(
          editRes,
          params.kind,
          model,
          refPrompt,
          true
        );
        if (extracted?.imageUrl) {
          return extracted;
        }
      }
    } catch {
      // Fallback transparently to text-to-image /images/generations below
    }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
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

    const extracted = await extractMediaResponse(res, params.kind, model, prompt, false);
    if (extracted) {
      return extracted;
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
