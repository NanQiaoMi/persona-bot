import {
  fingerprintFromPersonaMd,
  StyleFingerprint,
} from '@/lib/persona/fingerprint';
import type { RhythmArchetype } from '@/lib/persona/rhythm-types';

/**
 * 结构化人格规格 (PersonaSpec)：
 * - Layers 0~5 仍以作者编写的 Markdown 为准（persona.md 正文）
 * - 「## 6. 习得习惯」「## 7. 对话方式自学习」「## Correction 记录」三节改为由 learned 条目渲染，
 *   每条都带来源、证据、置信度与状态，供自进化闭环与成长日志面板管理
 * - fingerprint 为本人风格锚点；traits 为大五人格与情绪参数
 */
export const PERSONA_SPEC_VERSION = 2;

export const LEARNED_HABITS_HEADING = '## 6. 相处中习得的习惯与偏好';
export const STYLE_LOOP_HEADING = '## 7. 对话方式自学习循环 (Style Loop)';
export const CORRECTION_HEADING = '## Correction 记录';

export type LearnedKind = 'habit' | 'style' | 'correction';
export type LearnedStatus = 'trial' | 'active' | 'retired' | 'locked';
export type LearnedSource = 'llm' | 'heuristic' | 'user-correction' | 'user-edit' | 'migrated';
/** 风格规则的维度：同一维度同时只允许一条生效规则（冲突消解用） */
export type StyleDimension = 'emoji' | 'length' | 'punctuation' | 'tone' | 'question' | 'other';

