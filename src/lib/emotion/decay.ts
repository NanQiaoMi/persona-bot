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

  // 高神经质情绪消散更慢，高情绪稳定度消散更快更平稳；且正时间间隔下绝不反向放大强度
  const lingerFactor = Math.max(
    0.65,
    Math.min(1.25, 1 + personality.neuroticism * 0.22 - personality.emotionalStability * 0.22)
  );

  const rawIntensity =
    (exponentialDecay * 0.6 + linearDecay * 0.4) *
    (1 + circadianFactor) *
    lingerFactor;

  decayed.intensity =
    timeDelta > 0
      ? Math.max(0, Math.min(current.intensity, rawIntensity))
      : Math.max(0, Math.min(1, rawIntensity));
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
  personality: PersonalityTraits,
  options?: { isSulking?: boolean }
): EmotionVector {
  const recoveryRate = personality.recoveryRate * 0.1;

  // 中性基线由角色外向度与神经质决定（不再硬编码 +0.2 强制拉正负情绪）
  const baselinePleasure = Number(
    ((personality.extraversion - 0.5) * 0.12 - (personality.neuroticism - 0.5) * 0.12).toFixed(3)
  );
  const baseline = {
    pleasure: baselinePleasure,
    arousal: 0.3,
    dominance: 0.5,
  };

  // 闹别扭期间暂停把负向愉悦度往正向拉，恢复权交给哄好状态机
  const nextPleasure =
    options?.isSulking && emotion.pleasure < 0
      ? emotion.pleasure
      : emotion.pleasure + (baseline.pleasure - emotion.pleasure) * recoveryRate;

  return {
    ...emotion,
    pleasure: nextPleasure,
    arousal: emotion.arousal + (baseline.arousal - emotion.arousal) * recoveryRate,
    dominance: emotion.dominance + (baseline.dominance - emotion.dominance) * recoveryRate,
  };
}

export function evolveEmotion(
  current: EmotionVector,
  timeDelta: number,
  personality: PersonalityTraits,
  options?: { isSulking?: boolean }
): EmotionVector {
  let evolved = naturalDecay(current, timeDelta, personality);
  evolved = applyInertia(current, evolved, personality);
  evolved = applyFluctuation(evolved, personality);
  evolved = applyRecovery(evolved, personality, options);
  evolved.primary = mapPADToEmotion(evolved.pleasure, evolved.arousal, evolved.dominance);
  return clampEmotionVector(evolved);
}
