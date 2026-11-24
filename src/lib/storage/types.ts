import type { PersonaSpec } from '@/lib/persona/spec';

export type PersonaMode = 'authentic' | 'fun' | 'companion' | 'analytical';

export interface PersonaProfile {
  mbti?: string;
  zodiac?: string;
  attachment?: string;
  duration?: string;
  howMet?: string;
  breakupTime?: string;
  occupation?: string;
  personalityTags: string[];
  avatarEmoji?: string;
  avatarShape?: string;
  avatarColor?: string;
  avatarImage?: string;
  accentColor?: string;
  appearanceAnchor?: string;
  appearanceAnchorLocked?: boolean;
  referenceImageUrl?: string;
  bio?: string;
}

export interface PersonaEmotionSnapshot {
  primary: string;
  pleasure: number;
  arousal: number;
  dominance: number;
  intensity: number;
  moodLabel?: string;
  lastUpdated: string;
  decayRate: number;
}

export interface CorrectionItem {
  id: string;
  timestamp: string;
  userInput: string;
  botResponse: string;
  correction: string;
  category: 'style' | 'emotion' | 'fact' | 'general';
}

export interface PersonaRecord {
  slug: string;
  name: string;
  version: string;
  isPreset?: boolean;
  isMaster?: boolean;
  defaultMode: PersonaMode;
  profile: PersonaProfile;
  personaMd: string;
  memoriesMd: string;
  aiProfileMd: string;
  emotionState: PersonaEmotionSnapshot;
  intimacy: number;
  corrections: CorrectionItem[];
  /** 结构化人格规格：本人风格指纹、性格特质与习得条目（persona.md 的 6/7/纠偏小节由它渲染） */
  spec?: PersonaSpec;
  /** 自进化游标（持久化，重启不丢） */
  evolution?: PersonaEvolutionState;
  /** 关系账本：好感度每日增量上限与冷落衰减依据 */
  relationship?: PersonaRelationshipState;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaEvolutionState {
  lastEvolvedUserTurn: number;
  lastEvolvedAt?: string;
  /** 上次整理后累计的负面/显式反馈信号数，用于信号驱动触发 */
  pendingSignals?: number;
}

export interface PersonaRelationshipState {
  /** 记账日期 YYYY-MM-DD（本地时区） */
  ledgerDate: string;
  /** 当天累计净增好感 */
  gainedToday: number;
  lastChatAt?: string;
}

export type SnapshotKind = 'manual' | 'auto';

export interface PersonaSummary {
  slug: string;
  name: string;
  version: string;
  isPreset: boolean;
  isMaster?: boolean;
  defaultMode: PersonaMode;
  profile: PersonaProfile;
  emotionState: PersonaEmotionSnapshot;
  intimacy: number;
  lastMessage?: string;
  lastActive: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterBotReport {
  slug: string;
  name: string;
  shape?: string;
  color?: string;
  summary: string;
  timestamp: string;
}

export interface SearchResultItem {
  title: string;
  snippet: string;
  url?: string;
  source: string;
}

export interface MediaCard {
  type: 'photo' | 'sticker' | 'voice';
  caption: string;
  status?: 'generating' | 'ready' | 'error';
  imageUrl?: string;
  prompt?: string;
  model?: string;
  errorHint?: string;
  durationSec?: number;
  mood?: string;
}

export interface PageCardMetric {
  value: string;
  label: string;
  detail: string;
  tone?: 'neutral' | 'amber' | 'teal' | 'rose';
}

export interface PageArtifactCardData {
  id: string;
  title: string;
  subtitle: string;
  metrics: PageCardMetric[];
  statusNotice: string;
  footerLabel: string;
  fullContent?: string;
  sources?: SearchResultItem[];
}

export interface PendingFollowup {
  delaySec: number;
  content: string;
  fromBot?: {
    slug: string;
    name: string;
    shape?: string;
    color?: string;
  };
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thought?: string;
  thoughtDurationMs?: number;
  searchQuery?: string;
  searchResults?: SearchResultItem[];
  pageCard?: PageArtifactCardData;
  interBotReports?: InterBotReport[];
  fromBot?: {
    slug: string;
    name: string;
    shape?: string;
    color?: string;
  };
  isFollowup?: boolean;
  workingStatus?: string;
  mode?: PersonaMode;
  mood?: string;
  intimacyChange?: number;
  imageUrl?: string;
  mediaCards?: MediaCard[];
  bursts?: string[];
  modelUsed?: string;
  isDemoMode?: boolean;
  /** 本轮回复的风格评测结果（仅供自进化与成长面板使用，不注入 Prompt） */
  styleMetrics?: MessageStyleMetrics;
}

export interface MessageStyleMetrics {
  likeness: number;
  deAI: number;
  emojiCount: number;
  avgBubbleLen: number;
  aiClicheHits: number;
  oocHits: number;
  hostQuestion: boolean;
}

export interface RuntimeSettings {
  llmProvider: 'local_gateway' | 'xai' | 'deepseek' | 'openai' | 'ollama' | 'custom';
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  imageModel?: string;
  enableAutoSticker?: boolean;
  enableAutoPhoto?: boolean;
  searchProvider: 'builtin' | 'tavily' | 'serper';
  tavilyApiKey: string;
  serperApiKey: string;
  defaultThinkMode: boolean;
  defaultDeepSearch: boolean;
  autoVoicePlayback: boolean;
  theme: 'dark' | 'light';
}

export interface PersonaSnapshot {
  id: string;
  createdAt: string;
  /** manual：用户手动/安全备份（独立配额，不被自动快照挤掉）；auto：自进化自动存档 */
  kind?: SnapshotKind;
  reason: string;
  summary?: string;
  personaMd: string;
  memoriesMd: string;
  aiProfileMd: string;
  profile: PersonaProfile;
  corrections: CorrectionItem[];
  intimacy: number;
  emotionState: PersonaEmotionSnapshot;
  spec?: PersonaSpec;
}

export interface PersonaSnapshotMeta {
  id: string;
  createdAt: string;
  kind: SnapshotKind;
  reason: string;
  summary?: string;
  intimacy: number;
  memoriesLength: number;
  personaLength: number;
  correctionsCount: number;
}

export interface PersonaSoulBundle {
  schemaVersion: 1;
  exportedAt: string;
  persona: PersonaRecord;
  conversations: ConversationMessage[];
  snapshots?: PersonaSnapshot[];
}

export interface MomentComment {
  id: string;
  authorName: string;
  authorSlug?: string;
  isUser: boolean;
  content: string;
  replyToName?: string;
  createdAt: string;
}

export type MomentTopic =
  | 'travel'
  | 'scenery'
  | 'food'
  | 'selfie'
  | 'daily'
  | 'night';

export interface MomentPost {
  id: string;
  authorSlug: string;
  authorName: string;
  content: string;
  images: string[];
  imageCaptions?: string[];
  location?: string;
  mood?: string;
  topic?: MomentTopic;
  likedByUser: boolean;
  likes: string[];
  comments: MomentComment[];
  createdAt: string;
}
