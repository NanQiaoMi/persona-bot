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
  accentColor?: string;
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
  defaultMode: PersonaMode;
  profile: PersonaProfile;
  personaMd: string;
  memoriesMd: string;
  aiProfileMd: string;
  emotionState: PersonaEmotionSnapshot;
  intimacy: number;
  corrections: CorrectionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonaSummary {
  slug: string;
  name: string;
  version: string;
  isPreset: boolean;
  defaultMode: PersonaMode;
  profile: PersonaProfile;
  emotionState: PersonaEmotionSnapshot;
  intimacy: number;
  lastMessage?: string;
  lastActive: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResultItem {
  title: string;
  snippet: string;
  url?: string;
  source: string;
}

export interface MediaCard {
  type: 'photo' | 'voice';
  caption: string;
  durationSec?: number;
  mood?: string;
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
  mode?: PersonaMode;
  mood?: string;
  intimacyChange?: number;
  imageUrl?: string;
  mediaCards?: MediaCard[];
  bursts?: string[];
  isDemoMode?: boolean;
}

export interface RuntimeSettings {
  llmProvider: 'xai' | 'deepseek' | 'openai' | 'ollama' | 'custom';
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  searchProvider: 'builtin' | 'tavily' | 'serper';
  tavilyApiKey: string;
  serperApiKey: string;
  defaultThinkMode: boolean;
  defaultDeepSearch: boolean;
  autoVoicePlayback: boolean;
  theme: 'dark' | 'light';
}
