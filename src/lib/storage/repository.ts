import fs from 'fs/promises';
import { messagePreviewText } from '@/lib/chat/preview';
import path from 'path';
import {
  BUILTIN_PRESET_SCENE_ASSETS,
  BUILTIN_PRESETS,
} from '@/lib/persona/presets';
import {
  ensurePersonaSpec,
  inferStyleDimension,
  newLearnedId,
  PersonaSpec,
  renderPersonaMarkdown,
} from '@/lib/persona/spec';
import {
  ConversationMemoryState,
  ConversationMessage,
  CorrectionItem,
  GroupChat,
  MomentPost,
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRecord,
  PersonaSnapshot,
  PersonaSnapshotMeta,
  PersonaSoulBundle,
  PersonaSummary,
  RuntimeSettings,
  SceneAsset,
  SnapshotKind,
  WorldState,
} from './types';

export const SNAPSHOT_QUOTA: Record<SnapshotKind, number> = { auto: 10, manual: 30 };

/** 兼容旧快照：没有 kind 字段时，按原因文案推断是否为自进化自动快照 */
export function inferSnapshotKind(snap: Pick<PersonaSnapshot, 'kind' | 'reason'>): SnapshotKind {
  if (snap.kind === 'auto' || snap.kind === 'manual') return snap.kind;
  return /第\s*\d+\s*轮自动/.test(snap.reason || '') ? 'auto' : 'manual';
}

/**
 * 本地数据根目录：默认是项目根目录（exes/ 与 .data/ 都在这里）。
 * 设置 PERSONABOT_DATA_ROOT 可改到别处——测试会指向临时目录，避免改动真实角色与聊天记录。
 */
export function resolveDataRoot(): string {
  const override = process.env.PERSONABOT_DATA_ROOT?.trim();
  return override
    ? path.resolve(/*turbopackIgnore: true*/ override)
    : /*turbopackIgnore: true*/ process.cwd();
}

const EXES_DIR = path.join(/*turbopackIgnore: true*/ resolveDataRoot(), 'exes');
const DATA_DIR = path.join(/*turbopackIgnore: true*/ resolveDataRoot(), '.data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  llmProvider: 'local_gateway',
  llmBaseUrl: process.env.LLM_BASE_URL || 'http://127.0.0.1:18630/v1',
  llmApiKey: '',
  llmModel: process.env.LLM_MODEL || 'gpt-5.6',
  imageModel: process.env.IMAGE_MODEL || 'gpt-image-2.6',
  enableAutoSticker: true,
  enableAutoPhoto: true,
  searchProvider: process.env.TAVILY_API_KEY
    ? 'tavily'
    : process.env.SERPER_API_KEY
      ? 'serper'
      : 'builtin',
  tavilyApiKey: '',
  serperApiKey: '',
  defaultThinkMode: true,
  defaultDeepSearch: true,
  autoVoicePlayback: false,
  theme: 'light',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'persona';
}

