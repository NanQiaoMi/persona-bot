import {
  generatePersonaMedia,
  LOCAL_GATEWAY_BASE_URL,
  saveGeneratedMediaBuffer,
} from '@/lib/grok/image-generator';
import { chatCompletion, resolveLlmConfig } from '@/lib/llm/client';
import {
  cleanAppearanceText,
  loadLocalImageAsDataUrl,
} from '@/lib/persona/appearance-evolution';
import { storageRepo } from '@/lib/storage/repository';
import {
  RuntimeSettings,
  SceneAsset,
  SceneAssetCategory,
} from '@/lib/storage/types';

const CATEGORY_KEYWORD_BANK: Record<SceneAssetCategory, string[]> = {
  room: ['房间', '卧室', '书房', '客厅', '阳台', '床边', '书桌', '桌面', '家里', '室内'],
  location: ['咖啡馆', '咖啡店', '工作室', '海边', '天台', '街角', '图书馆', '公园'],
  environment: ['工位', '窗边', '角落', '电脑桌', '沙发', '台灯', '环境'],
};

const KNOWN_SCENE_TOKENS = [
  '卧室',
  '房间',
  '书房',
  '书桌',
  '桌面',
  '客厅',
  '阳台',
  '床上',
  '床边',
  '家里',
  '宿舍',
  '工作室',
  '咖啡馆',
  '咖啡店',
  '奶茶店',
  '海边',
  '沙滩',
  '天台',
  '街角',
  '巷口',
  '公园',
  '图书馆',
  '健身房',
  '工位',
  '电脑桌',
  '窗边',
  '沙发',
  '厨房',
  '餐厅',
  '画室',
  '琴房',
];

export function deriveSceneKeywords(
  name: string,
  category: SceneAssetCategory,
  description?: string
): string[] {
  const combined = `${name} ${description || ''}`;
  const set = new Set<string>();
  const cleanName = cleanAppearanceText(name);
  if (cleanName.length >= 2) {
    set.add(cleanName);
    const stripped = cleanName.replace(/^(?:我的|她的|他的|那个|这个|常去的)/, '').trim();
    if (stripped.length >= 2) {
      set.add(stripped);
    }
  }

  for (const token of KNOWN_SCENE_TOKENS) {
    if (combined.includes(token)) {
      set.add(token);
    }
  }

  if (set.size <= 1) {
    for (const fallbackToken of CATEGORY_KEYWORD_BANK[category].slice(0, 3)) {
      if (cleanName.includes(fallbackToken)) {
        set.add(fallbackToken);
      }
    }
  }

  return Array.from(set).slice(0, 8);
}

export async function inferSceneDescriptionFromImage(params: {
  imageUrl?: string;
  name: string;
  category: SceneAssetCategory;
  hint?: string;
  settings: Partial<RuntimeSettings>;
}): Promise<string> {
  const cleanHint = cleanAppearanceText(params.hint || '');
  const llm = resolveLlmConfig(params.settings);
  const dataUrl = await loadLocalImageAsDataUrl(params.imageUrl);

  if (llm.canCall && dataUrl) {
    try {
      const raw = await chatCompletion(
        llm,
        [
          {
            role: 'system',
            content:
              '你是场景环境资产提炼助手。请根据图片提取可复用于后续生图保持场景一致性的环境描述，只输出1句20~55字的中文。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `请观察这张名为「${params.name}」的场景图，用 1 句 20~55 字中文描述该环境的固定视觉特征（空间布局、主色调、灯光氛围、标志性家具或景物，不要描述人物表情和动作，不要输出前缀和引号）。`,
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
        { temperature: 0.25, timeoutMs: 25000 }
      );
      const cleaned = cleanAppearanceText(raw).slice(0, 120);
      if (cleaned.length >= 8) {
        return cleaned;
      }
    } catch {
      // Fallback below
    }
  }

  if (cleanHint.length >= 6) {
    return `${params.name}：${cleanHint}`.slice(0, 120);
  }

  if (params.category === 'room') {
    return `${params.name}，柔和自然室内光影与舒适居家陈设，固定房间布局与色调`;
  }
  if (params.category === 'location') {
    return `${params.name}，标志性环境氛围与自然真实街景/室内光影`;
  }
  return `${params.name}，固定环境细节、器物陈设与自然写实光影质感`;
}

export async function createSceneAssetFromExisting(
  slug: string,
  input: {
    name: string;
    category?: SceneAssetCategory;
    imageUrl: string;
    description?: string;
  }
): Promise<{ asset: SceneAsset; assets: SceneAsset[] }> {
  const cleanName = cleanAppearanceText(input.name) || '固定场景';
  const category: SceneAssetCategory = input.category || 'room';
  let finalImageUrl = input.imageUrl.trim();

  const dataMatch = finalImageUrl.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i
  );
  if (dataMatch) {
    const extRaw = dataMatch[1].toLowerCase();
    const ext =
      extRaw === 'jpeg' || extRaw === 'jpg'
        ? 'jpg'
        : extRaw === 'webp'
          ? 'webp'
          : 'png';
    finalImageUrl = await saveGeneratedMediaBuffer(
      Buffer.from(dataMatch[2], 'base64'),
      ext,
      'asset'
    );
  }

  const settings = await storageRepo.getSettings();
  const description = await inferSceneDescriptionFromImage({
    imageUrl: finalImageUrl,
    name: cleanName,
    category,
    hint: input.description,
    settings,
  });

  const asset: SceneAsset = {
    id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    category,
    imageUrl: finalImageUrl,
    description,
    keywords: deriveSceneKeywords(cleanName, category, description),
    createdAt: new Date().toISOString(),
  };

  const assets = await storageRepo.updateSceneAssets(slug, (current) => [
    asset,
    ...current,
  ]);
  return { asset, assets };
}

export async function createSceneAssetFromUpload(
  slug: string,
  input: {
    name: string;
    category?: SceneAssetCategory;
    dataUrl: string;
    description?: string;
  }
): Promise<{ asset: SceneAsset; assets: SceneAsset[] }> {
  const match = input.dataUrl.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i
  );
  if (!match) {
    throw new Error('仅支持 PNG/JPG/WEBP 格式图片');
  }
  const extRaw = match[1].toLowerCase();
  const ext =
    extRaw === 'jpeg' || extRaw === 'jpg'
      ? 'jpg'
      : extRaw === 'webp'
        ? 'webp'
        : 'png';
  const imageUrl = await saveGeneratedMediaBuffer(
    Buffer.from(match[2], 'base64'),
    ext,
    'asset'
  );

  return createSceneAssetFromExisting(slug, {
    name: input.name,
    category: input.category,
    imageUrl,
    description: input.description,
  });
}

