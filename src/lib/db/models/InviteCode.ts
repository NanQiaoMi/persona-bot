import mongoose, { Schema, Document } from 'mongoose';

export interface IInviteCode extends Document {
  code: string;
  createdBy: mongoose.Types.ObjectId;
  usedBy: mongoose.Types.ObjectId[];
  maxUses: number;
  currentUses: number;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
}

const InviteCodeSchema = new Schema<IInviteCode>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    usedBy: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    maxUses: {
      type: Number,
      default: 10,
    },
    currentUses: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const InviteCode = mongoose.models.InviteCode || mongoose.model<IInviteCode>('InviteCode', InviteCodeSchema);
export default InviteCode;
