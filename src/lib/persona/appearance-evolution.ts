import fs from 'fs/promises';
import path from 'path';
import { GENERATED_MEDIA_DIR } from '@/lib/grok/image-generator';
import { chatCompletion, resolveLlmConfig } from '@/lib/llm/client';
import { RuntimeSettings } from '@/lib/storage/types';

const MAX_ANCHOR_LENGTH = 140;

/**
 * 清洗外貌锚点文本，去除多余引号、换行和前缀
 */
export function cleanAppearanceText(raw: string): string {
  return (raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^["'「『（(]+|["'」』）)]+$/g, '')
    .replace(/^(?:固定外貌与画风锚点|外貌特征|外貌锚点|人物外貌)[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从本地生成媒体路径或 data URL 读取图片并转为 base64 data URL 供视觉模型分析
 */
export async function loadLocalImageAsDataUrl(
  imageUrl?: string
): Promise<string | null> {
  if (!imageUrl || !imageUrl.trim()) return null;
  const trimmed = imageUrl.trim();

  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/api/media/')) {
    const rawName = trimmed.slice('/api/media/'.length).split('?')[0];
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/i.test(rawName)) {
      return null;
    }
    try {
      const fullPath = path.join(GENERATED_MEDIA_DIR, rawName);
      const buffer = await fs.readFile(fullPath);
      const lower = rawName.toLowerCase();
      const mimeType =
        lower.endsWith('.jpg') || lower.endsWith('.jpeg')
          ? 'image/jpeg'
          : lower.endsWith('.webp')
            ? 'image/webp'
            : 'image/png';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * 在无视觉能力或离线时，仅当存在明确的造型/穿搭/风格线索时做安全提炼，避免凭空编造外貌
 */
function buildHeuristicAppearanceFallback(params: {
  personaStyle?: string;
  currentAnchor?: string;
  fallbackCaption?: string;
}): string | undefined {
  if (params.currentAnchor?.trim()) {
    return undefined;
  }
  const caption = cleanAppearanceText(params.fallbackCaption || '');
  const style = cleanAppearanceText(params.personaStyle || '');
  const traitHint = caption.match(
    /(?:黑长直|短发|波浪卷|马尾|丸子头|齐刘海|金发|银发|红发|棕发|戴眼镜|圆框眼镜|金丝眼镜|卫衣|毛衣|针织衫|西装|风衣|连衣裙|白衬衫|jk|学院风|甜酷|温柔|清冷|胶片|日系|二次元)[^，。,.；;]*/i
  )?.[0];
  if (traitHint && style) {
    return cleanAppearanceText(`${traitHint}，${style}气质，自然写实日常光影画风`).slice(
      0,
      MAX_ANCHOR_LENGTH
    );
  }
  if (traitHint) {
    return cleanAppearanceText(`${traitHint}，自然写实日常光影画风`).slice(
      0,
      MAX_ANCHOR_LENGTH
    );
  }
  return undefined;
}

/**
 * 调用多模态视觉模型看图反推「固定外貌与画风锚点」；离线或不支持视觉时走安全兜底
 */
export async function inferAppearanceAnchorFromImage(params: {
  referenceImageUrl?: string;
  personaName: string;
  personaStyle?: string;
  currentAnchor?: string;
  fallbackCaption?: string;
  settings: Partial<RuntimeSettings>;
}): Promise<{ anchor?: string; usedVision: boolean }> {
  const llm = resolveLlmConfig(params.settings);
  const dataUrl = await loadLocalImageAsDataUrl(params.referenceImageUrl);

  if (llm.canCall && dataUrl) {
    try {
      const styleNote = params.personaStyle ? `（角色气质参考：${params.personaStyle}）` : '';
      const raw = await chatCompletion(
        llm,
        [
          {
            role: 'system',
            content:
              '你是人物造型与画风提炼助手。请根据图片提取可复用于后续拍照的一致性外貌与画风锚点，只输出1句中文描述。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `请观察这张「${params.personaName}」的人物参考图${styleNote}，用 1 句 25~65 字的中文概括固定外貌与画风锚点（涵盖年龄感、脸型五官气质、发型发色、常见穿搭风格与写实/胶片/清透等画风），不要描述背景或一次性动作，不要输出任何前缀或引号。`,
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        { temperature: 0.25, timeoutMs: 30000 }
      );
      const cleaned = cleanAppearanceText(raw).slice(0, 120).trim();
      if (cleaned.length >= 8) {
        return { anchor: cleaned, usedVision: true };
      }
    } catch {
      // Fallback safely below if upstream model does not support vision or times out
    }
  }

  const fallback = buildHeuristicAppearanceFallback(params);
  return { anchor: fallback, usedVision: false };
}

/**
 * 合并外貌锚点更新：若用户已手动锁定则绝不覆盖；未锁定时空则填充、非空则温和增量补充
 */
export function mergeAppearanceAnchorUpdate(
  currentAnchor: string | undefined,
  incomingHint: string | undefined,
  locked?: boolean
): { updated: boolean; anchor?: string } {
  if (locked === true) {
    return { updated: false, anchor: currentAnchor };
  }

  const cleanIncoming = cleanAppearanceText(incomingHint || '');
  if (cleanIncoming.length < 4) {
    return { updated: false, anchor: currentAnchor };
  }

  const cleanCurrent = cleanAppearanceText(currentAnchor || '');
  if (!cleanCurrent) {
    return {
      updated: true,
      anchor: cleanIncoming.slice(0, MAX_ANCHOR_LENGTH),
    };
  }

  const normalizedCurrent = cleanCurrent.toLowerCase();
  const normalizedIncoming = cleanIncoming.toLowerCase();
  if (
    normalizedCurrent.includes(normalizedIncoming) ||
    normalizedIncoming.includes(normalizedCurrent)
  ) {
    return { updated: false, anchor: cleanCurrent };
  }

  const combined = `${cleanCurrent}；${cleanIncoming}`;
  if (combined.length <= MAX_ANCHOR_LENGTH) {
    return { updated: true, anchor: combined };
  }

  const budget = MAX_ANCHOR_LENGTH - cleanCurrent.length - 1;
  if (budget >= 8) {
    return {
      updated: true,
      anchor: `${cleanCurrent}；${cleanIncoming.slice(0, budget)}`,
    };
  }

  return { updated: false, anchor: cleanCurrent };
}

/**
 * 纯 TS 启发式提取对话中明确约定的角色外貌/穿搭/造型变化（离线/无 LLM 兜底）
 */
export function extractAppearanceHintFromConversation(
  messages: Array<{ role: string; content: string }>
): string | undefined {
  const recent = messages.slice(-10);
  const patterns = [
    /(?:以后|平时|经常|习惯|下次|最近)(?:都|就|想)?(?:戴|穿|留|换上|剪成|染成)([^，。,.！？!?\n]{2,18})/,
    /(?:我是|我平时是|我留着|我现在是)([^，。,.！？!?\n]{2,18}(?:长发|短发|卷发|黑长直|马尾|眼镜|卫衣|衬衫|连衣裙|风衣|风格))/,
  ];
  for (let i = recent.length - 1; i >= 0; i--) {
    const text = recent[i]?.content || '';
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[0]) {
        const candidate = cleanAppearanceText(m[0]);
        if (candidate.length >= 4 && candidate.length <= 40) {
          return candidate;
        }
      }
    }
  }
  return undefined;
}
