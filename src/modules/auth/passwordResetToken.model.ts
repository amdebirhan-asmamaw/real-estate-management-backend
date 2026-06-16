import { Schema, model, Document, Types } from "mongoose";

export interface IPasswordResetToken extends Document {
  user: Types.ObjectId;
  // sha-256 of the raw reset token. The raw token is only sent by email.
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

// MongoDB removes expired reset tokens automatically once `expiresAt` passes.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = model<IPasswordResetToken>(
  "PasswordResetToken",
  passwordResetTokenSchema,
);
