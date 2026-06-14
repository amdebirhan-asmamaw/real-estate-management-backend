import { Schema, model, Document, Types } from "mongoose";

export const AUDIT_ACTIONS = [
  "listing.created",
  "listing.submitted",
  "listing.review_started",
  "listing.info_requested",
  "listing.approved",
  "listing.rejected",
  "listing.published",
  "listing.suspended",
  "listing.unsuspended",
  "listing.archived",
  "document.uploaded",
  "document.approved",
  "document.rejected",
  "listing.title_minted",
  "user.kyc_submitted",
  "user.kyc_approved",
  "user.kyc_rejected",
  "user.status_changed",
] as const;

export type AuditTargetType = "listing" | "user";

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface IAuditLog extends Document {
  actor: Types.ObjectId;
  actorRole: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    targetType: { type: String, default: "listing" },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
