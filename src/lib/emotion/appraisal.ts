import { Appraisal, EmotionalEvent, PersonalityTraits, EmotionVector } from './types';

export function assessNovelty(event: EmotionalEvent, history: EmotionVector[]): number {
  if (history.length === 0) return 0.8;

  const recentEmotions = history.slice(-5);
  const avgPleasure =
    recentEmotions.reduce((sum, e) => sum + e.pleasure, 0) / recentEmotions.length;
  const avgArousal =
    recentEmotions.reduce((sum, e) => sum + e.arousal, 0) / recentEmotions.length;

  const typeNovelty = event.type === 'correction' ? 0.9 : 0.5;

  return Math.min(1, typeNovelty * 0.6 + Math.abs(avgPleasure) * 0.2 + avgArousal * 0.2);
}

export function assessPleasantness(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  let pleasantness = 0;

  const positiveWords = ['喜欢', '爱', '开心', '想你', '好的', '嗯嗯', '哈哈'];
  const negativeWords = ['讨厌', '烦', '滚', '分手', '不开心', '生气', '无聊'];

  const content = event.content.toLowerCase();

  for (const word of positiveWords) {
    if (content.includes(word)) pleasantness += 0.2;
  }

  for (const word of negativeWords) {
    if (content.includes(word)) pleasantness -= 0.2;
  }

  pleasantness *= 1 - personality.neuroticism * 0.3;

  return Math.max(-1, Math.min(1, pleasantness));
}

export function assessGoalRelevance(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  let relevance = 0.5;

  if (event.type === 'message' && event.sender === 'user') {
    relevance = 0.7;
  }

  if (event.type === 'correction') {
    relevance = 0.9;
  }

  if (personality.extraversion > 0.7) {
    relevance *= 1.2;
  }

  return Math.min(1, relevance);
}

export function assessCopingPotential(
  event: EmotionalEvent,
  personality: PersonalityTraits,
  context: { timeSinceLastChat?: number; relationshipDuration?: number }
): number {
  let potential = 0.5;

  potential += personality.emotionalStability * 0.3;
  potential += personality.agreeableness * 0.2;

  if (context.relationshipDuration) {
    potential += Math.min(0.2, (context.relationshipDuration / 365) * 0.1);
  }

  return Math.min(1, potential);
}

export function assessNormCompatibility(
  event: EmotionalEvent,
  personality: PersonalityTraits
): number {
  let compatibility = 0.7;

  if (personality.openness > 0.7) {
    compatibility += 0.2;
  }

  if (personality.conscientiousness > 0.7) {
    compatibility -= 0.1;
  }

  return Math.max(0, Math.min(1, compatibility));
}

export function appraiseEvent(
  event: EmotionalEvent,
  personality: PersonalityTraits,
  history: EmotionVector[],
  context: Record<string, any> = {}
): Appraisal {
  return {
    novelty: assessNovelty(event, history),
    pleasantness: assessPleasantness(event, personality),
    goalRelevance: assessGoalRelevance(event, personality),
    copingPotential: assessCopingPotential(event, personality, context),
    normCompatibility: assessNormCompatibility(event, personality),
  };
}

export function appraisalToEmotion(
  appraisal: Appraisal,
  personality: PersonalityTraits
): Partial<EmotionVector> {
  const valence = appraisal.pleasantness * 0.7 + appraisal.goalRelevance * 0.3;
  const arousal = appraisal.novelty * 0.5 + appraisal.goalRelevance * 0.5;
  const dominance = appraisal.copingPotential;

  const intensity =
    appraisal.novelty * 0.2 +
    Math.abs(appraisal.pleasantness) * 0.3 +
    appraisal.goalRelevance * 0.3 +
    appraisal.copingPotential * 0.2;

  return {
    pleasure: valence,
    arousal: Math.min(1, arousal),
    dominance: Math.min(1, dominance),
    intensity: Math.min(1, intensity),
    appraisal,
  };
}
