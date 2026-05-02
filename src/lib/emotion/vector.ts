import { EmotionVector } from './types';

export const EMOTION_VOCABULARY = {
  positive: ['开心', '兴奋', '满足', '安心', '感动', '期待', '撒娇', '甜蜜', '得意', '温柔'],
  negative: ['生气', '难过', '失望', '焦虑', '委屈', '吃醋', '烦躁', '冷漠', '伤心', '愤怒'],
  neutral: ['平静', '无聊', '好奇', '思考', '发呆', '淡然', '无所谓'],
};

const EMOTION_MAPPING: Array<{ pad: [number, number, number]; emotion: string }> = [
  { pad: [0.8, 0.7, 0.6], emotion: '开心' },
  { pad: [0.9, 0.9, 0.7], emotion: '兴奋' },
  { pad: [0.6, 0.3, 0.5], emotion: '满足' },
  { pad: [0.5, 0.2, 0.6], emotion: '安心' },
  { pad: [0.7, 0.5, 0.4], emotion: '感动' },
  { pad: [0.6, 0.8, 0.5], emotion: '期待' },
  { pad: [0.7, 0.6, 0.3], emotion: '撒娇' },
  { pad: [0.8, 0.4, 0.5], emotion: '甜蜜' },
  { pad: [-0.8, 0.8, 0.7], emotion: '生气' },
  { pad: [-0.7, 0.3, 0.3], emotion: '难过' },
  { pad: [-0.6, 0.5, 0.4], emotion: '失望' },
  { pad: [-0.5, 0.7, 0.4], emotion: '焦虑' },
  { pad: [-0.7, 0.4, 0.3], emotion: '委屈' },
  { pad: [-0.6, 0.6, 0.5], emotion: '吃醋' },
  { pad: [-0.7, 0.7, 0.6], emotion: '烦躁' },
  { pad: [-0.3, 0.2, 0.4], emotion: '冷漠' },
  { pad: [0.0, 0.2, 0.5], emotion: '平静' },
  { pad: [0.1, 0.1, 0.4], emotion: '无聊' },
  { pad: [0.3, 0.6, 0.5], emotion: '好奇' },
];

export function createDefaultEmotionVector(): EmotionVector {
  return {
    pleasure: 0.3,
    arousal: 0.3,
    dominance: 0.5,
    primary: '平静',
    secondary: '',
    blend: 0,
    intensity: 0.5,
    peakIntensity: 0.5,
    duration: 0,
    decayRate: 0.1,
    appraisal: {
      novelty: 0.5,
      pleasantness: 0.3,
      goalRelevance: 0.5,
      copingPotential: 0.6,
      normCompatibility: 0.7,
    },
  };
}

export function mapPADToEmotion(pleasure: number, arousal: number, dominance: number): string {
  let closestEmotion = '平静';
  let closestDistance = Infinity;

  for (const mapping of EMOTION_MAPPING) {
    const distance = Math.sqrt(
      Math.pow(pleasure - mapping.pad[0], 2) +
      Math.pow(arousal - mapping.pad[1], 2) +
      Math.pow(dominance - mapping.pad[2], 2)
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestEmotion = mapping.emotion;
    }
  }

  return closestEmotion;
}

export function emotionSimilarity(a: EmotionVector, b: EmotionVector): number {
  const padDistance = Math.sqrt(
    Math.pow(a.pleasure - b.pleasure, 2) +
    Math.pow(a.arousal - b.arousal, 2) +
    Math.pow(a.dominance - b.dominance, 2)
  );

  return 1 - padDistance / Math.sqrt(3);
}

export function cloneEmotionVector(vector: EmotionVector): EmotionVector {
  return {
    ...vector,
    appraisal: { ...vector.appraisal },
  };
}

export function clampEmotionVector(vector: EmotionVector): EmotionVector {
  return {
    ...vector,
    pleasure: Math.max(-1, Math.min(1, vector.pleasure)),
    arousal: Math.max(0, Math.min(1, vector.arousal)),
    dominance: Math.max(0, Math.min(1, vector.dominance)),
    intensity: Math.max(0, Math.min(1, vector.intensity)),
    blend: Math.max(0, Math.min(1, vector.blend)),
    decayRate: Math.max(0, Math.min(1, vector.decayRate)),
  };
}
