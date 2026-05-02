export interface EmotionVector {
  pleasure: number;
  arousal: number;
  dominance: number;

  primary: string;
  secondary: string;
  blend: number;

  intensity: number;
  peakIntensity: number;
  duration: number;
  decayRate: number;

  appraisal: Appraisal;
  lastUpdated?: Date;
}

export interface Appraisal {
  novelty: number;
  pleasantness: number;
  goalRelevance: number;
  copingPotential: number;
  normCompatibility: number;
}

export interface EmotionalEvent {
  type: 'message' | 'action' | 'time_pass' | 'correction';
  content: string;
  sender: 'user' | 'persona';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface EmotionState {
  current: EmotionVector;
  history: EmotionHistoryEntry[];
  baseline: PersonalityTraits;
}

export interface EmotionHistoryEntry {
  timestamp: Date;
  event: string;
  emotion: EmotionVector;
  context: string;
}

export interface PersonalityTraits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;

  emotionalStability: number;
  emotionalRange: number;
  recoveryRate: number;

  emotionVocabulary: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };

  recoveryPatterns: Record<string, RecoveryPattern>;
}

export interface RecoveryPattern {
  description: string;
  decayRate: number;
  triggers: string[];
  timeToRecover: number;
}

export interface EmotionalExpression {
  tone: string;
  wordChoice: string[];
  particles: string[];
  emojis: string[];
  responseLength: 'short' | 'medium' | 'long';
  responseDelay: number;
}

export interface EmotionTransition {
  from: EmotionVector;
  to: EmotionVector;
  probability: number;
  trigger: string;
  duration: number;
}

export interface EmotionalMemory {
  id: string;
  event: string;
  emotion: EmotionVector;
  intensity: number;
  valence: number;
  timestamp: Date;
  context: string;
  associations: string[];
  accessibility: number;
  consolidation: number;
}
