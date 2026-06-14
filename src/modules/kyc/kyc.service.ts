import { StatusCodes } from "http-status-codes";
import { User, IUser, KycDocumentType, AccountStatus } from "../auth/auth.model";
import { AppError } from "../../core/utils/AppError";
import { signedUrl } from "../../core/utils/uploader";
import * as audit from "../audit/audit.service";

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

/** A user submits private KYC documents; their KYC moves to pending. */
export const submitKyc = async (
  userId: string,
  docs: NewKycDocument[],
): Promise<KycSummary> => {
  const user = await findUserOr404(userId);
  docs.forEach((d) =>
    user.kycDocuments.push({ ...d, status: "pending", uploadedAt: new Date() }),
  );
  user.kycStatus = "pending";
  await user.save();

  await Promise.all(
    docs.map((d) =>
      audit.record({
        actor: userId,
        actorRole: user.role,
        action: "user.kyc_submitted",
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
 * An admin reviews a user's KYC. Approval verifies the user and activates the
 * account; rejection marks KYC rejected (the user may resubmit while pending).
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

  const docStatus = decision === "approve" ? "approved" : "rejected";
  user.kycDocuments.forEach((d) => {
    if (d.status === "pending") d.status = docStatus;
  });
  user.kycReviewNote = note;

  if (decision === "approve") {
    user.kycStatus = "verified";
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

  return user;
};
