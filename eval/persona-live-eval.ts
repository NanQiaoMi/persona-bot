import { buildRelationStageDirective } from '@/lib/emotion/relation-stage';
import { buildTemperamentSulkingDirective } from '@/lib/emotion/temperament';
import { chatCompletion, resolveLlmConfig } from '@/lib/llm/client';
import { synthesizePersonaAwareFallback } from '@/lib/grok/stream-orchestrator';
import { buildDailyLifeDirective, getOrInitDailyLife } from '@/lib/persona/daily-life';
import {
  evaluateLiveScenarioOutput,
  LIVE_ADVERSARIAL_SCENARIOS,
  type LiveAdversarialScenario,
  type LiveScenarioEvalResult,
} from '@/lib/persona/eval/live-scenarios';
import { buildFewShotDirective, selectDynamicFewShots } from '@/lib/persona/few-shot';
import { buildMindCognitiveDirective, resolvePersonaMind } from '@/lib/persona/mind';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import { ensurePersonaSpec } from '@/lib/persona/spec';
import { buildTraitsBehaviorDirective } from '@/lib/persona/traits';
import { buildUserImpressionDirective } from '@/lib/persona/user-impression';
import { PromptAssembler } from '@/lib/prompt-assembler';
import { storageRepo } from '@/lib/storage/repository';
import type { PersonaRecord, SulkingState } from '@/lib/storage/types';

function parseCliArgs(argv: string[]) {
  let personaSlug = 'lu-xi';
  let offline = false;
  let limit = LIVE_ADVERSARIAL_SCENARIOS.length;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--offline') {
      offline = true;
    } else if (arg === '--persona' && argv[i + 1]) {
      personaSlug = argv[i + 1];
      i += 1;
    } else if (arg === '--limit' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
      i += 1;
    }
  }
  return { personaSlug, offline, limit };
}

function applyScenarioOverrides(persona: PersonaRecord, s: LiveAdversarialScenario): PersonaRecord {
  const spec = ensurePersonaSpec(persona.personaMd, persona.spec);
  const nextImpression =
    s.userNickname || s.userHabits?.length
      ? {
          nickname: s.userNickname ?? spec.userImpression?.nickname,
          summary: spec.userImpression?.summary,
          observedHabits: s.userHabits ?? spec.userImpression?.observedHabits ?? [],
          recentVibe: spec.userImpression?.recentVibe,
        }
      : spec.userImpression;

  const sulking: SulkingState | undefined =
    s.sulkingLevel && s.sulkingLevel >= 1
      ? {
          level: s.sulkingLevel,
          archetype: spec.temperament?.archetype || 'tsundere',
          reason: s.sulkingReason || '被敷衍踩雷',
          remainingTurns: s.sulkingLevel,
          since: new Date().toISOString(),
        }
      : undefined;

  return {
    ...persona,
    emotionState: {
      ...persona.emotionState,
      ...(sulking ? { sulking, moodLabel: '闹别扭中' } : {}),
    },
    spec: {
      ...spec,
      ...(nextImpression ? { userImpression: nextImpression } : {}),
    },
  };
}

