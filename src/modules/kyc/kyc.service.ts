import { StatusCodes } from "http-status-codes";
import { User, IUser, KycDocumentType, AccountStatus } from "../auth/auth.model";
import { AppError } from "../../core/utils/AppError";
import { signedUrl } from "../../core/utils/uploader";
import * as audit from "../audit/audit.service";
import * as notifications from "../notifications/notification.service";
import * as compliance from "../compliance/compliance.service";

const isAdminRole = (role: string | null): boolean =>
  role === "admin" || role === "super_admin";

const findUserOr404 = async (id: string): Promise<IUser> => {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", StatusCodes.NOT_FOUND);
  return user;
};

const ensureSelfOrAdmin = (
  targetUserId: string,
  requesterId: string,
  role: string | null,
): void => {
  if (targetUserId !== requesterId && !isAdminRole(role)) {
    throw new AppError(
      "You do not have permission to access these documents",
      StatusCodes.FORBIDDEN,
    );
  }
};

export interface NewKycDocument {
  type: KycDocumentType;
  publicId: string;
  hash: string;
}

export interface KycDocumentSummary {
  id: string;
  type: string;
  status: string;
  hash: string;
  uploadedAt: Date;
}

export interface KycSummary {
  kycStatus: string;
  accountStatus: string;
  reviewNote?: string;
  documents: KycDocumentSummary[];
}

const summarize = (user: IUser): KycSummary => ({
  kycStatus: user.kycStatus,
  accountStatus: user.accountStatus,
  reviewNote: user.kycReviewNote,
  documents: user.kycDocuments.map((d) => ({
    id: d._id.toString(),
    type: d.type,
    status: d.status,
    hash: d.hash, // hash is non-sensitive; publicId is intentionally omitted
    uploadedAt: d.uploadedAt,
  })),
});

/**
 * Returns true only if the user's KYC is currently valid — i.e. status is
 * `verified` AND the verification has not expired (or no expiry is set).
 */
export const isKycValid = (user: Pick<IUser, "kycStatus" | "kycExpiresAt">): boolean => {
  if (user.kycStatus !== "verified") return false;
  if (!user.kycExpiresAt) return true;
  return user.kycExpiresAt > new Date();
};

/** A user submits private KYC documents; their KYC moves to pending.
 *  If the user is resubmitting after a rejection the audit action is
 *  `user.kyc_resubmitted` instead of `user.kyc_submitted`.
 */
export const submitKyc = async (
  userId: string,
  docs: NewKycDocument[],
): Promise<KycSummary> => {
  const user = await findUserOr404(userId);
  const isResubmission = user.kycStatus === "rejected";

  docs.forEach((d) =>
    user.kycDocuments.push({ ...d, status: "pending", uploadedAt: new Date() }),
  );
  user.kycStatus = "pending";
  await user.save();

  const auditAction = isResubmission ? "user.kyc_resubmitted" : "user.kyc_submitted";
  await Promise.all(
    docs.map((d) =>
      audit.record({
        actor: userId,
        actorRole: user.role,
        action: auditAction,
        targetType: "user",
        targetId: userId,
        metadata: { type: d.type },
      }),
    ),
  );

  return summarize(user);
};

/** KYC status + document metadata for a user (self or admin). */
export const getKycSummary = async (
  targetUserId: string,
  requesterId: string,
  role: string | null,
): Promise<KycSummary> => {
  ensureSelfOrAdmin(targetUserId, requesterId, role);
  const user = await findUserOr404(targetUserId);
  return summarize(user);
};

/** Mints a signed URL for a private KYC document (self or admin). */
export const getKycDocumentUrl = async (
  targetUserId: string,
  docId: string,
  requesterId: string,
  role: string | null,
): Promise<string> => {
  ensureSelfOrAdmin(targetUserId, requesterId, role);
  const user = await findUserOr404(targetUserId);
  const doc = user.kycDocuments.id(docId);
  if (!doc) throw new AppError("Document not found", StatusCodes.NOT_FOUND);
  return signedUrl(doc.publicId);
};

/**
 * An admin moves a user's KYC from `pending` → `under_review` to signal
 * that review has started. Approve/reject still work from either state.
 */
