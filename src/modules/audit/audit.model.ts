import { Schema, model, Document, Types } from "mongoose";

export const AUDIT_ACTIONS = [
  // Auth lifecycle
  "user.registered",
  "user.logged_in",
  "user.logged_out",
  "user.login_failed",
  "user.password_changed",
  "user.password_reset_requested",
  "user.password_reset",
  "user.profile_updated",
  "user.wallet_linked",
  "user.wallet_unlinked",
  // Admin management
  "admin.created_admin",
  "admin.suspended_user",
  "admin.reactivated_user",
  "admin.blocked_user",
  "admin.suspended_admin",
  "admin.reactivated_admin",
  // KYC
  "user.kyc_submitted",
  "user.kyc_approved",
  "user.kyc_rejected",
  "user.status_changed",
  // Listing lifecycle
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
  // Lease lifecycle
  "lease.created",
  "lease.proposed",
  "lease.escrow_funded",
  "lease.activated",
  "lease.cancelled",
  "lease.completed",
  "lease.terminated",
  "lease.disputed",
  "lease.dispute_resolved",
] as const;

export type AuditTargetType = "listing" | "user" | "lease" | "admin";

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
