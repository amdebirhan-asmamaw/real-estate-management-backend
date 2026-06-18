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
  "user.wallet_revoked",
  // Admin management
  "admin.created_admin",
  "admin.suspended_user",
  "admin.reactivated_user",
  "admin.blocked_user",
  "admin.suspended_admin",
  "admin.reactivated_admin",
  "admin.restored_user",
  "admin.override_decision",
  // KYC
  "user.kyc_submitted",
  "user.kyc_resubmitted",
  "user.kyc_approved",
  "user.kyc_rejected",
  "user.kyc_review_started",
  "user.status_changed",
  // Listing lifecycle
  "listing.created",
  "listing.updated",
  "listing.deleted",
  "listing.submitted",
  "listing.review_started",
  "listing.info_requested",
  "listing.approved",
  "listing.rejected",
  "listing.published",
  "listing.suspended",
  "listing.unsuspended",
  "listing.archived",
  "listing.marked_rented",
  "listing.marked_sold",
  "listing.unmarked_rented",
  "listing.unmarked_sold",
  "document.uploaded",
  "document.approved",
  "document.rejected",
  "listing.title_minted",
  "listing.title_disputed",
  "listing.title_dispute_cleared",
  "listing.title_revoked",
  // Lease lifecycle
  "lease.created",
  "lease.proposed",
  "lease.signed",
  "lease.escrow_funded",
  "lease.activated",
  "lease.cancelled",
  "lease.completed",
  "lease.terminated",
  "lease.disputed",
  "lease.dispute_responded",
  "lease.dispute_resolved",
  // Compliance
  "compliance.case_created",
  "compliance.case_updated",
  // Purchase transactions
  "purchase_transaction.created",
  "purchase_transaction.updated",
  "purchase.escrow_funded",
  "purchase.escrow_released",
  "purchase.escrow_refunded",
  "purchase.disputed",
  "purchase.dispute_resolved",
  // Rental applications
  "rental_application.created",
  "rental_application.reviewed",
  "rental_application.screened",
  "rental_application.appointment_updated",
  "rental_application.withdrawn",
  "rental_application.lease_created",
  // Rental yield
  "maintenance_record.created",
] as const;

export type AuditTargetType =
  | "listing"
  | "user"
  | "lease"
  | "admin"
  | "compliance"
  | "purchase_transaction"
  | "rental_application";

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