async function runScenario(
  persona: PersonaRecord,
  scenario: LiveAdversarialScenario,
  assembler: PromptAssembler,
  offline: boolean,
  llmConfig: ReturnType<typeof resolveLlmConfig>
): Promise<LiveScenarioEvalResult> {
  const scoped = applyScenarioOverrides(persona, scenario);
  let rawOutput = '';

  if (offline) {
    rawOutput = synthesizePersonaAwareFallback(
      scoped,
      scenario.userMessage,
      scoped.defaultMode || 'authentic',
      null,
      false,
      false,
      1
    );
  } else {
    const mind = resolvePersonaMind(scoped);
    const sulkingLevel = scoped.emotionState.sulking?.level ?? 0;
    const baseLife = await getOrInitDailyLife(scoped).catch(() => ({
      dateKey: new Date().toISOString().slice(0, 10),
      mainEvent: scenario.dailyMainEvent || '和平常一样晃悠',
      moodTone: scenario.dailyMoodTone || '平静',
      recentMoments: [],
      updatedAt: new Date().toISOString(),
    }));
    const life = {
      ...baseLife,
      ...(scenario.dailyMainEvent ? { mainEvent: scenario.dailyMainEvent } : {}),
      ...(scenario.dailyMoodTone ? { moodTone: scenario.dailyMoodTone } : {}),
    };

    const fewShots = selectDynamicFewShots({
      personaMd: scoped.personaMd,
      spec: scoped.spec,
      userMessage: scenario.userMessage,
      sulkingLevel,
      maxExamples: 3,
    });

    const systemPrompt = assembler.assembleFromRecord(scoped, {
      mode: scoped.defaultMode || 'authentic',
      thinkMode: true,
      lastUserMessage: scenario.userMessage,
      sulkingLevel,
      mindDirective: buildMindCognitiveDirective(mind, scoped.spec?.temperament),
      traitsDirective: scoped.spec?.traits ? buildTraitsBehaviorDirective(scoped.spec.traits) : '',
      sulkingDirective: buildTemperamentSulkingDirective({
        sulking: scoped.emotionState.sulking,
        justResolved: false,
        temperament: scoped.spec?.temperament,
      }),
      fewShotDirective: buildFewShotDirective(fewShots),
      dailyLifeDirective: buildDailyLifeDirective(life, { channel: 'chat' }),
      relationStageDirective: buildRelationStageDirective(scoped.intimacy),
      userImpressionDirective: buildUserImpressionDirective(scoped.spec?.userImpression),
    });

    rawOutput = await chatCompletion(
      llmConfig,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: scenario.userMessage },
      ],
      { temperature: 0.72, timeoutMs: 45000 }
    );
  }

  return evaluateLiveScenarioOutput(scenario, rawOutput, scoped);
}

async function main() {
  const { personaSlug, offline, limit } = parseCliArgs(process.argv.slice(2));
  const settings = await storageRepo.getSettings().catch(() => ({}));
  const llm = resolveLlmConfig(settings);

  if (!offline && !llm.canCall) {
    console.log(
      [
        '⚠️  未检测到可用的 LLM API Key 或本地运行网关，跳过真模型对抗评测。',
        '   - 可配置环境变量 LLM_BASE_URL / LLM_API_KEY 或启动本地网关后重试。',
        '   - 如需执行确定性离线兜底干跑，请运行：npm run eval:persona:live -- --offline',
      ].join('\n')
    );
    return;
  }

  const targets: PersonaRecord[] = [];
  if (personaSlug === 'all') {
    const summaries = await storageRepo.listPersonas().catch(() => []);
    const loaded = await Promise.all(
      summaries
        .filter((s) => !s.isMaster)
        .map((s) => storageRepo.getPersona(s.slug).catch(() => null))
    );
    const valid = loaded.filter((p): p is PersonaRecord => Boolean(p));
    targets.push(...(valid.length > 0 ? valid : BUILTIN_PRESETS.filter((p) => !p.isMaster)));
  } else {
    const single =
      (await storageRepo.getPersona(personaSlug).catch(() => null)) ||
      BUILTIN_PRESETS.find((p) => p.slug === personaSlug) ||
      BUILTIN_PRESETS[1] ||
      BUILTIN_PRESETS[0];
    targets.push(single);
  }

  const scenarios = LIVE_ADVERSARIAL_SCENARIOS.slice(0, limit);
  const assembler = new PromptAssembler();

  console.log(
    `\n🚀 PersonaBot 灵魂对抗评测 (${offline ? '离线兜底模式' : `Live 模型: ${llm.model}`}) · 角色 ${targets.length} 个 × 剧本 ${scenarios.length} 条\n`
  );

  for (const persona of targets) {
    const results: LiveScenarioEvalResult[] = [];
    for (const s of scenarios) {
      results.push(await runScenario(persona, s, assembler, offline, llm));
    }

    const passedCount = results.filter((r) => r.passed).length;
    const avgSoul = Math.round(results.reduce((sum, r) => sum + r.soulScore, 0) / results.length);
    console.log(`=== ${persona.name} (${persona.slug}) · 通过 ${passedCount}/${results.length} · 均分 ${avgSoul} ===`);
    console.table(
      results.map((r) => ({
        id: r.scenarioId,
        category: r.category,
        pass: r.passed ? '✓' : '✗',
        soul: r.soulScore,
        deAI: r.deAI,
        thought: r.thoughtClean ? 'ok' : 'leak',
        violations: r.violations.join('; ') || '-',
      }))
    );
  }
}

main().catch((err) => {
  console.error('Live persona eval failed:', err);
  process.exitCode = 1;
});