export interface LearnedItem {
  id: string;
  kind: LearnedKind;
  text: string;
  dimension?: StyleDimension;
  source: LearnedSource;
  evidenceMsgIds: string[];
  confidence: number;
  status: LearnedStatus;
  /** 被再次提议 / 印证的次数 */
  hitCount: number;
  /** 试用期已经历的轮数（trial 状态使用） */
  trialTurns?: number;
  /** 进入试用时的基线分（trial 状态使用） */
  trialBaseline?: number;
  trialScores?: number[];
  retiredReason?: string;
  /** 试用通过后要取代的同维度旧规则 id */
  supersedes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaTraitsSpec {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  emotionalStability: number;
  recoveryRate: number;
  source: 'llm' | 'heuristic';
}

export interface MemoryStat {
  importance: number;
  recallCount: number;
  lastRecalledAt?: string;
}

export type CognitiveStyle =
  | 'intuitive-feeling'
  | 'analytical-logic'
  | 'pragmatic-action'
  | 'observant-guarded';

export type DefenseStyle =
  | 'tsundere-mask'
  | 'direct-pushback'
  | 'withdraw-quiet'
  | 'humor-deflect'
  | 'overthink-spiral';

export type DisagreementStyle =
  | 'blunt'
  | 'teasing-pushback'
  | 'gentle-firm'
  | 'sarcastic-side';

export type FewShotScene = 'daily' | 'tease' | 'conflict' | 'comfort' | 'disagree';

export interface PersonaFewShotExample {
  scene: FewShotScene;
  user: string;
  assistant: string;
  source?: 'preset' | 'persona-md' | 'chatlog' | 'correction' | 'user-edit';
}

export interface PersonaMindSpec {
  cognitiveStyle: CognitiveStyle;
  defenseStyle: DefenseStyle;
  disagreementStyle: DisagreementStyle;
  /** 口是心非/保留度 0~1：0 表示直白全说，1 表示心里想十分嘴上只露三分 */
  subtextLevel: number;
  /** 角色最看重的底线与价值观（最多 5 条） */
  coreValues: string[];
  fewShotExamples?: PersonaFewShotExample[];
  source?: 'preset' | 'llm' | 'heuristic' | 'user-edit';
}

export type TemperamentArchetype =
  | 'snappy'
  | 'tsundere'
  | 'hurt'
  | 'cold'
  | 'avoidant'
  | 'jealous';

export type TemperamentIntensityTier = 'gentle' | 'realistic' | 'spicy';

export interface PersonaTemperamentSpec {
  archetype: TemperamentArchetype;
  intensityTier: TemperamentIntensityTier;
  triggers: string[];
  coaxMethods: string[];
  source?: 'preset' | 'llm' | 'heuristic' | 'user-edit';
}

export interface DailyRhythmOverride {
  archetype?: RhythmArchetype;
  label?: string;
  freeActivities?: string[];
  busyActivities?: string[];
  asleepActivities?: string[];
  lateNightActivities?: string[];
}

export interface PeerRelation {
  targetSlug: string;
  targetName: string;
  relation: string;
  tone: string;
}

export interface UserImpression {
  /** 角色对你的专属称呼/昵称（可选） */
  nickname?: string;
  /** TA 眼中的你一句话主观印象 */
  summary?: string;
  /** TA 观察到的你的习惯/偏好/软肋（按角色严格隔离，最多 6 条） */
  observedHabits: string[];
  /** 最近相处感受 */
  recentVibe?: string;
  updatedAt?: string;
}

export interface PersonaSpec {
  specVersion: number;
  fingerprint?: StyleFingerprint;
  traits?: PersonaTraitsSpec;
  /** 初始性格锚点，用于限制长期自进化漂移（±0.20） */
  baselineTraits?: PersonaTraitsSpec;
  /** 性格思考方式、防御机制、分歧表达与示范对话池 */
  mind?: PersonaMindSpec;
  /** 脾气原型、烈度档位、专属雷区与顺毛哄法 */
  temperament?: PersonaTemperamentSpec;
  /** 专属作息模板与活动词表覆盖 */
  dailyRhythmOverride?: DailyRhythmOverride;
  /** 群聊里对其他成员的轻量人物关系印象 */
  peerRelations?: PeerRelation[];
  /** TA 眼中的你（按角色严格隔离的主观认知档案） */
  userImpression?: UserImpression;
  learned: LearnedItem[];
  /** 最近若干轮回复的质量分（风格分 × 用户反应），作为试用规则的对照基线 */
  recentQuality?: number[];
  /** 记忆条目的重要度与被想起次数，key 为规范化后的记忆正文 */
  memoryStats?: Record<string, MemoryStat>;
}

const LEARNED_SECTION_HEADINGS: Array<{ heading: string; kind: LearnedKind; max: number }> = [
  { heading: LEARNED_HABITS_HEADING, kind: 'habit', max: 20 },
  { heading: STYLE_LOOP_HEADING, kind: 'style', max: 12 },
  { heading: CORRECTION_HEADING, kind: 'correction', max: 50 },
];

export const RENDERED_STATUSES: LearnedStatus[] = ['active', 'locked', 'trial'];

let idSeq = 0;
export function newLearnedId(): string {
  idSeq = (idSeq + 1) % 1_000_000;
  return `lrn_${Date.now().toString(36)}_${idSeq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 规范化文本用于去重：去掉列表符号、日期标签、空白与常见标点 */
export function normalizeLearnedText(text: string): string {
  return (text || '')
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .replace(/[\s，。,.！!？?、~～：:；;“”"「」]/g, '')
    .toLowerCase();
}

/** 从一行 Markdown 条目中取出正文 */
export function stripEntryPrefix(line: string): string {
  return line
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .trim();
}

function findSection(md: string, heading: string): { start: number; end: number } | null {
  const start = md.indexOf(heading);
  if (start === -1) return null;
  const after = md.slice(start + heading.length);
  const next = after.match(/\n#{1,2}\s+/);
  const end = next ? start + heading.length + (next.index ?? after.length) : md.length;
  return { start, end };
}

/** 去掉由 learned 条目渲染的三节，返回作者编写的人设正文 */
export function stripLearnedSections(personaMd: string): string {
  let working = personaMd || '';
  for (const { heading } of LEARNED_SECTION_HEADINGS) {
    let sec = findSection(working, heading);
    while (sec) {
      working = `${working.slice(0, sec.start).trimEnd()}\n\n${working.slice(sec.end).trimStart()}`;
      sec = findSection(working, heading);
    }
  }
  return working.replace(/\n{3,}/g, '\n\n').replace(/\n---\s*$/, '').trim();
}

function parseEntryDate(line: string): string | undefined {
  const m = line.match(/^\s*[-*+]\s*\[(?:纠偏\s*)?(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\]/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function parseSectionEntries(personaMd: string, heading: string): Array<{ text: string; date?: string }> {
  const sec = findSection(personaMd || '', heading);
  if (!sec) return [];
  return personaMd
    .slice(sec.start + heading.length, sec.end)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*+]\s+/.test(l))
    .map((l) => ({ text: stripEntryPrefix(l), date: parseEntryDate(l) }))
    .filter((e) => e.text && e.text !== '（暂无记录）');
}

/** 迁移旧数据时，纠偏行的「[纠偏 日期]」前缀已被 stripEntryPrefix 去掉 */
export function inferStyleDimension(text: string): StyleDimension {
  if (/emoji|表情/i.test(text)) return 'emoji';
  if (/字|句长|精简|短句|长篇|作文|分条/.test(text)) return 'length';
  if (/句号|「。」|“。”|感叹号|标点|！/.test(text)) return 'punctuation';
  if (/反问|追问|你呢/.test(text)) return 'question';
  if (/语气|口吻|书面|AI|油腻|客服|腔/.test(text)) return 'tone';
  return 'other';
}

/** 从旧版 persona.md 的三个小节解析出 learned 条目（迁移用） */
export function parseLearnedFromMarkdown(personaMd: string, nowIso = new Date().toISOString()): LearnedItem[] {
  const items: LearnedItem[] = [];
  for (const { heading, kind } of LEARNED_SECTION_HEADINGS) {
    for (const { text, date } of parseSectionEntries(personaMd, heading)) {
      // 旧版自进化把纠偏复制成「互动风格调整：…」习惯，迁移时去重（纠偏本身已在 Correction 节）
      if (kind === 'habit' && /^互动风格调整[：:]/.test(text)) continue;
      if (items.some((it) => it.kind === kind && normalizeLearnedText(it.text) === normalizeLearnedText(text))) {
        continue;
      }
      items.push({
        id: newLearnedId(),
        kind,
        text,
        dimension: kind === 'style' ? inferStyleDimension(text) : undefined,
        source: kind === 'correction' ? 'user-correction' : 'migrated',
        evidenceMsgIds: [],
        confidence: kind === 'correction' ? 0.9 : 0.6,
        status: kind === 'correction' ? 'locked' : 'active',
        hitCount: 1,
        createdAt: date || nowIso,
        updatedAt: nowIso,
      });
    }
  }
  return items;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('zh-CN');
}

/** 将作者正文与 learned 条目渲染为完整 persona.md（只渲染 active / locked / trial） */
export function renderPersonaMarkdown(personaMd: string, learned: LearnedItem[]): string {
  const base = stripLearnedSections(personaMd);
  const blocks: string[] = [base];
  // 试用中的新规则会暂时替换掉它要取代的旧规则，这样才能真正比较效果
  const supersededIds = new Set(
    learned.filter((it) => it.status === 'trial' && it.supersedes).map((it) => it.supersedes as string)
  );
  for (const { heading, kind, max } of LEARNED_SECTION_HEADINGS) {
    const items = learned
      .filter(
        (it) =>
          it.kind === kind &&
          RENDERED_STATUSES.includes(it.status) &&
          !(it.status === 'active' && supersededIds.has(it.id))
      )
      .slice(-max);
    if (items.length === 0) {
      if (kind === 'correction' && personaMd.includes(CORRECTION_HEADING)) {
        blocks.push(`${CORRECTION_HEADING}\n（暂无记录）`);
      }
      continue;
    }
    const lines = items.map((it) => {
      const date = formatDate(it.createdAt);
      const tag = kind === 'correction' ? `[纠偏 ${date}]` : `[${date}]`;
      const trial = it.status === 'trial' ? '（试用中）' : '';
      return `- ${tag} ${it.text}${trial}`;
    });
    blocks.push(`${heading}\n${lines.join('\n')}`);
  }
  return `${blocks.filter(Boolean).join('\n\n').trim()}\n`;
}

/** 规范化/迁移：没有 spec 时从 persona.md 推导；有 spec 时补齐缺失字段 */
export function ensurePersonaSpec(personaMd: string, spec?: Partial<PersonaSpec> | null): PersonaSpec {
  if (spec && Array.isArray(spec.learned)) {
    const baselineTraits =
      spec.baselineTraits ?? (spec.traits ? { ...spec.traits } : undefined);
    return {
      specVersion: spec.specVersion || PERSONA_SPEC_VERSION,
      fingerprint: spec.fingerprint,
      traits: spec.traits,
      ...(baselineTraits ? { baselineTraits } : {}),
      ...(spec.mind ? { mind: spec.mind } : {}),
      ...(spec.temperament ? { temperament: spec.temperament } : {}),
      ...(spec.dailyRhythmOverride ? { dailyRhythmOverride: spec.dailyRhythmOverride } : {}),
      ...(Array.isArray(spec.peerRelations) ? { peerRelations: spec.peerRelations } : {}),
      ...(spec.userImpression && typeof spec.userImpression === 'object'
        ? {
            userImpression: {
              ...spec.userImpression,
              observedHabits: Array.isArray(spec.userImpression.observedHabits)
                ? spec.userImpression.observedHabits.filter(
                    (h): h is string => typeof h === 'string' && h.trim().length > 0
                  )
                : [],
            },
          }
        : {}),
      learned: spec.learned.filter((it) => it && typeof it.text === 'string'),
      recentQuality: Array.isArray(spec.recentQuality) ? spec.recentQuality.slice(-12) : undefined,
      memoryStats: spec.memoryStats && typeof spec.memoryStats === 'object' ? spec.memoryStats : undefined,
    };
  }
  const fp = fingerprintFromPersonaMd(personaMd);
  return {
    specVersion: PERSONA_SPEC_VERSION,
    fingerprint: fp.sampleCount >= 3 ? fp : undefined,
    learned: parseLearnedFromMarkdown(personaMd),
  };
}

/**
 * 用户直接编辑了 persona.md（例如右侧面板手改人设）时，把编辑结果同步回 learned：
 * - 仍存在的条目保留原有元数据
 * - 新增的条目视为用户手写（locked，不会被自动淘汰）
 * - 被删掉的 active/trial 条目标记为 retired（可在成长日志里恢复）
 */
export function reconcileSpecWithMarkdown(spec: PersonaSpec, editedMd: string): PersonaSpec {
  const now = new Date().toISOString();
  const parsed = parseLearnedFromMarkdown(editedMd, now);
  const used = new Set<string>();
  const next: LearnedItem[] = [];

  for (const p of parsed) {
    const key = normalizeLearnedText(p.text.replace(/（试用中）$/, ''));
    const existing = spec.learned.find(
      (it) => it.kind === p.kind && !used.has(it.id) && normalizeLearnedText(it.text) === key
    );
    if (existing) {
      used.add(existing.id);
      next.push(existing.status === 'retired' ? { ...existing, status: 'active', updatedAt: now } : existing);
    } else {
      next.push({ ...p, text: p.text.replace(/（试用中）$/, ''), source: 'user-edit', status: 'locked', confidence: 1 });
    }
  }
  for (const it of spec.learned) {
    if (used.has(it.id)) continue;
    if (it.status === 'retired') {
      next.push(it);
    } else if (!next.some((n) => n.id === it.id)) {
      next.push({ ...it, status: 'retired', retiredReason: '用户在人设中删除', updatedAt: now });
    }
  }
  return { ...spec, learned: next };
}
