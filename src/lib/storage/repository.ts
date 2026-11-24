import fs from 'fs/promises';
import path from 'path';
import { BUILTIN_PRESETS } from '@/lib/persona/presets';
import {
  ConversationMessage,
  CorrectionItem,
  PersonaEmotionSnapshot,
  PersonaMode,
  PersonaRecord,
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
    const summaries: PersonaSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const persona = await this.getPersona(entry.name);
      if (!persona) continue;

      const conv = await this.getConversation(entry.name);
      const lastMsg = conv[conv.length - 1];

      summaries.push({
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
      });
    }

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
