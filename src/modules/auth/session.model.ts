import { Schema, model, Document, Types } from "mongoose";

export interface IRefreshSession extends Document {
  user: Types.ObjectId;
  // sha-256 of the refresh token — the raw token is never stored.
  tokenHash: string;
  // Rotation lineage: all tokens descended from one login share a family, so a
  // reuse of any revoked token can revoke the whole family.
  family: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const refreshSessionSchema = new Schema<IRefreshSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    family: { type: String, required: true, index: true },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

export const RefreshSession = model<IRefreshSession>(
  "RefreshSession",
  refreshSessionSchema,
);
