import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email?: string;
  passwordHash: string;
  inviteCodeId?: mongoose.Types.ObjectId;
  role: 'user' | 'admin';
  settings: {
    llmProvider: string;
    apiKeyEncrypted?: string;
    theme: 'light' | 'dark';
    language: string;
  };
  quota: {
    dailyRequests: number;
    usedToday: number;
    lastReset: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    inviteCodeId: {
      type: Schema.Types.ObjectId,
      ref: 'InviteCode',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    settings: {
      llmProvider: { type: String, default: 'openai' },
      apiKeyEncrypted: { type: String },
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      language: { type: String, default: 'zh-CN' },
    },
    quota: {
      dailyRequests: { type: Number, default: 100 },
      usedToday: { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
