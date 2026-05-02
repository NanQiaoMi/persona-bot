import { EmotionVector, PersonalityTraits } from './types';
import { cloneEmotionVector, clampEmotionVector, mapPADToEmotion } from './vector';

export function naturalDecay(
  current: EmotionVector,
  timeDelta: number,
  personality: PersonalityTraits
): EmotionVector {
  const decayed = cloneEmotionVector(current);

  const exponentialDecay = current.intensity * Math.exp(-current.decayRate * timeDelta);
  const linearDecay = Math.max(0, current.intensity - 0.05 * timeDelta);

  const hourOfDay = new Date().getHours();
  const circadianFactor = 0.05 * Math.sin((2 * Math.PI * hourOfDay) / 24);

  const neuroticismFactor = personality.neuroticism * 0.2;
  const stabilityFactor = personality.emotionalStability * 0.3;

  const finalIntensity =
    (exponentialDecay * 0.6 + linearDecay * 0.4) *
    (1 + circadianFactor) *
    (1 - neuroticismFactor + stabilityFactor);

  decayed.intensity = Math.max(0, Math.min(1, finalIntensity));
  decayed.duration = current.duration + timeDelta * 60;

  const pleasureDecayRate = 0.1 * timeDelta;
  if (decayed.pleasure > 0) {
    decayed.pleasure = Math.max(0, decayed.pleasure - pleasureDecayRate);
  } else {
    decayed.pleasure = Math.min(0, decayed.pleasure + pleasureDecayRate);
  }

  const baselineArousal = 0.3;
  const arousalDecayRate = 0.15 * timeDelta;
  if (decayed.arousal > baselineArousal) {
    decayed.arousal = Math.max(baselineArousal, decayed.arousal - arousalDecayRate);
  } else {
    decayed.arousal = Math.min(baselineArousal, decayed.arousal + arousalDecayRate);
  }

  decayed.primary = mapPADToEmotion(decayed.pleasure, decayed.arousal, decayed.dominance);

  return clampEmotionVector(decayed);
}

export function applyInertia(
  previous: EmotionVector,
  current: EmotionVector,
  personality: PersonalityTraits
): EmotionVector {
  const inertiaFactor = personality.emotionalStability * 0.6 + 0.2;

  return {
    ...current,
    pleasure: previous.pleasure * inertiaFactor + current.pleasure * (1 - inertiaFactor),
    arousal: previous.arousal * inertiaFactor + current.arousal * (1 - inertiaFactor),
    dominance: previous.dominance * inertiaFactor + current.dominance * (1 - inertiaFactor),
    intensity: previous.intensity * inertiaFactor + current.intensity * (1 - inertiaFactor),
  };
}

export function applyFluctuation(
  emotion: EmotionVector,
  personality: PersonalityTraits
): EmotionVector {
  const fluctuationMagnitude = personality.neuroticism * 0.08;
  const rangeFactor = personality.emotionalRange * 0.5 + 0.5;

  const fluctuation = {
    pleasure: (Math.random() - 0.5) * fluctuationMagnitude * rangeFactor,
    arousal: (Math.random() - 0.5) * fluctuationMagnitude * 0.5 * rangeFactor,
    dominance: (Math.random() - 0.5) * fluctuationMagnitude * 0.3 * rangeFactor,
  };

  return {
    ...emotion,
    pleasure: emotion.pleasure + fluctuation.pleasure,
    arousal: emotion.arousal + fluctuation.arousal,
    dominance: emotion.dominance + fluctuation.dominance,
  };
}

export function applyRecovery(
  emotion: EmotionVector,
  personality: PersonalityTraits
): EmotionVector {
  const recoveryRate = personality.recoveryRate * 0.1;

  const baseline = {
    pleasure: 0.2,
    arousal: 0.3,
    dominance: 0.5,
  };

  return {
    ...emotion,
    pleasure: emotion.pleasure + (baseline.pleasure - emotion.pleasure) * recoveryRate,
    arousal: emotion.arousal + (baseline.arousal - emotion.arousal) * recoveryRate,
    dominance: emotion.dominance + (baseline.dominance - emotion.dominance) * recoveryRate,
  };
}

export function evolveEmotion(
  current: EmotionVector,
  timeDelta: number,
  personality: PersonalityTraits
): EmotionVector {
  let evolved = naturalDecay(current, timeDelta, personality);
  evolved = applyInertia(current, evolved, personality);
  evolved = applyFluctuation(evolved, personality);
  evolved = applyRecovery(evolved, personality);
  evolved.primary = mapPADToEmotion(evolved.pleasure, evolved.arousal, evolved.dominance);
  return clampEmotionVector(evolved);
}
