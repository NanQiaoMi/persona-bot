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
  /** 主人亲手写的一句话性格（创建时填，之后可在资料库改），每次聊天都会带进人设 */
  basicPersonality?: string;
  referenceImageUrl?: string;
  bio?: string;
}

export interface SulkingState {
  level: 1 | 2 | 3;
  reason: string;
  remainingTurns: number;
  since: string;
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
  sulking?: SulkingState;
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
  /** 照片 / 表情包：已经尝试生成的次数（自动最多 3 次，手动重试从头算） */
  attempts?: number;
  /** 最近一次开始生成的时间 */
  lastAttemptAt?: string;
  /** 失败后下一次自动重试的时间；次数用完时为空 */
  nextRetryAt?: string;
  /** 生图服务暂时连不上，等恢复后自动补发 */
  waitingForNetwork?: boolean;
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
  /** 主 bot 发起群聊后在主频道留下的入群卡片 */
  groupInvite?: GroupInviteCard;
  /** 主 bot 在对话里帮你建好的新 Bot */
  botCreated?: BotCreatedCard;
  /** 群聊：引用回复的那条消息 */
  quote?: MessageQuote;
  /** 群聊：系统提示（如「夏柚 拍了拍 鹿汐」），居中显示，不算任何人的发言 */
  systemTip?: boolean;
  /** 群聊：角色自己聊起来的消息；catchup 表示「你不在时」补上的 */
  ambient?: 'idle' | 'catchup';
}

export interface MessageQuote {
  id: string;
  name: string;
  text: string;
}

export interface BotCreatedCard {
  slug: string;
  name: string;
  personality?: string;
  appearance?: string;
  shape?: string;
  color?: string;
  /** 在群里建的：已经拉进了这个群 */
  joinedGroupId?: string;
}

export interface GroupInviteCard {
  groupId: string;
  name: string;
  memberNames: string[];
  topic?: string;
}

/** 主 bot 发起的多角色群聊 */
export interface GroupChat {
  id: string;
  name: string;
  topic?: string;
  memberSlugs: string[];
  /** 群聊刚建好、还没有角色开口时为 true，前端进群后自动请主 bot 开场 */
  pendingKickoff?: boolean;
  lastMessage?: string;
  /** 最近几次角色自己聊起来的时间（ISO），用于冷却与每小时上限 */
  ambientLog?: string[];
  /** 列表接口附带（不存盘）：最后一条时间，以及相对你看过的最后一条之后的未读数 */
  lastMessageAt?: string;
  lastMessageId?: string;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
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

export type SceneAssetCategory = 'room' | 'location' | 'environment';

export interface SceneAsset {
  id: string;
  name: string;
  category: SceneAssetCategory;
  imageUrl: string;
  description: string;
  keywords: string[];
  createdAt: string;
}

/** 每个角色与用户的长对话记忆：滚动摘要 + 待跟进的事（存在角色目录的 memory-state.json） */
export interface ConversationMemoryState {
  summary?: import('@/lib/persona/conversation-summary').ConversationSummaryState;
  pendingTopics?: import('@/lib/persona/pending-topics').PendingTopic[];
}

/** 世界设定：角色生活里反复出现的地点、物品、宠物、人物（自动从聊天/朋友圈/照片里归纳） */
export type WorldEntryKind = 'place' | 'object' | 'pet' | 'person';
/** candidate：待你确认；confirmed：已收录（会用于聊天与拍照）；dismissed：你忽略过，不再提示 */
export type WorldEntryStatus = 'candidate' | 'confirmed' | 'dismissed';

export interface WorldEntrySource {
  type: 'chat' | 'moment' | 'photo' | 'manual';
  snippet: string;
  at: string;
}

export interface WorldEntry {
  id: string;
  kind: WorldEntryKind;
  name: string;
  description: string;
  keywords: string[];
  status: WorldEntryStatus;
  /** 被提到的次数（不同轮次累计），达到阈值自动收录 */
  mentionCount: number;
  sources: WorldEntrySource[];
  /** 地点的参考照片（在这里拍的第一张照片），并同步成固定场景资产 */
  imageUrl?: string;
  sceneAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorldState {
  entries: WorldEntry[];
  /** 上次归纳到的消息 id，下次只看之后的新消息 */
  lastExtractedMessageId?: string;
  lastExtractedAt?: string;
}