export async function generateSceneAsset(
  slug: string,
  input: {
    name: string;
    category?: SceneAssetCategory;
    description?: string;
  }
): Promise<{ asset?: SceneAsset; assets: SceneAsset[]; error?: string }> {
  const [persona, settings] = await Promise.all([
    storageRepo.getPersona(slug),
    storageRepo.getSettings(),
  ]);
  if (!persona) {
    throw new Error('Persona not found');
  }

  const cleanName = cleanAppearanceText(input.name) || '常去场景';
  const category: SceneAssetCategory = input.category || 'room';
  const hint = cleanAppearanceText(input.description || '');
  const caption = hint
    ? `${cleanName}，${hint}，空场景环境摄影，无人像，自然光影与真实室内外细节`
    : `${cleanName}，空场景环境实拍摄影，无人像，生活感陈设与自然柔和光影`;

  const baseUrl = (
    settings.llmBaseUrl ||
    process.env.LLM_BASE_URL ||
    LOCAL_GATEWAY_BASE_URL
  ).replace(/\/$/, '');
  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const imageModel =
    settings.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2.6';

  const mediaRes = await generatePersonaMedia({
    kind: 'photo',
    caption,
    personaName: `${persona.name}的场景`,
    baseUrl,
    apiKey,
    imageModel,
  });

  if (!mediaRes.imageUrl) {
    const assets = await storageRepo.getSceneAssets(slug);
    return {
      assets,
      error: mediaRes.errorHint || '场景图生成失败，请检查生图网关或手动上传图片',
    };
  }

  const created = await createSceneAssetFromExisting(slug, {
    name: cleanName,
    category,
    imageUrl: mediaRes.imageUrl,
    description: hint || undefined,
  });
  return { asset: created.asset, assets: created.assets };
}

/**
 * 智能匹配画面描述命中的固定场景资产，并判断是否属于“无人像纯环境照”
 */
