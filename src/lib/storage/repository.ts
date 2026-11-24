import fs from 'fs/promises';
import path from 'path';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import {
  ConversationMessage,
  CorrectionItem,
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRecord,
  PersonaSnapshot,
  PersonaSnapshotMeta,
  PersonaSoulBundle,
  PersonaSummary,
  RuntimeSettings,
} from './types';

const EXES_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'exes');
const DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), '.data');
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

export class UnifiedStorageRepository {
  private baseDir: string;
  private dataDir: string;
  private seeded = false;

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
        lastMessage: lastMsg?.content?.slice(0, 80),
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
      createdAt: String(meta.createdAt || meta.created_at || now),
      updatedAt: String(meta.updatedAt || meta.updated_at || now),
    };
  }

  async savePersona(record: PersonaRecord): Promise<PersonaRecord> {
    const safeSlug = sanitizeSlug(record.slug || record.name);
    const dir = this.getPersonaDir(safeSlug);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, 'versions'), { recursive: true });

    const now = new Date().toISOString();
    const normalized: PersonaRecord = {
      ...record,
      slug: safeSlug,
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
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };

    await Promise.all([
      fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8'),
      fs.writeFile(path.join(dir, 'persona.md'), normalized.personaMd || '', 'utf-8'),
      fs.writeFile(path.join(dir, 'memories.md'), normalized.memoriesMd || '', 'utf-8'),
      fs.writeFile(path.join(dir, 'ai_profile.md'), normalized.aiProfileMd || '', 'utf-8'),
      fs.writeFile(
        path.join(dir, 'emotion.json'),
        JSON.stringify(normalized.emotionState, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(dir, 'corrections.json'),
        JSON.stringify(normalized.corrections || [], null, 2),
        'utf-8'
      ),
    ]);

    return normalized;
  }

  async deletePersona(slug: string): Promise<boolean> {
    const safeSlug = sanitizeSlug(slug);
    const dir = this.getPersonaDir(safeSlug);
    if (!(await fileExists(dir))) {
      return false;
    }
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  }

  async updateEmotionAndIntimacy(
    slug: string,
    emotionState: PersonaEmotionSnapshot,
    intimacy: number
  ): Promise<void> {
    const persona = await this.getPersona(slug);
    if (!persona) return;
    persona.emotionState = emotionState;
    persona.intimacy = Math.max(0, Math.min(100, Math.round(intimacy)));
    await this.savePersona(persona);
  }

  async addCorrection(slug: string, correction: Omit<CorrectionItem, 'id' | 'timestamp'>): Promise<PersonaRecord | null> {
    const persona = await this.getPersona(slug);
    if (!persona) return null;

    const item: CorrectionItem = {
      id: `corr_${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...correction,
    };
    persona.corrections = [...persona.corrections, item].slice(-50);

    // Also append to personaMd Correction section for immediate prompt effectiveness
    const ruleLine = `- [纠偏 ${new Date().toLocaleDateString('zh-CN')}] 避免「${item.botResponse.slice(0, 40)}」，应当：${item.correction}`;
    if (persona.personaMd.includes('## Correction 记录')) {
      persona.personaMd = persona.personaMd.replace('（暂无记录）', '').trimEnd() + `\n${ruleLine}\n`;
    } else {
      persona.personaMd = `${persona.personaMd.trimEnd()}\n\n## Correction 记录\n${ruleLine}\n`;
    }

    return this.savePersona(persona);
  }

  async getConversation(slug: string, limit = 100): Promise<ConversationMessage[]> {
    const dir = this.getPersonaDir(slug);
    const messages = await readJsonSafe<ConversationMessage[]>(
      path.join(dir, 'conversations.json'),
      []
    );
    return limit > 0 ? messages.slice(-limit) : messages;
  }

  async saveConversation(slug: string, messages: ConversationMessage[]): Promise<void> {
    const dir = this.getPersonaDir(slug);
    await fs.mkdir(dir, { recursive: true });
    const trimmed = messages.slice(-200);
    await fs.writeFile(
      path.join(dir, 'conversations.json'),
      JSON.stringify(trimmed, null, 2),
      'utf-8'
    );
  }

  async appendMessages(slug: string, newMessages: ConversationMessage[]): Promise<ConversationMessage[]> {
    const existing = await this.getConversation(slug, 0);
    const merged = [...existing, ...newMessages].slice(-200);
    await this.saveConversation(slug, merged);
    return merged;
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
    summary?: string
  ): Promise<PersonaSnapshot | null> {
    const persona = await this.getPersona(slug);
    if (!persona) return null;

    const snapDir = this.getSnapshotsDir(slug);
    await fs.mkdir(snapDir, { recursive: true });

    const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const snapshot: PersonaSnapshot = {
      id,
      createdAt: new Date().toISOString(),
      reason: reason.trim() || '自动存档',
      summary: summary?.trim() || undefined,
      personaMd: persona.personaMd,
      memoriesMd: persona.memoriesMd,
      aiProfileMd: persona.aiProfileMd,
      profile: persona.profile,
      corrections: persona.corrections || [],
      intimacy: persona.intimacy,
      emotionState: persona.emotionState,
    };

    await fs.writeFile(
      path.join(snapDir, `${id}.json`),
      JSON.stringify(snapshot, null, 2),
      'utf-8'
    );

    const all = await this.readSnapshotFiles(slug);
    if (all.length > 10) {
      await Promise.all(
        all.slice(10).map((old) =>
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

    const persona = await this.getPersona(slug);
    if (!persona) return null;

    const snapPath = path.join(this.getSnapshotsDir(slug), `${snapshotId}.json`);
    const snap = await readJsonSafe<PersonaSnapshot | null>(snapPath, null);
    if (!snap) return null;

    await this.createSnapshot(
      slug,
      '回滚前自动备份',
      `回滚至 ${new Date(snap.createdAt).toLocaleString('zh-CN')} (${snap.reason})`
    );

    const restored: PersonaRecord = {
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
      updatedAt: new Date().toISOString(),
    };

    return this.savePersona(restored);
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
    await fs.writeFile(targetPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }
}

export const storageRepo = new UnifiedStorageRepository(
  EXES_DIR,
  path.dirname(SETTINGS_FILE)
);
