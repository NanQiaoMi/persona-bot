import mongoose, { Schema, Document } from 'mongoose';

export interface IPersona extends Document {
  userId: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  version: string;
  profile: {
    duration?: string;
    howMet?: string;
    breakupTime?: string;
    occupation?: string;
    mbti?: string;
    zodiac?: string;
    attachment?: string;
    personalityTags: string[];
    impression?: string;
    enhancedProfile?: string;
  };
  personaMd: string;
  memoriesMd: string;
  skillMd: string;
  emotionState: {
    primaryEmotion: string;
    intensity: number;
    valence: number;
    arousal: number;
    dominance: number;
    lastUpdated: Date;
    decayRate: number;
  };
  emotionHistory: Array<{
    timestamp: Date;
    event: string;
    emotion: string;
    intensity: number;
    context: string;
  }>;
  corrections: Array<{
    timestamp: Date;
    userInput: string;
    botResponse: string;
    correction: string;
    category: string;
  }>;
  knowledgeSources: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

const PersonaSchema = new Schema<IPersona>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: String,
      default: 'v1',
    },
    profile: {
      duration: String,
      howMet: String,
      breakupTime: String,
      occupation: String,
      mbti: String,
      zodiac: String,
      attachment: String,
      personalityTags: [String],
      impression: String,
      enhancedProfile: String,
    },
    personaMd: { type: String, default: '' },
    memoriesMd: { type: String, default: '' },
    skillMd: { type: String, default: '' },
    emotionState: {
      primaryEmotion: { type: String, default: '平静' },
      intensity: { type: Number, default: 0.5 },
      valence: { type: Number, default: 0 },
      arousal: { type: Number, default: 0.3 },
      dominance: { type: Number, default: 0.5 },
      lastUpdated: { type: Date, default: Date.now },
      decayRate: { type: Number, default: 0.1 },
    },
    emotionHistory: [{
      timestamp: Date,
      event: String,
      emotion: String,
      intensity: Number,
      context: String,
    }],
    corrections: [{
      timestamp: { type: Date, default: Date.now },
      userInput: String,
      botResponse: String,
      correction: String,
      category: String,
    }],
    knowledgeSources: [Schema.Types.Mixed],
  },
  {
    timestamps: true,
  }
);

PersonaSchema.index({ userId: 1, slug: 1 }, { unique: true });

export const Persona = mongoose.models.Persona || mongoose.model<IPersona>('Persona', PersonaSchema);
export default Persona;