export function matchSceneAssetForCaption(
  assets: SceneAsset[],
  caption: string
): { asset: SceneAsset; isPureEnvironment: boolean } | null {
  if (!assets || assets.length === 0 || !caption || !caption.trim()) {
    return null;
  }
  const normalizedCaption = caption.toLowerCase();

  let bestAsset: SceneAsset | null = null;
  let bestScore = 0;

  for (const asset of assets) {
    let score = 0;
    const cleanName = asset.name.trim().toLowerCase();
    if (cleanName && normalizedCaption.includes(cleanName)) {
      score = Math.max(score, cleanName.length * 3);
    }
    for (const kw of asset.keywords || []) {
      const k = kw.trim().toLowerCase();
      if (k.length >= 2 && normalizedCaption.includes(k)) {
        score = Math.max(score, k.length * 2);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAsset = asset;
    }
  }

  if (!bestAsset) return null;

  const hasPersonCue =
    /(?:自拍|对镜|本人|露脸|半身|全身|微笑|看镜头|回头|穿搭|穿着|她|他|我|少女|少年|女生|男生)/.test(
      caption
    );
  const hasEnvOnlyCue =
    /(?:空房|空镜|一角|桌面|窗外|风景|环境|室内|房间里|桌面上|咖啡杯|无人)/.test(
      caption
    );
  const isPureEnvironment = !hasPersonCue || (hasEnvOnlyCue && !/自拍|对镜|半身|露脸/.test(caption));

  return { asset: bestAsset, isPureEnvironment };
}

/** 自动沉淀固定场景资产的上限（手动新增不受此限制） */
export const AUTO_SCENE_ASSET_LIMIT = 8;

const VAGUE_LOCATION_PATTERN = /^(?:家|这里|那边|外面|路上|附近|城市|某处|街头|街上|市中心|室外|室内)$/;
const EXPLICIT_ROOM_TOKENS = ['卧室', '房间', '书房', '书桌', '客厅', '阳台', '宿舍', '工作室', '画室', '琴房', '厨房'];
const EXPLICIT_LOCATION_TOKENS = ['咖啡馆', '咖啡店', '奶茶店', '海边', '沙滩', '天台', '公园', '图书馆', '健身房', '餐厅', '书店', '花店', '美术馆', '电影院'];
const EXPLICIT_ENV_TOKENS = ['工位', '电脑桌'];

/**
 * 从照片描写或朋友圈定位中识别可固定为「常去场景/房间」的候选信息；
 * 无明确地点词的纯人像自拍返回 null，避免乱建。
 */
export function detectSceneCandidateFromPhoto(params: {
  caption?: string;
  location?: string;
}): { name: string; category: SceneAssetCategory } | null {
  const cleanLoc = cleanAppearanceText(params.location || '');
  if (
    cleanLoc.length >= 2 &&
    cleanLoc.length <= 20 &&
    !VAGUE_LOCATION_PATTERN.test(cleanLoc)
  ) {
    const category: SceneAssetCategory = EXPLICIT_ROOM_TOKENS.some((t) => cleanLoc.includes(t))
      ? 'room'
      : EXPLICIT_ENV_TOKENS.some((t) => cleanLoc.includes(t))
        ? 'environment'
        : 'location';
    return { name: cleanLoc, category };
  }

  const cleanCap = cleanAppearanceText(params.caption || '');
  if (!cleanCap) return null;

  for (const token of EXPLICIT_LOCATION_TOKENS) {
    if (cleanCap.includes(token)) {
      return { name: token, category: 'location' };
    }
  }
  for (const token of EXPLICIT_ROOM_TOKENS) {
    if (cleanCap.includes(token)) {
      return { name: `我的${token}`, category: 'room' };
    }
  }
  for (const token of EXPLICIT_ENV_TOKENS) {
    if (cleanCap.includes(token)) {
      return { name: token, category: 'environment' };
    }
  }
  return null;
}

/**
 * 拍到明确地点或房间后自动沉淀进固定场景资产库（同类只留 1 张，不重复生成）。
 */
export async function autoCaptureSceneAssetFromPhoto(params: {
  slug: string;
  imageUrl?: string;
  caption?: string;
  location?: string;
}): Promise<SceneAsset | null> {
  const url = (params.imageUrl || '').trim();
  if (!url || url.startsWith('data:image/svg')) return null;

  const candidate = detectSceneCandidateFromPhoto({
    caption: params.caption,
    location: params.location,
  });
  if (!candidate) return null;

  const existing = await storageRepo.getSceneAssets(params.slug);
  if (existing.length >= AUTO_SCENE_ASSET_LIMIT) return null;

  const norm = (s: string) => s.trim().toLowerCase().replace(/^我的/, '');
  const targetNorm = norm(candidate.name);
  if (
    existing.some(
      (a) =>
        norm(a.name) === targetNorm ||
        (targetNorm.length >= 2 && norm(a.name).includes(targetNorm)) ||
        (norm(a.name).length >= 2 && targetNorm.includes(norm(a.name)))
    )
  ) {
    return null;
  }

  const matchProbe = [candidate.name, params.location || '', params.caption || '']
    .filter(Boolean)
    .join(' ');
  if (matchSceneAssetForCaption(existing, matchProbe)) {
    return null;
  }

  const created = await createSceneAssetFromExisting(params.slug, {
    name: candidate.name,
    category: candidate.category,
    imageUrl: url,
    description: params.caption || params.location,
  });
  return created.asset;
}
