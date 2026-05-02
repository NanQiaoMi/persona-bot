import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  userId: mongoose.Types.ObjectId;
  personaId: mongoose.Types.ObjectId;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: {
      mood?: string;
      intimacyChange?: number;
      emotionState?: object;
    };
  }>;
  lastActivity: Date;
  createdAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    personaId: {
      type: Schema.Types.ObjectId,
      ref: 'Persona',
      required: true,
      index: true,
    },
    messages: [{
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      metadata: {
        mood: String,
        intimacyChange: Number,
        emotionState: Schema.Types.Mixed,
      },
    }],
    lastActivity: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

ConversationSchema.index({ userId: 1, personaId: 1 });
ConversationSchema.index({ lastActivity: -1 });

export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', ConversationSchema);
export default Conversation;