function defaultEmotionSnapshot(): PersonaEmotionSnapshot {
  return {
    primary: 'calm',
    pleasure: 0.15,
    arousal: 0.35,
    dominance: 0.5,
    intensity: 0.5,
    moodLabel: '平静在线',
    lastUpdated: new Date().toISOString(),
    decayRate: 0.1,
  };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 原子写入：先写临时文件再改名替换，读的一方永远看到完整的旧内容或新内容，
 * 不会读到「刚清空、还没写完」的半截文件（并发读写同一个角色时会发生）。
 */
async function writeFileAtomic(
  targetPath: string,
  data: string,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  const tmp = `${targetPath}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await fs.writeFile(tmp, data, encoding);
    await fs.rename(tmp, targetPath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

async function readJsonSafe<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(targetPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readTextSafe(targetPath: string, fallback = ''): Promise<string> {
  try {
    return await fs.readFile(targetPath, 'utf-8');
  } catch {
    return fallback;
  }
}

type StorageLockRegistry = Map<string, Promise<unknown>>;
const STORAGE_LOCKS_GLOBAL_KEY = '__personabotStorageLocks';

function sharedLocks(): StorageLockRegistry {
  const g = globalThis as unknown as Record<string, StorageLockRegistry | undefined>;
  if (!g[STORAGE_LOCKS_GLOBAL_KEY]) g[STORAGE_LOCKS_GLOBAL_KEY] = new Map();
  return g[STORAGE_LOCKS_GLOBAL_KEY]!;
}

export class UnifiedStorageRepository {
  private baseDir: string;
  private dataDir: string;
  private seeded = false;

  /**
   * 按 key 串行执行异步任务，避免同一角色/会话文件被并发「读-改-写」时互相覆盖。
   * 锁表挂载在 globalThis 并按数据目录隔离，确保开发模式下跨 API 路由副本也能互斥，同时测试临时目录互不干扰。
   * 注意：不可重入，回调内不要再对同一 key 调用 withLock。
   */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const locks = sharedLocks();
    const scopedKey = `${this.baseDir}|${this.dataDir}::${key}`;
    const prev = locks.get(scopedKey) || Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    locks.set(scopedKey, tail);
    try {
      return await run;
    } finally {
      if (locks.get(scopedKey) === tail) locks.delete(scopedKey);
    }
  }

  /**
   * 原子地读取 → 修改 → 保存角色。mutator 返回 null 表示不保存。
   */
  async updatePersona(
    slug: string,
    mutator: (current: PersonaRecord) => PersonaRecord | null | Promise<PersonaRecord | null>
  ): Promise<PersonaRecord | null> {
    const safeSlug = sanitizeSlug(slug);
    return this.withLock(`persona:${safeSlug}`, async () => {
      const current = await this.getPersona(safeSlug);
      if (!current) return null;
      const next = await mutator(current);
      if (!next) return current;
      return this.writePersonaFiles(next);
    });
  }

  constructor(baseDir = EXES_DIR, dataDir = DATA_DIR) {
    this.baseDir = baseDir;
    this.dataDir = dataDir;
  }

  private getPersonaDir(slug: string): string {
    return path.join(this.baseDir, sanitizeSlug(slug));
  }

  private getSnapshotsDir(slug: string): string {
    return path.join(this.getPersonaDir(slug), 'snapshots');
  }

  async ensurePresetsSeeded(): Promise<void> {
    if (this.seeded) return;
    await fs.mkdir(this.baseDir, { recursive: true });

    for (const preset of BUILTIN_PRESETS) {
      const dir = this.getPersonaDir(preset.slug);
      const metaPath = path.join(dir, 'meta.json');
      if (!(await fileExists(metaPath))) {
        await this.savePersona(preset);
      }

      const defaultAssets = BUILTIN_PRESET_SCENE_ASSETS[preset.slug];
      if (defaultAssets && defaultAssets.length > 0) {
        const assetsPath = path.join(dir, 'assets.json');
        if (!(await fileExists(assetsPath))) {
          await this.saveSceneAssets(preset.slug, defaultAssets);
        }
      }
    }

    this.seeded = true;
  }

  async listPersonas(): Promise<PersonaSummary[]> {
    await this.ensurePresetsSeeded();
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true }).catch(() => []);
    const summaryBySlug = new Map<string, PersonaSummary>();

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const persona = await this.getPersona(entry.name);
      if (!persona) continue;

      const conv = await this.getConversation(entry.name);
      const lastMsg = conv[conv.length - 1];
      const nextSummary: PersonaSummary = {
        slug: persona.slug,
        name: persona.name,
        version: persona.version,
        isPreset: Boolean(persona.isPreset),
        isMaster: Boolean(persona.isMaster),
        defaultMode: persona.defaultMode,
        profile: persona.profile,
        emotionState: persona.emotionState,
        intimacy: persona.intimacy,
        lastMessage: lastMsg ? messagePreviewText(lastMsg).slice(0, 80) : undefined,
        lastActive: lastMsg?.timestamp || persona.updatedAt,
        createdAt: persona.createdAt,
        updatedAt: persona.updatedAt,
      };

      const existing = summaryBySlug.get(persona.slug);
      if (
        !existing ||
        new Date(nextSummary.lastActive).getTime() >=
          new Date(existing.lastActive).getTime()
      ) {
        summaryBySlug.set(persona.slug, nextSummary);
      }
    }

    const summaries = Array.from(summaryBySlug.values());
    summaries.sort((a, b) => {
      if (Boolean(a.isMaster) !== Boolean(b.isMaster)) return a.isMaster ? -1 : 1;
      if (a.isPreset !== b.isPreset) return a.isPreset ? -1 : 1;
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });

    return summaries;
  }

  async getPersona(slug: string): Promise<PersonaRecord | null> {
    await this.ensurePresetsSeeded();
    const safeSlug = sanitizeSlug(slug);
    const dir = this.getPersonaDir(safeSlug);

    if (!(await fileExists(dir))) {
      return null;
    }

    // Compatible with both v2 meta.json and legacy v1 meta.json
    const meta = await readJsonSafe<Record<string, unknown>>(path.join(dir, 'meta.json'), {});
    const personaMd = await readTextSafe(path.join(dir, 'persona.md'));
    const memoriesMd = await readTextSafe(path.join(dir, 'memories.md'));
    const aiProfileMd = await readTextSafe(path.join(dir, 'ai_profile.md'));
    const emotionRaw = await readJsonSafe<Partial<PersonaEmotionSnapshot>>(
      path.join(dir, 'emotion.json'),
      {}
    );
    const corrections = await readJsonSafe<CorrectionItem[]>(
      path.join(dir, 'corrections.json'),
      []
    );
    const specRaw = await readJsonSafe<Partial<PersonaSpec> | null>(
      path.join(dir, 'spec.json'),
      null
    );

    if (!meta.name && !personaMd) {
      return null;
    }

    const legacyProfile = (meta.profile as Record<string, unknown>) || {};
    const legacyTags = (meta.tags as Record<string, unknown>) || {};

    const now = new Date().toISOString();
    const name = String(meta.name || safeSlug);

    return {
      slug: safeSlug,
      name,
      version: String(meta.version || 'v2.0'),
      isPreset: Boolean(meta.isPreset),
      isMaster: Boolean(meta.isMaster) || safeSlug === 'master-bot',
      defaultMode: (meta.defaultMode as PersonaMode) || 'authentic',
      profile: {
        mbti: (legacyProfile.mbti as string) || undefined,
        zodiac: (legacyProfile.zodiac as string) || undefined,
        attachment:
          (legacyProfile.attachment as string) ||
          (legacyTags.attachment as string) ||
          undefined,
        duration: (legacyProfile.duration as string) || undefined,
        howMet:
          (legacyProfile.howMet as string) ||
          (legacyProfile.how_met as string) ||
          undefined,
        breakupTime:
          (legacyProfile.breakupTime as string) ||
          (legacyProfile.time_since_breakup as string) ||
          undefined,
        occupation: (legacyProfile.occupation as string) || undefined,
        personalityTags: Array.isArray(legacyProfile.personalityTags)
          ? (legacyProfile.personalityTags as string[])
          : Array.isArray(legacyTags.personality)
            ? (legacyTags.personality as string[])
            : [],
        avatarEmoji: (legacyProfile.avatarEmoji as string) || '✨',
        accentColor: (legacyProfile.accentColor as string) || '#10B981',
        avatarShape: (legacyProfile.avatarShape as string) || undefined,
        avatarColor: (legacyProfile.avatarColor as string) || undefined,
        avatarImage: (legacyProfile.avatarImage as string) || undefined,
        appearanceAnchor: (legacyProfile.appearanceAnchor as string) || undefined,
        appearanceAnchorLocked: Boolean(legacyProfile.appearanceAnchorLocked) || undefined,
        referenceImageUrl: (legacyProfile.referenceImageUrl as string) || undefined,
        bio: (legacyProfile.bio as string) || undefined,
      },
      personaMd,
      memoriesMd,
      aiProfileMd,
      emotionState: {
        ...defaultEmotionSnapshot(),
        ...emotionRaw,
      },
      intimacy: typeof meta.intimacy === 'number' ? meta.intimacy : 60,
      corrections,
      spec: ensurePersonaSpec(personaMd, specRaw),
      evolution: isRecord(meta.evolution) &&
        typeof meta.evolution.lastEvolvedUserTurn === 'number'
        ? (meta.evolution as unknown as PersonaRecord['evolution'])
        : undefined,
      relationship: isRecord(meta.relationship) &&
        typeof meta.relationship.ledgerDate === 'string'
        ? (meta.relationship as unknown as PersonaRecord['relationship'])
        : undefined,
      createdAt: String(meta.createdAt || meta.created_at || now),
      updatedAt: String(meta.updatedAt || meta.updated_at || now),
    };
  }

  async savePersona(record: PersonaRecord): Promise<PersonaRecord> {
    const safeSlug = sanitizeSlug(record.slug || record.name);
    return this.withLock(`persona:${safeSlug}`, () => this.writePersonaFiles(record));
  }

  private async writePersonaFiles(record: PersonaRecord): Promise<PersonaRecord> {
    const safeSlug = sanitizeSlug(record.slug || record.name);
    const dir = this.getPersonaDir(safeSlug);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, 'versions'), { recursive: true });

    const now = new Date().toISOString();
    // spec 是 6/7/纠偏小节的唯一来源：写入时从 spec 重新渲染 persona.md，保证两者一致
    const spec = ensurePersonaSpec(record.personaMd || '', record.spec);
    const normalized: PersonaRecord = {
      ...record,
      slug: safeSlug,
      spec,
      personaMd: renderPersonaMarkdown(record.personaMd || '', spec.learned),
      updatedAt: now,
      createdAt: record.createdAt || now,
    };

    const meta = {
      slug: normalized.slug,
      name: normalized.name,
      version: normalized.version,
      isPreset: Boolean(normalized.isPreset),
      isMaster: Boolean(normalized.isMaster) || safeSlug === 'master-bot',
      defaultMode: normalized.defaultMode,
      intimacy: normalized.intimacy,
      profile: normalized.profile,
      evolution: normalized.evolution,
      relationship: normalized.relationship,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };

    await Promise.all([
      writeFileAtomic(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8'),
      writeFileAtomic(path.join(dir, 'persona.md'), normalized.personaMd || '', 'utf-8'),
      writeFileAtomic(path.join(dir, 'memories.md'), normalized.memoriesMd || '', 'utf-8'),
      writeFileAtomic(path.join(dir, 'ai_profile.md'), normalized.aiProfileMd || '', 'utf-8'),
      writeFileAtomic(
        path.join(dir, 'emotion.json'),
        JSON.stringify(normalized.emotionState, null, 2),
        'utf-8'
      ),
      writeFileAtomic(
        path.join(dir, 'corrections.json'),
        JSON.stringify(normalized.corrections || [], null, 2),
        'utf-8'
      ),
      writeFileAtomic(path.join(dir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf-8'),
    ]);

    return normalized;
  }

  async deletePersona(slug: string): Promise<boolean> {
    const safeSlug = sanitizeSlug(slug);
    const dir = this.getPersonaDir(safeSlug);
    if (!(await fileExists(dir))) {
      return false;
    }
    // 与长记忆后台写入共用一把锁：正在写的先写完，之后的写入会发现目录已删而跳过
    await this.withLock(`memory-state:${safeSlug}`, () =>
      fs.rm(dir, { recursive: true, force: true })
    );
    return true;
  }

  async updateEmotionAndIntimacy(
    slug: string,
    emotionState: PersonaEmotionSnapshot,
    intimacy: number,
    relationship?: PersonaRecord['relationship']
  ): Promise<void> {
    await this.updatePersona(slug, (persona) => ({
      ...persona,
      emotionState,
      intimacy: Math.max(0, Math.min(100, Math.round(intimacy))),
      relationship: relationship ?? persona.relationship,
    }));
  }

  async addCorrection(slug: string, correction: Omit<CorrectionItem, 'id' | 'timestamp'>): Promise<PersonaRecord | null> {
    return this.updatePersona(slug, (persona) => this.applyCorrection(persona, correction));
  }

  private applyCorrection(
    persona: PersonaRecord,
    correction: Omit<CorrectionItem, 'id' | 'timestamp'>
  ): PersonaRecord {

    const item: CorrectionItem = {
      id: `corr_${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...correction,
    };
    persona.corrections = [...persona.corrections, item].slice(-50);

    // 纠偏写成 learned 条目（locked，不会被自动淘汰），写入时渲染到 persona.md 的 Correction 节立即生效
    const spec = ensurePersonaSpec(persona.personaMd, persona.spec);
    const nowIso = item.timestamp;
    // 纠偏命中的方面里还在试用的风格规则说明没通过用户这一关，直接淘汰
    const dimension = inferStyleDimension(item.correction);
    const learnedAfterCorrection = spec.learned.map((it) =>
      it.kind === 'style' && it.status === 'trial' && dimension !== 'other' && it.dimension === dimension
        ? { ...it, status: 'retired' as const, retiredReason: '被你的纠偏否决', updatedAt: nowIso }
        : it
    );
    persona.spec = {
      ...spec,
      learned: [
        ...learnedAfterCorrection,
        {
          id: newLearnedId(),
          kind: 'correction',
          text: item.botResponse
            ? `避免「${item.botResponse.slice(0, 40)}」，应当：${item.correction}`
            : item.correction,
          source: 'user-correction',
          evidenceMsgIds: [],
          confidence: 0.9,
          status: 'locked',
          hitCount: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
    };
    return persona;
  }

  async getConversation(slug: string, limit = 100): Promise<ConversationMessage[]> {
    const dir = this.getPersonaDir(slug);
    const messages = await readJsonSafe<ConversationMessage[]>(
      path.join(dir, 'conversations.json'),
      []
    );
    return limit > 0 ? messages.slice(-limit) : messages;
  }

  private async writeConversationFile(slug: string, messages: ConversationMessage[]): Promise<void> {
    const dir = this.getPersonaDir(slug);
    await fs.mkdir(dir, { recursive: true });
    const trimmed = messages.slice(-200);
    await writeFileAtomic(
      path.join(dir, 'conversations.json'),
      JSON.stringify(trimmed, null, 2),
      'utf-8'
    );
  }

  async saveConversation(slug: string, messages: ConversationMessage[]): Promise<void> {
    return this.withLock(`conv:${sanitizeSlug(slug)}`, () =>
      this.writeConversationFile(slug, messages)
    );
  }

  async appendMessages(slug: string, newMessages: ConversationMessage[]): Promise<ConversationMessage[]> {
    return this.withLock(`conv:${sanitizeSlug(slug)}`, async () => {
      const existing = await this.getConversation(slug, 0);
      const merged = [...existing, ...newMessages].slice(-200);
      await this.writeConversationFile(slug, merged);
      return merged;
    });
  }

  /** 在锁内修改单聊里的一条消息（生图回写等），不会和逐段存档互相覆盖 */
  async updateConversationMessage(
    slug: string,
    messageId: string,
    mutator: (msg: ConversationMessage) => ConversationMessage
  ): Promise<ConversationMessage | null> {
    return this.withLock(`conv:${sanitizeSlug(slug)}`, async () => {
      const list = await this.getConversation(slug, 0);
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return null;
      list[idx] = mutator(list[idx]);
      await this.writeConversationFile(slug, list);
      return list[idx];
    });
  }

  private async readSnapshotFiles(slug: string): Promise<PersonaSnapshot[]> {
    const snapDir = this.getSnapshotsDir(slug);
    const entries = await fs.readdir(snapDir).catch(() => []);
    const snapshots: PersonaSnapshot[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const parsed = await readJsonSafe<PersonaSnapshot | null>(
        path.join(snapDir, entry),
        null
      );
      if (parsed && parsed.id && parsed.createdAt) {
        snapshots.push(parsed);
      }
    }

    snapshots.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return snapshots;
  }

  async createSnapshot(
    slug: string,
    reason: string,
    summary?: string,
    kind: SnapshotKind = 'manual'
  ): Promise<PersonaSnapshot | null> {
    const persona = await this.getPersona(slug);
    if (!persona) return null;
    return this.writeSnapshotFrom(persona, reason, summary, kind);
  }

  /**
   * 基于给定的角色记录写入快照（可在 updatePersona 回调内使用，不会重复加锁），并按 kind 分别执行配额淘汰
   */
  async writeSnapshotFrom(
    persona: PersonaRecord,
    reason: string,
    summary?: string,
    kind: SnapshotKind = 'manual'
  ): Promise<PersonaSnapshot> {
    const slug = persona.slug;
    const snapDir = this.getSnapshotsDir(slug);
    await fs.mkdir(snapDir, { recursive: true });

    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const snapshot: PersonaSnapshot = {
      id,
      createdAt: new Date().toISOString(),
      kind,
      reason: reason.trim() || '自动存档',
      summary: summary?.trim() || undefined,
      personaMd: persona.personaMd,
      memoriesMd: persona.memoriesMd,
      aiProfileMd: persona.aiProfileMd,
      profile: persona.profile,
      corrections: persona.corrections || [],
      intimacy: persona.intimacy,
      emotionState: persona.emotionState,
      spec: persona.spec,
    };

    await writeFileAtomic(
      path.join(snapDir, `${id}.json`),
      JSON.stringify(snapshot, null, 2),
      'utf-8'
    );

    const sameKind = (await this.readSnapshotFiles(slug)).filter(
      (snap) => inferSnapshotKind(snap) === kind
    );
    const quota = SNAPSHOT_QUOTA[kind];
    if (sameKind.length > quota) {
      await Promise.all(
        sameKind.slice(quota).map((old) =>
          fs.unlink(path.join(snapDir, `${old.id}.json`)).catch(() => {})
        )
      );
    }

    return snapshot;
  }

  async listSnapshots(slug: string): Promise<PersonaSnapshotMeta[]> {
    const all = await this.readSnapshotFiles(slug);
    return all.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      kind: inferSnapshotKind(s),
      reason: s.reason,
      summary: s.summary,
      intimacy: s.intimacy,
      memoriesLength: (s.memoriesMd || '').length,
      personaLength: (s.personaMd || '').length,
      correctionsCount: (s.corrections || []).length,
    }));
  }

  async rollbackSnapshot(
    slug: string,
    snapshotId: string
  ): Promise<PersonaRecord | null> {
    if (!/^[a-zA-Z0-9_-]+$/.test(snapshotId)) {
      throw new Error('Invalid snapshotId');
    }

    const snapPath = path.join(this.getSnapshotsDir(sanitizeSlug(slug)), `${snapshotId}.json`);
    const snap = await readJsonSafe<PersonaSnapshot | null>(snapPath, null);
    if (!snap) return null;

    return this.updatePersona(slug, async (persona) => {
      await this.writeSnapshotFrom(
        persona,
        '回滚前自动备份',
        `回滚至 ${new Date(snap.createdAt).toLocaleString('zh-CN')} (${snap.reason})`,
        'manual'
      );

      return {
        ...persona,
        personaMd: snap.personaMd,
        memoriesMd: snap.memoriesMd,
        aiProfileMd: snap.aiProfileMd ?? persona.aiProfileMd,
        profile: snap.profile || persona.profile,
        corrections: Array.isArray(snap.corrections)
          ? snap.corrections
          : persona.corrections,
        intimacy:
          typeof snap.intimacy === 'number' ? snap.intimacy : persona.intimacy,
        emotionState: snap.emotionState || persona.emotionState,
        // 旧快照没有 spec 时由 ensurePersonaSpec 从快照的 persona.md 推导
        spec: snap.spec,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async exportSoulBundle(slug: string): Promise<PersonaSoulBundle | null> {
    const persona = await this.getPersona(slug);
    if (!persona) return null;

    const [conversations, snapshots] = await Promise.all([
      this.getConversation(slug, 200),
      this.readSnapshotFiles(slug),
    ]);

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      persona,
      conversations,
      snapshots: snapshots.slice(0, 10),
    };
  }

  async importSoulBundle(
    targetSlug: string,
    bundle: Partial<PersonaSoulBundle>
  ): Promise<PersonaRecord> {
    if (
      !bundle ||
      !bundle.persona ||
      typeof bundle.persona.name !== 'string' ||
      typeof bundle.persona.personaMd !== 'string' ||
      typeof bundle.persona.memoriesMd !== 'string'
    ) {
      throw new Error('无效的灵魂包格式：缺少必要的人格字段');
    }

    const safeTarget = sanitizeSlug(targetSlug);
    const existing = await this.getPersona(safeTarget);
    if (existing) {
      await this.createSnapshot(
        safeTarget,
        '导入灵魂包前自动备份',
        `导入来源：${bundle.persona.name}`
      );
    }

    const incoming = bundle.persona;
    const saved = await this.savePersona({
      slug: safeTarget,
      name: incoming.name.trim() || existing?.name || safeTarget,
      version: incoming.version || existing?.version || '2.0',
      isPreset: existing?.isPreset ?? Boolean(incoming.isPreset),
      isMaster: existing?.isMaster ?? (Boolean(incoming.isMaster) || safeTarget === 'master-bot'),
      defaultMode: (incoming.defaultMode || existing?.defaultMode || 'authentic') as PersonaMode,
      profile: {
        ...(existing?.profile || {}),
        ...(incoming.profile || {}),
        personalityTags: Array.isArray(incoming.profile?.personalityTags)
          ? incoming.profile.personalityTags
          : existing?.profile?.personalityTags || [],
      },
      personaMd: incoming.personaMd,
      memoriesMd: incoming.memoriesMd,
      aiProfileMd:
        typeof incoming.aiProfileMd === 'string'
          ? incoming.aiProfileMd
          : existing?.aiProfileMd || '',
      emotionState: incoming.emotionState || existing?.emotionState || defaultEmotionSnapshot(),
      intimacy:
        typeof incoming.intimacy === 'number'
          ? incoming.intimacy
          : existing?.intimacy ?? 65,
      corrections: Array.isArray(incoming.corrections)
        ? incoming.corrections.slice(-50)
        : existing?.corrections || [],
      spec: incoming.spec,
      createdAt: existing?.createdAt || incoming.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (Array.isArray(bundle.conversations)) {
      await this.saveConversation(safeTarget, bundle.conversations.slice(-200));
    }

    return saved;
  }

  async getSettings(): Promise<RuntimeSettings> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const filePath = path.join(this.dataDir, 'settings.json');
    const saved = await readJsonSafe<Partial<RuntimeSettings>>(filePath, {});
    return {
      ...DEFAULT_RUNTIME_SETTINGS,
      ...saved,
    };
  }

  async saveSettings(partial: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
    const current = await this.getSettings();
    const updated: RuntimeSettings = {
      ...current,
      ...partial,
    };
    await fs.mkdir(this.dataDir, { recursive: true });
    const targetPath = path.join(this.dataDir, 'settings.json');
    await writeFileAtomic(targetPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  async getMoments(slug: string): Promise<MomentPost[]> {
    const safeSlug = sanitizeSlug(slug);
    const filePath = path.join(this.getPersonaDir(safeSlug), 'moments.json');
    const parsed = await readJsonSafe<MomentPost[]>(filePath, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  async saveMoments(slug: string, posts: MomentPost[]): Promise<MomentPost[]> {
    const safeSlug = sanitizeSlug(slug);
    const dir = this.getPersonaDir(safeSlug);
    await fs.mkdir(dir, { recursive: true });
    const trimmed = posts.slice(0, 60);
    await writeFileAtomic(
      path.join(dir, 'moments.json'),
      JSON.stringify(trimmed, null, 2),
      'utf-8'
    );
    return trimmed;
  }

  async updateMoments(
    slug: string,
    mutator: (current: MomentPost[]) => MomentPost[] | Promise<MomentPost[]>
  ): Promise<MomentPost[]> {
    const safeSlug = sanitizeSlug(slug);
    return this.withLock(`moments:${safeSlug}`, async () => {
      const current = await this.getMoments(safeSlug);
      const next = await mutator(current);
      return this.saveMoments(safeSlug, next);
    });
  }

  async getSceneAssets(slug: string): Promise<SceneAsset[]> {
    const safeSlug = sanitizeSlug(slug);
    const filePath = path.join(this.getPersonaDir(safeSlug), 'assets.json');
    const parsed = await readJsonSafe<SceneAsset[]>(filePath, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  async saveSceneAssets(slug: string, assets: SceneAsset[]): Promise<SceneAsset[]> {
    const safeSlug = sanitizeSlug(slug);
    const dir = this.getPersonaDir(safeSlug);
    await fs.mkdir(dir, { recursive: true });
    const trimmed = assets.slice(0, 30);
    await writeFileAtomic(
      path.join(dir, 'assets.json'),
      JSON.stringify(trimmed, null, 2),
      'utf-8'
    );
    return trimmed;
  }

  async updateSceneAssets(
    slug: string,
    mutator: (current: SceneAsset[]) => SceneAsset[] | Promise<SceneAsset[]>
  ): Promise<SceneAsset[]> {
    const safeSlug = sanitizeSlug(slug);
    return this.withLock(`assets:${safeSlug}`, async () => {
      const current = await this.getSceneAssets(safeSlug);
      const next = await mutator(current);
      return this.saveSceneAssets(safeSlug, next);
    });
  }

  async getWorld(slug: string): Promise<WorldState> {
    const safeSlug = sanitizeSlug(slug);
    const parsed = await readJsonSafe<WorldState>(path.join(this.getPersonaDir(safeSlug), 'world.json'), {
      entries: [],
    });
    return isRecord(parsed) && Array.isArray(parsed.entries) ? parsed : { entries: [] };
  }

  /** 原子地读 → 改 → 写世界设定；角色目录已删除时不再建回来 */
  async updateWorld(
    slug: string,
    mutator: (current: WorldState) => WorldState | Promise<WorldState>
  ): Promise<WorldState> {
    const safeSlug = sanitizeSlug(slug);
    return this.withLock(`world:${safeSlug}`, async () => {
      const current = await this.getWorld(safeSlug);
      const next = await mutator(current);
      const dir = this.getPersonaDir(safeSlug);
      if (!(await fileExists(dir))) return next;
      await writeFileAtomic(path.join(dir, 'world.json'), JSON.stringify(next, null, 2));
      return next;
    });
  }

  async getMemoryState(slug: string): Promise<ConversationMemoryState> {
    const safeSlug = sanitizeSlug(slug);
    const parsed = await readJsonSafe<ConversationMemoryState>(
      path.join(this.getPersonaDir(safeSlug), 'memory-state.json'),
      {}
    );
    return isRecord(parsed) ? parsed : {};
  }

  async updateMemoryState(
    slug: string,
    mutator: (current: ConversationMemoryState) => ConversationMemoryState | Promise<ConversationMemoryState>
  ): Promise<ConversationMemoryState> {
    const safeSlug = sanitizeSlug(slug);
    return this.withLock(`memory-state:${safeSlug}`, async () => {
      const current = await this.getMemoryState(safeSlug);
      const next = await mutator(current);
      const dir = this.getPersonaDir(safeSlug);
      // 后台维护可能晚于删除角色才完成：角色目录已不存在时不要再把它建回来
      const exists = await fs
        .stat(dir)
        .then((st) => st.isDirectory())
        .catch(() => false);
      if (!exists) return next;
      await writeFileAtomic(path.join(dir, 'memory-state.json'), JSON.stringify(next, null, 2), 'utf-8');
      return next;
    });
  }

  // ---------------- 群聊（主 bot 发起） ----------------

  private getGroupsDir(): string {
    return path.join(this.dataDir, 'groups');
  }

  private getGroupDir(id: string): string {
    return path.join(this.getGroupsDir(), sanitizeSlug(id));
  }

  /**
   * 旧版把所有群放在一个 groups.json 里；多个进程同时建群会互相覆盖。
   * 现在每个群单独存 groups/<id>/group.json。首次读取时把旧索引迁过来，旧文件改名留作备份。
   */
  private groupIndexMigrated = false;

  private async migrateLegacyGroupIndex(): Promise<void> {
    if (this.groupIndexMigrated) return;
    const legacyPath = path.join(this.getGroupsDir(), 'groups.json');
    const legacy = await readJsonSafe<GroupChat[] | null>(legacyPath, null);
    if (Array.isArray(legacy)) {
      for (const g of legacy) {
        if (!g?.id) continue;
        const file = path.join(this.getGroupDir(g.id), 'group.json');
        if (!(await fileExists(file))) {
          await fs.mkdir(this.getGroupDir(g.id), { recursive: true });
          await writeFileAtomic(file, JSON.stringify(g, null, 2));
        }
      }
      await fs.rename(legacyPath, path.join(this.getGroupsDir(), 'groups.legacy-backup.json')).catch(() => {});
    }
    this.groupIndexMigrated = true;
  }

  private async readGroupFile(id: string): Promise<GroupChat | null> {
    const parsed = await readJsonSafe<GroupChat | null>(path.join(this.getGroupDir(id), 'group.json'), null);
    return parsed && isRecord(parsed) && typeof parsed.id === 'string' ? parsed : null;
  }

  private async writeGroupFile(group: GroupChat): Promise<void> {
    await fs.mkdir(this.getGroupDir(group.id), { recursive: true });
    await writeFileAtomic(path.join(this.getGroupDir(group.id), 'group.json'), JSON.stringify(group, null, 2));
  }

  async listGroups(): Promise<GroupChat[]> {
    await this.migrateLegacyGroupIndex();
    const entries = await fs.readdir(this.getGroupsDir(), { withFileTypes: true }).catch(() => []);
    const groups = (
      await Promise.all(entries.filter((e) => e.isDirectory()).map((e) => this.readGroupFile(e.name)))
    ).filter((g): g is GroupChat => Boolean(g));
    return groups
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 50);
  }

  async getGroup(id: string): Promise<GroupChat | null> {
    await this.migrateLegacyGroupIndex();
    return this.readGroupFile(sanitizeSlug(id));
  }

  async createGroup(input: {
    name: string;
    memberSlugs: string[];
    topic?: string;
  }): Promise<GroupChat> {
    await this.migrateLegacyGroupIndex();
    const nowIso = new Date().toISOString();
    const group: GroupChat = {
      id: `group-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: input.name.trim().slice(0, 30) || '新群聊',
      topic: input.topic?.trim().slice(0, 120) || undefined,
      memberSlugs: Array.from(new Set(input.memberSlugs.map((s) => sanitizeSlug(s)))).slice(0, 8),
      pendingKickoff: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.writeGroupFile(group);
    return group;
  }

  async updateGroup(
    id: string,
    patch: Partial<Pick<GroupChat, 'name' | 'topic' | 'memberSlugs' | 'pendingKickoff' | 'lastMessage' | 'ambientLog'>>
  ): Promise<GroupChat | null> {
    const safeId = sanitizeSlug(id);
    await this.migrateLegacyGroupIndex();
    return this.withLock(`group:${safeId}`, async () => {
      const current = await this.readGroupFile(safeId);
      if (!current) return null;
      const next: GroupChat = { ...current, ...patch, updatedAt: new Date().toISOString() };
      await this.writeGroupFile(next);
      return next;
    });
  }

  async deleteGroup(id: string): Promise<boolean> {
    const safeId = sanitizeSlug(id);
    await this.migrateLegacyGroupIndex();
    return this.withLock(`group:${safeId}`, async () => {
      if (!(await this.readGroupFile(safeId))) return false;
      await fs.rm(this.getGroupDir(safeId), { recursive: true, force: true });
      return true;
    });
  }

  async getGroupConversation(id: string, limit = 100): Promise<ConversationMessage[]> {
    const messages = await readJsonSafe<ConversationMessage[]>(
      path.join(this.getGroupDir(id), 'conversations.json'),
      []
    );
    const list = Array.isArray(messages) ? messages : [];
    return limit > 0 ? list.slice(-limit) : list;
  }

  private async writeGroupConversationFile(id: string, messages: ConversationMessage[]): Promise<void> {
    const dir = this.getGroupDir(id);
    await fs.mkdir(dir, { recursive: true });
    await writeFileAtomic(
      path.join(dir, 'conversations.json'),
      JSON.stringify(messages.slice(-300), null, 2),
      'utf-8'
    );
  }

  async saveGroupConversation(id: string, messages: ConversationMessage[]): Promise<void> {
    return this.withLock(`group-conv:${sanitizeSlug(id)}`, () =>
      this.writeGroupConversationFile(id, messages)
    );
  }

  /** 在锁内修改群聊里的一条消息（生图回写等） */
  async updateGroupMessage(
    id: string,
    messageId: string,
    mutator: (msg: ConversationMessage) => ConversationMessage
  ): Promise<ConversationMessage | null> {
    return this.withLock(`group-conv:${sanitizeSlug(id)}`, async () => {
      const list = await this.getGroupConversation(id, 0);
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return null;
      list[idx] = mutator(list[idx]);
      await this.writeGroupConversationFile(id, list);
      return list[idx];
    });
  }

  async appendGroupMessages(
    id: string,
    newMessages: ConversationMessage[]
  ): Promise<ConversationMessage[]> {
    return this.withLock(`group-conv:${sanitizeSlug(id)}`, async () => {
      const existing = await this.getGroupConversation(id, 0);
      const merged = [...existing, ...newMessages].slice(-300);
      await this.writeGroupConversationFile(id, merged);
      return merged;
    });
  }
}

export const storageRepo = new UnifiedStorageRepository(
  EXES_DIR,
  path.dirname(SETTINGS_FILE)
);
