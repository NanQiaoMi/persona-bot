import { EmotionVector, PersonalityTraits, EmotionalEvent, EmotionState } from './types';
import { createDefaultEmotionVector, mapPADToEmotion, clampEmotionVector } from './vector';
import { appraiseEvent, appraisalToEmotion } from './appraisal';
import { evolveEmotion, applyInertia } from './decay';

export class EmotionEngine {
  private state: EmotionState;
  private personality: PersonalityTraits;

  constructor(personality: PersonalityTraits, initialState?: EmotionVector) {
    this.personality = personality;
    this.state = {
      current: initialState || createDefaultEmotionVector(),
      history: [],
      baseline: personality
    };
  }

  getCurrentState(): EmotionVector {
    return { ...this.state.current };
  }

  processEvent(event: EmotionalEvent): EmotionVector {
    const appraisal = appraiseEvent(
      event,
      this.personality,
      this.state.history.map(h => h.emotion),
      {}
    );

    const newEmotion = appraisalToEmotion(appraisal, this.personality);

    const previousState = { ...this.state.current };
    this.state.current = {
      ...this.state.current,
      ...newEmotion,
      primary: mapPADToEmotion(
        newEmotion.pleasure || this.state.current.pleasure,
        newEmotion.arousal || this.state.current.arousal,
        newEmotion.dominance || this.state.current.dominance
      ),
      lastUpdated: new Date()
    };

    this.state.current = applyInertia(
      previousState,
      this.state.current,
      this.personality
    );

    this.state.current = clampEmotionVector(this.state.current);

    this.state.history.push({
      timestamp: new Date(),
      event: event.content,
      emotion: { ...this.state.current },
      context: `${event.type} from ${event.sender}`
    });

    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(-50);
    }

    return this.getCurrentState();
  }

  evolveByTime(hoursElapsed: number): EmotionVector {
    this.state.current = evolveEmotion(
      this.state.current,
      hoursElapsed,
      this.personality
    );

    return this.getCurrentState();
  }

  getEmotionDescription(): string {
    const emotion = this.state.current;
    const intensity = Math.round(emotion.intensity * 100);
    
    let description = `当前情绪：${emotion.primary}`;
    
    if (intensity > 70) {
      description += '（非常强烈）';
    } else if (intensity > 40) {
      description += '（中等强度）';
    } else {
      description += '（轻微）';
    }

    if (emotion.pleasure > 0.3) {
      description += '，态度积极友好';
    } else if (emotion.pleasure < -0.3) {
      description += '，态度消极冷淡';
    } else {
      description += '，态度中性';
    }

    return description;
  }

  toJSON(): Record<string, unknown> {
    return {
      current: this.state.current,
      historyLength: this.state.history.length,
      lastUpdated: this.state.current.lastUpdated
    };
  }

  static fromJSON(json: Record<string, unknown>, personality: PersonalityTraits): EmotionEngine {
    const engine = new EmotionEngine(personality, json.current as EmotionVector);
    return engine;
  }
}

export function inferPersonalityTraits(personaMd: string): PersonalityTraits {
  const defaults: PersonalityTraits = {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    neuroticism: 0.5,
    emotionalStability: 0.5,
    emotionalRange: 0.5,
    recoveryRate: 0.5,
    emotionVocabulary: {
      positive: ['开心', '满足', '安心'],
      negative: ['生气', '难过', '失望'],
      neutral: ['平静', '无聊']
    },
    recoveryPatterns: {
      from_anger: {
        description: '需要道歉和关心',
        decayRate: 0.15,
        triggers: ['道歉', '关心'],
        timeToRecover: 2
      },
      from_sadness: {
        description: '需要陪伴和安慰',
        decayRate: 0.1,
        triggers: ['陪伴', '安慰'],
        timeToRecover: 4
      }
    }
  };

  if (!personaMd) return defaults;

  const text = personaMd.toLowerCase();

  if (text.includes('焦虑') || text.includes('情绪化') || text.includes('玻璃心')) {
    defaults.neuroticism = 0.8;
    defaults.emotionalStability = 0.3;
  }

  if (text.includes('话多') || text.includes('社交') || text.includes('外向')) {
    defaults.extraversion = 0.8;
  }

  if (text.includes('温柔') || text.includes('体贴') || text.includes('善解人意')) {
    defaults.agreeableness = 0.8;
  }

  return defaults;
}