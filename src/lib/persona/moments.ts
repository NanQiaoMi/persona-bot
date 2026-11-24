import {
  generatePersonaMedia,
  LOCAL_GATEWAY_BASE_URL,
} from '@/lib/grok/image-generator';
import {
  chatCompletion,
  parseJsonFromLlmOutput,
  resolveLlmConfig,
} from '@/lib/llm/client';
import { matchSceneAssetForCaption } from '@/lib/persona/scene-assets';
import { storageRepo } from '@/lib/storage/repository';
import {
  MomentComment,
  MomentPost,
  MomentTopic,
  PersonaRecord,
  PersonaSummary,
} from '@/lib/storage/types';

function createScenicCardDataUrl(params: {
  title: string;
  subtitle: string;
  gradientFrom: string;
  gradientTo: string;
  accent: string;
}): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${params.gradientFrom}" />
      <stop offset="100%" stop-color="${params.gradientTo}" />
    </linearGradient>
    <radialGradient id="glow" cx="72%" cy="28%" r="48%">
      <stop offset="0%" stop-color="${params.accent}" stop-opacity="0.55" />
      <stop offset="100%" stop-color="${params.accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)" />
  <rect width="800" height="600" fill="url(#glow)" />
  <path d="M0 440 Q 210 355 410 420 T 800 390 L 800 600 L 0 600 Z" fill="rgba(0,0,0,0.22)" />
  <path d="M0 495 Q 260 440 520 490 T 800 465 L 800 600 L 0 600 Z" fill="rgba(0,0,0,0.34)" />
  <circle cx="595" cy="165" r="56" fill="rgba(255,255,255,0.22)" />
  <text x="52" y="510" fill="rgba(255,255,255,0.94)" font-family="-apple-system,PingFang SC,sans-serif" font-size="34" font-weight="600">${esc(params.title)}</text>
  <text x="52" y="550" fill="rgba(255,255,255,0.72)" font-family="-apple-system,PingFang SC,sans-serif" font-size="20">${esc(params.subtitle)}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pickPeerNames(
  selfSlug: string,
  peers: PersonaSummary[],
  count: number
): PersonaSummary[] {
  const candidates = peers.filter(
    (p) => p.slug !== selfSlug && !p.isMaster
  );
  if (candidates.length === 0) return [];
  const shifted = [...candidates];
  let hash = 0;
  for (let i = 0; i < selfSlug.length; i++) {
    hash = (hash * 31 + selfSlug.charCodeAt(i)) >>> 0;
  }
  const start = hash % shifted.length;
  const picked: PersonaSummary[] = [];
  for (let i = 0; i < Math.min(count, shifted.length); i++) {
    picked.push(shifted[(start + i) % shifted.length]);
  }
  return picked;
}

