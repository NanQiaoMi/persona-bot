import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addUserMomentCommentAndReply,
  CHAT_MOMENT_COOLDOWN_MS,
  ensureInitialMoments,
  generateNewMomentPost,
  maybeAutoPublishMoment,
  shouldAutoPublishMoment,
  toggleMomentLike,
  VISIT_MOMENT_COOLDOWN_MS,
} from '@/lib/persona/moments';
import { GET as getMomentsRoute, POST as postMomentsRoute } from '@/app/api/personas/[slug]/moments/route';
import { storageRepo } from '@/lib/storage/repository';
import { PersonaRecord } from '@/lib/storage/types';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+1N8AAAAASUVORK5CYII=';

function makePersona(slug: string): PersonaRecord {
  const now = new Date().toISOString();
  return {
    slug,
    name: '苏打测试',
    version: 'v2.0',
    isPreset: false,
    defaultMode: 'fun',
    intimacy: 70,
    profile: {
      mbti: 'ENFP',
      personalityTags: ['爱旅行', '拍照控'],
      appearanceAnchor: '20岁出头黑长直女孩，浅色针织衫，自然日常光影',
    },
    emotionState: {
      primary: 'happy',
      pleasure: 0.4,
      arousal: 0.5,
      dominance: 0.2,
      intensity: 0.5,
      moodLabel: '元气满满',
      lastUpdated: now,
      decayRate: 0.1,
    },
    personaMd: '# 性格\n爱分享旅行和街角风景的活力朋友。',
    memoriesMd: '# 记忆\n- 喜欢日落和冰美式',
    aiProfileMd: '# 档案',
    corrections: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('WeChat-style Moments Backend & API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('seeds initial moments once and persists to moments.json without duplicating', async () => {
    const slug = `moments-seed-${Date.now()}`;
    const persona = makePersona(slug);
    await storageRepo.savePersona(persona);

    try {
      const first = await ensureInitialMoments(persona);
      expect(first.length).toBe(3);
      expect(first[0].images.length).toBeGreaterThan(0);

      const second = await ensureInitialMoments(persona);
      expect(second.map((p) => p.id)).toEqual(first.map((p) => p.id));
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });

  it('toggles user like and persists updated likes list', async () => {
    const slug = `moments-like-${Date.now()}`;
    const persona = makePersona(slug);
    await storageRepo.savePersona(persona);

    try {
      const seeded = await ensureInitialMoments(persona);
      const targetId = seeded[0].id;
      expect(seeded[0].likedByUser).toBe(false);

      const liked = await toggleMomentLike(slug, targetId);
      expect(liked[0].likedByUser).toBe(true);
      expect(liked[0].likes[0]).toBe('我');

      const unliked = await toggleMomentLike(slug, targetId);
      expect(unliked[0].likedByUser).toBe(false);
      expect(unliked[0].likes).not.toContain('我');
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });

  it('adds user comment and generates persona-styled auto reply', async () => {
    const slug = `moments-comment-${Date.now()}`;
    const persona = makePersona(slug);
    await storageRepo.savePersona(persona);

    try {
      const seeded = await ensureInitialMoments(persona);
      const targetId = seeded[0].id;

      const res = await addUserMomentCommentAndReply(
        slug,
        targetId,
        '这张风景太好看了，下次带我一起去！'
      );

      expect(res.replyComment).toBeTruthy();
      expect(res.replyComment?.isUser).toBe(false);
      expect(res.replyComment?.replyToName).toBe('我');

      const post = res.posts.find((p) => p.id === targetId);
      expect(post?.comments.some((c) => c.isUser && c.content.includes('带我一起去'))).toBe(true);
      expect(post?.comments.some((c) => !c.isUser && c.id === res.replyComment?.id)).toBe(true);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });

  it('generates a new moment post with real image generation and handles GET/POST route', async () => {
    const slug = `moments-gen-${Date.now()}`;
    const persona = makePersona(slug);
    await storageRepo.savePersona(persona);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    try {
      const getRes = await getMomentsRoute(
        new Request(`http://localhost:3000/api/personas/${slug}/moments`),
        { params: Promise.resolve({ slug }) }
      );
      const getData = await getRes.json();
      expect(getData.success).toBe(true);
      expect(getData.posts.length).toBe(3);

      const genRes = await generateNewMomentPost(slug, { topic: 'travel' });
      expect(genRes.post.topic).toBe('travel');
      expect(genRes.post.images[0]).toMatch(/^\/api\/media\/photo_.*\.png$/);
      expect(genRes.posts.length).toBe(4);

      const postRes = await postMomentsRoute(
        new Request(`http://localhost:3000/api/personas/${slug}/moments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'toggle_like',
            postId: genRes.post.id,
          }),
        }),
        { params: Promise.resolve({ slug }) }
      );
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      expect(postData.posts[0].likedByUser).toBe(true);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });

  it('evaluates visit and chat cooldown rules accurately in shouldAutoPublishMoment', () => {
    const now = Date.now();
    const seedOnly = [
      {
        id: 'mom_test_seed_1',
        authorSlug: 'test',
        authorName: '测试',
        content: 'seed',
        images: [],
        likedByUser: false,
        likes: [],
        comments: [],
        createdAt: new Date(now - 60_000).toISOString(),
      },
    ];

    expect(
      shouldAutoPublishMoment({
        posts: seedOnly,
        recentUserMessages: [],
        trigger: 'visit',
        nowMs: now,
      }).due
    ).toBe(true);

    const recentAuto = [
      {
        id: 'mom_auto_1',
        authorSlug: 'test',
        authorName: '测试',
        content: 'fresh post',
        images: [],
        likedByUser: false,
        likes: [],
        comments: [],
        createdAt: new Date(now - 5 * 60_000).toISOString(),
      },
      ...seedOnly,
    ];

    expect(
      shouldAutoPublishMoment({
        posts: recentAuto,
        recentUserMessages: ['去旅游拍了日落'],
        trigger: 'chat',
        nowMs: now,
      }).due
    ).toBe(false);

    expect(
      shouldAutoPublishMoment({
        posts: recentAuto,
        recentUserMessages: [],
        trigger: 'visit',
        nowMs: now,
      }).due
    ).toBe(false);

    expect(
      shouldAutoPublishMoment({
        posts: recentAuto,
        recentUserMessages: ['一起去吃火锅呀'],
        trigger: 'chat',
        nowMs: now + CHAT_MOMENT_COOLDOWN_MS + 1000,
      }).due
    ).toBe(true);

    expect(
      shouldAutoPublishMoment({
        posts: recentAuto,
        recentUserMessages: [],
        trigger: 'visit',
        nowMs: now + VISIT_MOMENT_COOLDOWN_MS + 1000,
      }).due
    ).toBe(true);
  });

  it('maybeAutoPublishMoment autonomously generates and persists a post then respects cooldown', async () => {
    const slug = `moments-auto-${Date.now()}`;
    const persona = makePersona(slug);
    await storageRepo.savePersona(persona);
    await storageRepo.saveConversation(slug, [
      {
        id: 'u1',
        role: 'user',
        content: '今晚一起打游戏然后去吃夜宵吧',
        timestamp: new Date().toISOString(),
      },
    ]);

    // 模型不可用时自动发布这次不发（不再塞千篇一律的离线文案）
    expect(await maybeAutoPublishMoment(slug, 'chat')).toBe(false);

    // 只在本测试进程里模拟「配置了模型」：对话接口返回一条新动态，生图接口返回图片
    const realSettings = await storageRepo.getSettings();
    vi.spyOn(storageRepo, 'getSettings').mockResolvedValue({
      ...realSettings,
      llmApiKey: 'sk-test-moments',
      llmBaseUrl: 'http://127.0.0.1:9/v1',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const body = String(url).includes('/chat/completions')
          ? {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      content: '打完游戏去吃了碗馄饨，凌晨的小摊最有烟火气',
                      location: '巷口小摊',
                      mood: '满足',
                      topic: 'food',
                      includePersonaFace: false,
                      imagePrompt: '深夜街边小摊上的一碗热馄饨',
                    }),
                  },
                },
              ],
            }
          : { data: [{ b64_json: TINY_PNG_B64 }] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );

    try {
      const firstPublished = await maybeAutoPublishMoment(slug, 'chat');
      expect(firstPublished).toBe(true);

      const posts = await storageRepo.getMoments(slug);
      expect(posts.length).toBe(4);
      expect(posts[0].id).not.toContain('_seed_');

      // Immediate second call must be blocked by cooldown
      const secondPublished = await maybeAutoPublishMoment(slug, 'chat');
      expect(secondPublished).toBe(false);
    } finally {
      await storageRepo.deletePersona(slug);
    }
  });
});
