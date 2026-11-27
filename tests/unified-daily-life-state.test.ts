import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDailyLifeDirective,
  getOrInitDailyLife,
  localDayKey,
  recordMomentInDailyLife,
} from '@/lib/persona/daily-life';
import { getPresenceState } from '@/lib/persona/daily-rhythm';
import { canAutoPublishMomentNow, maybeAutoPublishMoment } from '@/lib/persona/moments';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { buildGroupSystemDirective, buildPeerRelationsDirective } from '@/lib/group/director';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { storageRepo } from '@/lib/storage/repository';
import type { MomentPost, PersonaRecord } from '@/lib/storage/types';

const createdSlugs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const slug of createdSlugs) {
    await storageRepo.deletePersona(slug);
  }
});

describe('4 位内置角色专属作息修复与自定义覆盖', () => {
  it('4 位子角色工作/空闲时间不再出现画稿/开选题会等错配词，且活动彼此区分', () => {
    const subs = BUILTIN_PRESETS.filter((p) => !p.isMaster);
    const afternoon = new Date(2026, 10, 27, 15, 30);
    const evening = new Date(2026, 10, 27, 20, 30);

    const activities = subs.map((p) => ({
      slug: p.slug,
      afternoon: getPresenceState(p, afternoon).activity,
      evening: getPresenceState(p, evening).activity,
      label: getPresenceState(p, afternoon).archetypeLabel,
    }));

    for (const item of activities) {
      expect(item.afternoon).not.toMatch(/画稿|改稿|开选题会|画材店/);
      expect(item.evening).not.toMatch(/画稿|改稿|开选题会|画材店/);
    }
    expect(new Set(activities.map((a) => a.label)).size).toBe(4);
  });

  it('自定义角色 spec.dailyRhythmOverride 可覆盖默认作息词表', () => {
    const custom = {
      slug: 'custom-baker',
      profile: { occupation: '普通上班族' },
      spec: {
        dailyRhythmOverride: {
          archetype: 'service' as const,
          label: '社区烘焙师',
          busyActivities: ['揉可颂面团中'],
          freeActivities: ['闻着黄油香喝美式'],
        },
      },
    };
    const busyState = getPresenceState(custom, new Date(2026, 10, 27, 9, 30));
    expect(busyState.archetypeLabel).toBe('社区烘焙师');
    expect(busyState.activity).toBe('揉可颂面团中');
  });
});

describe('统一今日生活与心境板 (DailyLifeState)', () => {
  it('按日持久化、随朋友圈更新同步并在跨日后重新生成', async () => {
    const slug = `test-daily-life-${Date.now()}`;
    createdSlugs.push(slug);
    const persona: PersonaRecord = {
      ...BUILTIN_PRESETS[1],
      slug,
      isPreset: false,
    };
    await storageRepo.savePersona(persona);

    const day1 = new Date(2026, 10, 27, 14, 0);
    const life1 = await getOrInitDailyLife(persona, day1);
    expect(life1.dateKey).toBe(localDayKey(day1));
    expect(life1.mainEvent.length).toBeGreaterThan(4);

    const post: MomentPost = {
      id: 'mom_test_1',
      authorSlug: slug,
      authorName: persona.name,
      content: '在海边站台等日落，橘色云朵特别好看',
      images: [],
      location: '海边栈道',
      mood: '惬意',
      topic: 'scenery',
      likedByUser: false,
      likes: [],
      comments: [],
      createdAt: day1.toISOString(),
    };
    const updated = await recordMomentInDailyLife(persona, post, day1);
    expect(updated.recentMoments).toHaveLength(1);
    expect(updated.recentMoments[0].content).toContain('海边站台');
    expect(updated.moodTone).toBe('惬意');

    const stored = await storageRepo.getDailyLife(slug);
    expect(stored?.recentMoments[0].id).toBe('mom_test_1');

    const dir = buildDailyLifeDirective(updated);
    expect(dir).toContain('今日生活与心境板');
    expect(dir).toContain('海边站台');

    const prompt = new PromptAssembler().assembleFromRecord(persona, {
      dailyLifeDirective: dir,
    });
    expect(prompt).toContain('今日生活与心境板');

    // Rollover to next day resets dateKey
    const day2 = new Date(2026, 10, 28, 10, 0);
    const life2 = await getOrInitDailyLife(persona, day2);
    expect(life2.dateKey).toBe(localDayKey(day2));
  });
});

describe('朋友圈睡眠与冷战门控', () => {
  it('冷战 >=2 级拦截自动发朋友圈；睡眠时段拦截 visit 与冷掉的 chat，允许 15 分钟内活跃 chat', async () => {
    const slug = `test-moments-gate-${Date.now()}`;
    createdSlugs.push(slug);
    const sulkingPersona: PersonaRecord = {
      ...BUILTIN_PRESETS[2],
      slug,
      isPreset: false,
      emotionState: {
        ...BUILTIN_PRESETS[2].emotionState,
        sulking: {
          level: 2,
          reason: '放鸽子',
          remainingTurns: 2,
          since: new Date().toISOString(),
        },
      },
    };
    await storageRepo.savePersona(sulkingPersona);

    expect(canAutoPublishMomentNow(sulkingPersona, 'visit', [], new Date(2026, 10, 27, 15, 0)).allowed).toBe(false);
    expect(await maybeAutoPublishMoment(slug, 'visit')).toBe(false);

    const calmPersona: PersonaRecord = {
      ...BUILTIN_PRESETS[1],
      slug: `${slug}-calm`,
    };
    const sleepTime = new Date(2026, 10, 27, 5, 0); // creative sleeps 2:30 ~ 10:00
    expect(canAutoPublishMomentNow(calmPersona, 'visit', [], sleepTime).allowed).toBe(false);
    expect(
      canAutoPublishMomentNow(
        calmPersona,
        'chat',
        [{ id: '1', role: 'user', content: '早', timestamp: new Date(2026, 10, 27, 1, 0).toISOString() }],
        sleepTime
      ).allowed
    ).toBe(false);
    expect(
      canAutoPublishMomentNow(
        calmPersona,
        'chat',
        [{ id: '1', role: 'user', content: '睡了吗', timestamp: new Date(2026, 10, 27, 4, 55).toISOString() }],
        sleepTime
      ).allowed
    ).toBe(true);
  });
});

describe('群聊轻量人物关系设定', () => {
  it('只注入当前真正在群里的成员关系', () => {
    const xiaYou = BUILTIN_PRESETS.find((p) => p.slug === 'xia-you')!;
    const hintWithChenYe = buildPeerRelationsDirective(xiaYou, [
      { slug: 'chen-ye', name: '陈野' },
    ]);
    expect(hintWithChenYe).toContain('陈野');
    expect(hintWithChenYe).not.toContain('沈知意');

    const groupDir = buildGroupSystemDirective({
      groupName: '周五夜宵局',
      speakerName: '夏柚',
      otherMemberNames: ['陈野'],
      peerRelationsHint: hintWithChenYe,
    });
    expect(groupDir).toContain('欢喜冤家');
  });
});