function buildSeededMoments(
  persona: PersonaRecord,
  peers: PersonaSummary[]
): MomentPost[] {
  const now = Date.now();
  const peerPair = pickPeerNames(persona.slug, peers, 2);
  const peer1 = peerPair[0];
  const peer2 = peerPair[1];

  const isCool = /Zero|陆凛|沈清|极客|冷静/.test(
    `${persona.name} ${persona.profile.personalityTags.join(' ')}`
  );
  const isSoft = /林晚|苏念|温柔|插画|文艺/.test(
    `${persona.name} ${persona.profile.personalityTags.join(' ')}`
  );

  if (isCool) {
    return [
      {
        id: `mom_${persona.slug}_seed_1`,
        authorSlug: persona.slug,
        authorName: persona.name,
        content: '临时起意开车上山看日落，风有点大但云层裂开那几秒还挺值。',
        images: [
          createScenicCardDataUrl({
            title: '山顶日落余晖',
            subtitle: '盘山公路 · 17:48',
            gradientFrom: '#1f2937',
            gradientTo: '#7c2d12',
            accent: '#fb923c',
          }),
        ],
        imageCaptions: ['山顶暮色与橙红晚霞'],
        location: '西山盘山观景台',
        mood: '吹风放空',
        topic: 'scenery',
        likedByUser: false,
        likes: peer1 ? [peer1.name] : [],
        comments: peer1
          ? [
              {
                id: `mc_${now}_p1`,
                authorName: peer1.name,
                authorSlug: peer1.slug,
                isUser: false,
                content: '这光影可以啊，居然没带电脑上山？',
                createdAt: new Date(now - 90 * 60 * 1000).toISOString(),
              },
            ]
          : [],
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: `mom_${persona.slug}_seed_2`,
        authorSlug: persona.slug,
        authorName: persona.name,
        content: '巷口新开的冰美式居然不酸，顺手拍了张窗边光影，今天效率 +20%。',
        images: [
          createScenicCardDataUrl({
            title: '街角冰美式与午后窗影',
            subtitle: '日常随拍 · 晴',
            gradientFrom: '#0f172a',
            gradientTo: '#334155',
            accent: '#38bdf8',
          }),
        ],
        imageCaptions: ['窗边木桌与冰美式'],
        location: '安福路转角咖啡',
        mood: '清醒在线',
        topic: 'daily',
        likedByUser: false,
        likes: peer2 ? [peer2.name] : [],
        comments: [],
        createdAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: `mom_${persona.slug}_seed_3`,
        authorSlug: persona.slug,
        authorName: persona.name,
        content: '上次去海边顺手抓拍的蓝调时刻，手机直出没修图，留这儿存档。',
        images: [
          createScenicCardDataUrl({
            title: '蓝调海岸线',
            subtitle: '短途旅行存档',
            gradientFrom: '#0c4a6e',
            gradientTo: '#1e1b4b',
            accent: '#60a5fa',
          }),
        ],
        imageCaptions: ['深蓝海浪与天际微光'],
        location: '东海岸防波堤',
        mood: '安静蓄电',
        topic: 'travel',
        likedByUser: false,
        likes: [],
        comments: [],
        createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  }

  if (isSoft) {
    return [
      {
        id: `mom_${persona.slug}_seed_1`,
        authorSlug: persona.slug,
        authorName: persona.name,
        content: '傍晚沿着河边走了三站路，路灯亮起来的时候水面像撒了碎金子一样。',
        images: [
          createScenicCardDataUrl({
            title: '河畔碎金夜色',
            subtitle: '晚风散步 · 19:20',
            gradientFrom: '#312e81',
            gradientTo: '#831843',
            accent: '#f472b6',
          }),
        ],
        imageCaptions: ['傍晚河畔与温柔路灯倒影'],
        location: '南滨路步行道',
        mood: '微风轻软',
        topic: 'scenery',
        likedByUser: false,
        likes: peer1 ? [peer1.name] : [],
        comments: peer1
          ? [
              {
                id: `mc_${now}_p1`,
                authorName: peer1.name,
                authorSlug: peer1.slug,
                isUser: false,
                content: '这色调好治愈，走完记得早点回家呀～',
                createdAt: new Date(now - 75 * 60 * 1000).toISOString(),
              },
            ]
          : [],
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: `mom_${persona.slug}_seed_2`,
        authorSlug: persona.slug,
        authorName: persona.name,
        content: '去古镇写生躲了场小雨，屋檐滴水的声音比白噪音还好听。',
        images: [
          createScenicCardDataUrl({
            title: '青石板与屋檐听雨',
            subtitle: '短途出走日记',
            gradientFrom: '#134e4a',
            gradientTo: '#1e293b',
            accent: '#2dd4bf',
          }),
        ],
        imageCaptions: ['烟雨江南青瓦屋檐'],
        location: '乌镇西栅小巷',
        mood: '偷得半日闲',
        topic: 'travel',
        likedByUser: false,
        likes: peer2 ? [peer2.name] : [],
        comments: [],
        createdAt: new Date(now - 28 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: `mom_${persona.slug}_seed_3`,
        authorSlug: persona.slug,
        authorName: persona.name,
        content: '买到一束刚开一点点的小洋桔梗，摆在窗台感觉整个屋子都亮了。',
        images: [
          createScenicCardDataUrl({
            title: '窗台阳光与洋桔梗',
            subtitle: '小确幸备忘',
            gradientFrom: '#701a75',
            gradientTo: '#9a3412',
            accent: '#fde047',
          }),
        ],
        imageCaptions: ['午后窗台淡紫花束'],
        location: '家里阳台',
        mood: '心情很好',
        topic: 'daily',
        likedByUser: false,
        likes: [],
        comments: [],
        createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  }

  return [
    {
      id: `mom_${persona.slug}_seed_1`,
      authorSlug: persona.slug,
      authorName: persona.name,
      content: '今天天气好到犯规，说走就走跑到海边吹风，手机随便一拍都是壁纸级别！',
      images: [
        createScenicCardDataUrl({
          title: '晴空海滨栈道',
          subtitle: '说走就走的小旅行',
          gradientFrom: '#0369a1',
          gradientTo: '#0f766e',
          accent: '#fde047',
        }),
      ],
      imageCaptions: ['晴朗海滨步道与海风'],
      location: '环海木栈道',
      mood: '元气满格',
      topic: 'travel',
      likedByUser: false,
      likes: peerPair.map((p) => p.name),
      comments: peer1
        ? [
            {
              id: `mc_${now}_p1`,
              authorName: peer1.name,
              authorSlug: peer1.slug,
              isUser: false,
              content: '哇出去玩也不喊我一声，下次记得带伴手礼！',
              createdAt: new Date(now - 50 * 60 * 1000).toISOString(),
            },
          ]
        : [],
      createdAt: new Date(now - 95 * 60 * 1000).toISOString(),
    },
    {
      id: `mom_${persona.slug}_seed_2`,
      authorSlug: persona.slug,
      authorName: persona.name,
      content: '半夜找着一家宝藏小面馆，老板给加了一大勺秘制辣油，香迷糊了～',
      images: [
        createScenicCardDataUrl({
          title: '深夜烟火气小面馆',
          subtitle: '夜宵打卡',
          gradientFrom: '#7f1d1d',
          gradientTo: '#78350f',
          accent: '#fb923c',
        }),
      ],
      imageCaptions: ['热气腾腾的深夜小面'],
      location: '老街夜市口',
      mood: '碳水快乐',
      topic: 'food',
      likedByUser: false,
      likes: peer2 ? [peer2.name] : [],
      comments: [],
      createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: `mom_${persona.slug}_seed_3`,
      authorSlug: persona.slug,
      authorName: persona.name,
      content: '加班回家抬头看到一大片粉紫色晚霞，瞬间原谅今天所有的烦心事。',
      images: [
        createScenicCardDataUrl({
          title: '粉紫城市晚霞',
          subtitle: '下班路上的惊喜',
          gradientFrom: '#4c1d95',
          gradientTo: '#be185d',
          accent: '#fbcfe8',
        }),
      ],
      imageCaptions: ['城市楼宇间的粉紫晚霞'],
      location: '回家的天桥上',
      mood: '被治愈了',
      topic: 'scenery',
      likedByUser: false,
      likes: [],
      comments: [],
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export async function ensureInitialMoments(
  persona: PersonaRecord,
  peerPersonas?: PersonaSummary[]
): Promise<MomentPost[]> {
  const existing = await storageRepo.getMoments(persona.slug);
  if (existing.length > 0) return existing;

  const peers = peerPersonas || (await storageRepo.listPersonas());
  const seeded = buildSeededMoments(persona, peers);
  return storageRepo.updateMoments(persona.slug, (current) =>
    current.length > 0 ? current : seeded
  );
}

const OFFLINE_MOMENT_TEMPLATES: Array<{
  topic: MomentTopic;
  content: string;
  location: string;
  mood: string;
  imagePrompt: string;
  includePersonaFace: boolean;
}> = [
  {
    topic: 'travel',
    content: '临时订了张车票来邻市逛老街，太阳落下来前在城墙边吹了半小时风，心情超舒畅。',
    location: '古城南门城墙',
    mood: '惬意放风',
    imagePrompt: '金色夕阳照在古城青砖城墙与石板街上，微风吹拂的真实旅行摄影',
    includePersonaFace: false,
  },
  {
    topic: 'scenery',
    content: '刚下完小雨的天空干净得像洗过一样，云缝里透出一点橘子汽水色的光。',
    location: '河滨公园',
    mood: '晴朗上线',
    imagePrompt: '雨后初晴的城市河滨公园，橘粉色晚霞倒映在微湿路面上的真实手机随手拍',
    includePersonaFace: false,
  },
  {
    topic: 'selfie',
    content: '换了个新状态出门晒太阳，今天光线特别好，随手抓拍一张交作业～',
    location: '街头转角阳光下',
    mood: '今日份好心情',
    imagePrompt: '在温暖午后街头阳光下的自然半身自拍随手拍，微笑看镜头，胶片清透质感',
    includePersonaFace: true,
  },
  {
    topic: 'food',
    content: '被路边刚出炉的焦糖布丁拿铁香到走不动路，快乐有时候真的只要这一杯。',
    location: '梧桐树下咖啡馆',
    mood: '甜度刚好',
    imagePrompt: '木质小桌上摆着拉花拿铁和焦糖甜点，旁边有斑驳梧桐树影的真实生活照',
    includePersonaFace: false,
  },
];

export async function generateNewMomentPost(
  slug: string,
  options?: { topic?: MomentTopic; hint?: string }
): Promise<{ post: MomentPost; posts: MomentPost[] }> {
  const [persona, allPersonas, settings, recentMsgs, sceneAssets] = await Promise.all([
    storageRepo.getPersona(slug),
    storageRepo.listPersonas(),
    storageRepo.getSettings(),
    storageRepo.getConversation(slug, 8),
    storageRepo.getSceneAssets(slug),
  ]);

  if (!persona) {
    throw new Error('Persona not found');
  }

  const llm = resolveLlmConfig(settings);
  const topicFilter = options?.topic;
  const fallbackPool = topicFilter
    ? OFFLINE_MOMENT_TEMPLATES.filter((t) => t.topic === topicFilter)
    : OFFLINE_MOMENT_TEMPLATES;
  const fallbackPick =
    fallbackPool[Math.floor(Date.now() / 1000) % fallbackPool.length] ||
    OFFLINE_MOMENT_TEMPLATES[0];

  let draft = {
    content: fallbackPick.content,
    location: fallbackPick.location,
    mood: fallbackPick.mood,
    topic: fallbackPick.topic as MomentTopic,
    imagePrompt: fallbackPick.imagePrompt,
    includePersonaFace: fallbackPick.includePersonaFace,
  };

  if (llm.canCall) {
    try {
      const hour = new Date().getHours();
      const timeLabel =
        hour < 6 ? '深夜凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上';
      const recentChat = recentMsgs
        .slice(-4)
        .map((m) => `${m.role === 'user' ? '对方' : persona.name}: ${m.content}`)
        .join('\n');

      const prompt = `请你以「${persona.name}」的本人视角，发一条像真人在微信朋友圈发的生活图文动态。
当前时段：${timeLabel}
性格标签：${persona.profile.personalityTags.join('、') || '自然随性'}
${topicFilter ? `希望的主题类型：${topicFilter}（travel旅行/scenery风景/food美食/selfie个人生活照/daily日常/night夜色）` : '主题类型：从旅行风景、日常随手拍、美食、城市夜景或生活照中自然挑一个'}
${options?.hint ? `额外提示：${options.hint}` : ''}
近期记忆参考：${persona.memoriesMd.slice(-300)}
最近聊天语境：${recentChat || '暂无'}

只输出严格 JSON：
{
  "content": "朋友圈配文（18~75字，像真人发朋友圈一样自然松弛，不要AI腔和鸡汤，最多0~1个克制emoji）",
  "location": "简短真实感定位（如'京都 · 鸭川边'或'街角咖啡店'，可留空）",
  "mood": "4字内心情标签",
  "topic": "travel|scenery|food|selfie|daily|night",
  "includePersonaFace": true或false（如果是本人出镜自拍/旅行人像设为true，纯风景/美食设为false）,
  "imagePrompt": "用于文生图的中文画面描写（20~50字，具体光线、构图、物品或穿搭，绝不带水印文字）"
}`;

      const raw = await chatCompletion(
        llm,
        [
          {
            role: 'system',
            content: `${persona.personaMd.slice(0, 1200)}\n你正在发自己的微信朋友圈，只输出合法 JSON。`,
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.85, timeoutMs: 25000 }
      );
      const parsed = parseJsonFromLlmOutput<Partial<typeof draft>>(raw);
      if (parsed && typeof parsed.content === 'string' && parsed.content.trim()) {
        draft = {
          content: parsed.content.trim().slice(0, 220),
          location: typeof parsed.location === 'string' ? parsed.location.trim().slice(0, 30) : '',
          mood: typeof parsed.mood === 'string' ? parsed.mood.trim().slice(0, 16) : '',
          topic:
            parsed.topic &&
            ['travel', 'scenery', 'food', 'selfie', 'daily', 'night'].includes(
              parsed.topic
            )
              ? parsed.topic
              : draft.topic,
          imagePrompt:
            typeof parsed.imagePrompt === 'string' && parsed.imagePrompt.trim()
              ? parsed.imagePrompt.trim()
              : parsed.content.trim(),
          includePersonaFace: Boolean(parsed.includePersonaFace),
        };
      }
    } catch {
      // Fallback cleanly to deterministic template
    }
  }

  const baseUrl = (
    settings.llmBaseUrl ||
    process.env.LLM_BASE_URL ||
    LOCAL_GATEWAY_BASE_URL
  ).replace(/\/$/, '');
  const apiKey = settings.llmApiKey || process.env.LLM_API_KEY || '';
  const imageModel =
    settings.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2.6';

  const matchedScene = matchSceneAssetForCaption(
    sceneAssets,
    `${draft.imagePrompt} ${draft.location} ${draft.content}`
  );
  const effectiveRefUrl = draft.includePersonaFace
    ? persona.profile.referenceImageUrl
    : matchedScene?.isPureEnvironment
      ? matchedScene.asset.imageUrl
      : undefined;

  let imageUrl: string | undefined;
  try {
    const mediaRes = await generatePersonaMedia({
      kind: 'photo',
      caption: draft.imagePrompt,
      personaName: persona.name,
      personaStyle: persona.profile.personalityTags.slice(0, 3).join(', '),
      appearanceAnchor: draft.includePersonaFace
        ? persona.profile.appearanceAnchor
        : undefined,
      sceneAnchor: matchedScene?.asset.description,
      referenceImageUrl: effectiveRefUrl,
      baseUrl,
      apiKey,
      imageModel,
    });
    if (mediaRes.imageUrl) {
      imageUrl = mediaRes.imageUrl;
    }
  } catch {
    // Graceful text-only or scenic card fallback if image gateway fails
  }

  const peers = pickPeerNames(persona.slug, allPersonas, 2);
  const nowIso = new Date().toISOString();
  const peerLikes = peers.slice(0, 2).map((p) => p.name);
  const peerComments: MomentComment[] =
    peers[0]
      ? [
          {
            id: `mc_${Date.now()}_peer`,
            authorName: peers[0].name,
            authorSlug: peers[0].slug,
            isUser: false,
            content:
              draft.topic === 'food'
                ? '看着就香，下次记得留我一口！'
                : draft.topic === 'travel' || draft.topic === 'scenery'
                  ? '这风景不错啊，随手一拍都挺出片'
                  : '状态不错嘛，难得看你发动态～',
            createdAt: nowIso,
          },
        ]
      : [];

  const post: MomentPost = {
    id: `mom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    authorSlug: persona.slug,
    authorName: persona.name,
    content: draft.content,
    images: imageUrl
      ? [imageUrl]
      : [
          createScenicCardDataUrl({
            title: draft.location || draft.mood || `${persona.name} 的日常`,
            subtitle: draft.content.slice(0, 22),
            gradientFrom: '#1e293b',
            gradientTo: '#0f766e',
            accent: '#5eead4',
          }),
        ],
    imageCaptions: [draft.imagePrompt],
    location: draft.location || undefined,
    mood: draft.mood || undefined,
    topic: draft.topic,
    likedByUser: false,
    likes: peerLikes,
    comments: peerComments,
    createdAt: nowIso,
  };

  const posts = await storageRepo.updateMoments(slug, (current) => [
    post,
    ...current,
  ]);
  return { post, posts };
}

export async function toggleMomentLike(
  slug: string,
  postId: string
): Promise<MomentPost[]> {
  return storageRepo.updateMoments(slug, (current) =>
    current.map((post) => {
      if (post.id !== postId) return post;
      const nextLiked = !post.likedByUser;
      const withoutMe = post.likes.filter((n) => n !== '我');
      return {
        ...post,
        likedByUser: nextLiked,
        likes: nextLiked ? ['我', ...withoutMe] : withoutMe,
      };
    })
  );
}

export async function addUserMomentCommentAndReply(
  slug: string,
  postId: string,
  content: string
): Promise<{ posts: MomentPost[]; replyComment?: MomentComment }> {
  const clean = content.trim();
  if (!clean) {
    throw new Error('Comment content cannot be empty');
  }

  const userComment: MomentComment = {
    id: `mc_${Date.now()}_u`,
    authorName: '我',
    authorSlug: 'user',
    isUser: true,
    content: clean,
    createdAt: new Date().toISOString(),
  };

  let targetPost: MomentPost | undefined;
  await storageRepo.updateMoments(slug, (current) =>
    current.map((post) => {
      if (post.id !== postId) return post;
      const updated = {
        ...post,
        comments: [...post.comments, userComment],
      };
      targetPost = updated;
      return updated;
    })
  );

  const [persona, settings] = await Promise.all([
    storageRepo.getPersona(slug),
    storageRepo.getSettings(),
  ]);
  if (!persona || !targetPost) {
    const posts = await storageRepo.getMoments(slug);
    return { posts };
  }

  let replyText = '';
  const llm = resolveLlmConfig(settings);
  if (llm.canCall) {
    try {
      const raw = await chatCompletion(
        llm,
        [
          {
            role: 'system',
            content: `${persona.personaMd.slice(0, 1400)}\n你是「${persona.name}」，正在自己的微信朋友圈评论区回复对方留言。只输出 1 句 6~40 字自然口语回复，不要加引号和名字前缀，不要 AI 客套。`,
          },
          {
            role: 'user',
            content: `你发的朋友圈：「${targetPost.content}」\n对方的评论：「${clean}」\n请以本人性格简短自然回复对方：`,
          },
        ],
        { temperature: 0.85, timeoutMs: 20000 }
      );
      replyText = raw.replace(/^["'「]|["'」]$/g, '').trim().slice(0, 120);
    } catch {
      // Fallback cleanly below
    }
  }

  if (!replyText) {
    const isTease = /哈哈|笑|好看|漂亮|帅|带我|请客|厉害/.test(clean);
    if (persona.slug === 'lin-wan') {
      replyText = isTease
        ? '少贫嘴了，就你会挑好听的说'
        : '嗯哼，下次有空一起去呀';
    } else if (/Zero|陆凛/.test(persona.name)) {
      replyText = isTease
        ? '那必须的，下回顺路带你一起'
        : '收到，等有空再细聊';
    } else {
      replyText = isTease
        ? '哈哈哈懂我！下回喊上你一起～'
        : '就知道你会注意到这个，等你来找我玩呀';
    }
  }

  const replyComment: MomentComment = {
    id: `mc_${Date.now()}_bot`,
    authorName: persona.name,
    authorSlug: persona.slug,
    isUser: false,
    replyToName: '我',
    content: replyText,
    createdAt: new Date().toISOString(),
  };

  const finalPosts = await storageRepo.updateMoments(slug, (current) =>
    current.map((post) =>
      post.id === postId
        ? { ...post, comments: [...post.comments, replyComment] }
        : post
    )
  );

  return { posts: finalPosts, replyComment };
}
