import { NextResponse } from 'next/server';
import { storageRepo } from '@/lib/storage/repository';

/**
 * Persona 创建管线 v3（纯 TS 统一仓储过渡版，PR #2 将接入完整 5 阶段蒸馏引擎）
 */
export async function POST(request: Request) {
  try {
    const { name, basicInfo, personalityInfo } = await request.json();

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `persona-${Date.now()}`;

    const mbtiMatch = personalityInfo?.match?.(/([EI][NS][FT][JP])/i)?.[1]?.toUpperCase();
    const tags: string[] = Array.isArray(personalityInfo?.match?.(/[\u4e00-\u9fa5]{2,4}/g))
      ? personalityInfo.match(/[\u4e00-\u9fa5]{2,4}/g).slice(0, 5)
      : ['拟人', '自定义'];

    const aiProfile = `${trimmedName} 是一个独特的拟人角色。背景：${basicInfo || '由用户自定义创建'}。性格特征：${personalityInfo || '生动真实、有主见'}。`;
    const personaMd = `# ${trimmedName} — Persona\n\n## Layer 0：核心性格与真实性协议 (最高优先级)\n- **真实性协议**：禁止使用任何 AI 客服客套话。\n- **行为准则**：始终用自然口语和对方互动。\n\n## Layer 1：身份\n你是 **${trimmedName}**。${basicInfo || ''}\n\n## Layer 2：表达风格\n自然口语、短句为主，带有鲜明个人性格（${personalityInfo || '真实自然'}）。\n\n## Layer 3：情感逻辑\n根据对方态度和对话节奏真实起伏。\n\n## Layer 4：关系行为\n关注对方情绪与聊天细节。\n\n## Layer 5：边界与雷区\n讨厌敷衍与冰冷说教。\n\n## Correction 记录\n（暂无记录）`;
    const memoriesMd = `# 共同记忆 — ${trimmedName}\n\n## 背景故事\n${basicInfo || '刚刚建立的全新羁绊。'}`;

    const saved = await storageRepo.savePersona({
      slug,
      name: trimmedName,
      version: 'v2.0',
      isPreset: false,
      defaultMode: 'authentic',
      intimacy: 60,
      profile: {
        mbti: mbtiMatch,
        personalityTags: tags,
        avatarEmoji: '✨',
        accentColor: '#10B981',
        bio: basicInfo || personalityInfo || '专属创建角色',
      },
      personaMd,
      memoriesMd,
      aiProfileMd: aiProfile,
      emotionState: {
        primary: 'calm',
        pleasure: 0.2,
        arousal: 0.4,
        dominance: 0.5,
        intensity: 0.5,
        moodLabel: '刚刚上线 ✨',
        lastUpdated: new Date().toISOString(),
        decayRate: 0.1,
      },
      corrections: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      slug: saved.slug,
      stages: {
        aiProfile,
        analysis: '已完成结构化提取',
        persona: personaMd.slice(0, 300) + '...',
        memories: memoriesMd.slice(0, 300) + '...',
      },
      summary: {
        name: saved.name,
        mbti: saved.profile.mbti || '',
        attachment: saved.profile.attachment || '',
        tags: saved.profile.personalityTags,
      },
    });
  } catch (error) {
    console.error('[Pipeline v3] Error:', error);
    const message = error instanceof Error ? error.message : 'Pipeline failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