export const startKycReview = async (
  targetUserId: string,
  adminId: string,
  role: string | null,
): Promise<KycSummary> => {
  if (!isAdminRole(role)) {
    throw new AppError(
      "Only an administrator can start a KYC review",
      StatusCodes.FORBIDDEN,
    );
  }
  const user = await findUserOr404(targetUserId);
  if (user.kycStatus !== "pending") {
    throw new AppError(
      "KYC must be in pending status to start review",
      StatusCodes.CONFLICT,
    );
  }

  user.kycStatus = "under_review";
  await user.save();

  await audit.record({
    actor: adminId,
    actorRole: role ?? "admin",
    action: "user.kyc_review_started",
    targetType: "user",
    targetId: targetUserId,
  });

  return summarize(user);
};

/**
 * An admin reviews a user's KYC. Approval verifies the user and activates the
 * account; rejection marks KYC rejected (the user may resubmit while pending).
 * Works from either `pending` or `under_review` status.
 */
export const reviewKyc = async (
  targetUserId: string,
  decision: "approve" | "reject",
  note: string | undefined,
  adminId: string,
  role: string | null,
): Promise<KycSummary> => {
  if (!isAdminRole(role)) {
    throw new AppError(
      "Only an administrator can review KYC",
      StatusCodes.FORBIDDEN,
    );
  }
  const user = await findUserOr404(targetUserId);

  if (user.kycStatus !== "pending" && user.kycStatus !== "under_review") {
    throw new AppError(
      "KYC must be in pending or under_review status to be reviewed",
      StatusCodes.CONFLICT,
    );
  }

  const docStatus = decision === "approve" ? "approved" : "rejected";
  user.kycDocuments.forEach((d) => {
    if (d.status === "pending") d.status = docStatus;
  });
  user.kycReviewNote = note;

  if (decision === "approve") {
    user.kycStatus = "verified";
    user.kycVerifiedAt = new Date();
    user.accountStatus = "active";
  } else {
    user.kycStatus = "rejected";
    // Stays pending so the user can resubmit.
  }
  await user.save();

  await audit.record({
    actor: adminId,
    actorRole: role ?? "admin",
    action: decision === "approve" ? "user.kyc_approved" : "user.kyc_rejected",
    targetType: "user",
    targetId: targetUserId,
  });

  await notifications.notify({
    recipient: targetUserId,
    type: decision === "approve" ? "kyc.approved" : "kyc.rejected",
    title: decision === "approve" ? "KYC approved" : "KYC rejected",
    message:
      decision === "approve"
        ? "Your account verification was approved."
        : "Your account verification was rejected. Please review the note and resubmit.",
    metadata: { note },
  });

  if (decision === "reject") {
    await compliance.flagKycRejection(targetUserId, note);
  }

  return summarize(user);
};

/** An admin changes a user's account status directly. */
export const setAccountStatus = async (
  targetUserId: string,
  accountStatus: AccountStatus,
  adminId: string,
  role: string | null,
): Promise<IUser> => {
  if (!isAdminRole(role)) {
    throw new AppError(
      "Only an administrator can change account status",
      StatusCodes.FORBIDDEN,
    );
  }
  const user = await findUserOr404(targetUserId);

  // Guard: cannot modify super_admin accounts
  if (user.role === "super_admin") {
    throw new AppError(
      "Cannot modify a super admin account",
      StatusCodes.FORBIDDEN,
    );
  }
  // Guard: admin cannot modify another admin (only super_admin can)
  if (user.role === "admin" && role !== "super_admin") {
    throw new AppError(
      "Only a super admin can change an admin's account status",
      StatusCodes.FORBIDDEN,
    );
  }

  user.accountStatus = accountStatus;
  await user.save();

  await audit.record({
    actor: adminId,
    actorRole: role ?? "admin",
    action: "user.status_changed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { accountStatus },
  });

  // Notify the user about their status change
  const statusMessages: Record<string, { type: string; title: string; message: string }> = {
    suspended: {
      type: "account.suspended",
      title: "Account suspended",
      message: "Your account has been suspended. Contact support for details.",
    },
    blocked: {
      type: "account.blocked",
      title: "Account blocked",
      message: "Your account has been blocked due to a policy violation.",
    },
    active: {
      type: "account.reactivated",
      title: "Account reactivated",
      message: "Your account has been reactivated. You may now use the platform again.",
    },
  };

  const notification = statusMessages[accountStatus];
  if (notification) {
    await notifications.notify({
      recipient: targetUserId,
      type: notification.type as Parameters<typeof notifications.notify>[0]["type"],
      title: notification.title,
      message: notification.message,
    });
  }

  return user;
};
