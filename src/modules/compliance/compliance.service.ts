import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import {
  BrokerLicense,
  ComplianceCase,
  ComplianceCaseType,
  ComplianceSeverity,
  RiskScore,
  Screening,
} from "./compliance.model";
import { User } from "../auth/auth.model";
import { Listing } from "../listings/listing.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import * as notifications from "../notifications/notification.service";
import type {
  BrokerLicenseInput,
  ComplianceCaseQuery,
  CreateScreeningInput,
  FlagCaseInput,
  ReviewBrokerLicenseInput,
  UpdateComplianceCaseInput,
} from "./compliance.validation";

const HIGH_VALUE_OFFER = 1_000_000;

const levelForScore = (score: number): ComplianceSeverity => {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
};

export const recordRiskScore = async (input: {
  subjectType: "user" | "listing" | "offer" | "lease" | "title";
  subjectId: string;
  score: number;
  reasons: string[];
  metadata?: Record<string, unknown>;
}) =>
  RiskScore.create({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    score: input.score,
    level: levelForScore(input.score),
    reasons: input.reasons,
    metadata: input.metadata,
  });

export const openCase = async (input: {
  type: ComplianceCaseType;
  severity: ComplianceSeverity;
  title: string;
  description?: string;
  subjectUser?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) => {
  const existing = input.targetId
    ? await ComplianceCase.findOne({
        type: input.type,
        targetType: input.targetType,
        targetId: input.targetId,
        status: { $in: ["open", "under_review"] },
      })
    : null;
  if (existing) return existing;

  const created = await ComplianceCase.create({
    ...input,
    ...(input.subjectUser && { subjectUser: input.subjectUser }),
    ...(input.targetId && { targetId: input.targetId }),
  });

  await audit.record({
    actor: input.subjectUser ?? new Types.ObjectId().toString(),
    actorRole: "system",
    action: "compliance.case_created",
    targetType: "compliance",
    targetId: created.id,
    metadata: { type: input.type, severity: input.severity },
  });

  // Notify the affected subject best-effort.
  if (input.subjectUser) {
    try {
      await notifications.notify({
        recipient: input.subjectUser,
        type: "compliance.case_opened",
        title: "Compliance case opened",
        message: `A compliance case (${input.type}) has been opened regarding your account.`,
        metadata: { caseId: created.id, type: input.type, severity: input.severity },
      });
    } catch {
      /* best-effort */
    }
  }

  return created;
};

export const flagKycRejection = async (
  userId: string,
  note?: string,
) =>
  openCase({
    type: "kyc",
    severity: "medium",
    title: "KYC rejected",
    description: note,
    subjectUser: userId,
    targetType: "user",
    targetId: userId,
  });

export const flagSuspiciousListing = async (input: {
  listingId: string;
  ownerId: string;
  reason?: string;
  note?: string;
}) =>
  openCase({
    type: "listing",
    severity: input.reason === "suspicious" ? "high" : "medium",
    title: "Listing requires compliance review",
    description: input.note,
    subjectUser: input.ownerId,
    targetType: "listing",
    targetId: input.listingId,
    metadata: { reason: input.reason },
  });

export const flagOfferIfHighRisk = async (input: {
  offerId: string;
  buyerId: string;
  amount: number;
  currency: string;
}) => {
  if (input.amount < HIGH_VALUE_OFFER) return null;
  await recordRiskScore({
    subjectType: "offer",
    subjectId: input.offerId,
    score: 75,
    reasons: ["high_value_offer"],
    metadata: { amount: input.amount, currency: input.currency },
  });
  return openCase({
    type: "offer",
    severity: "high",
    title: "High-value purchase offer",
    description: "Offer amount exceeds the high-value compliance threshold.",
    subjectUser: input.buyerId,
    targetType: "offer",
    targetId: input.offerId,
    metadata: { amount: input.amount, currency: input.currency },
  });
};

export const flagLeaseDispute = async (input: {
  leaseId: string;
  landlordId: string;
  tenantId: string;
}) =>
  openCase({
    type: "lease",
    severity: "medium",
    title: "Lease dispute opened",
    description: "A lease dispute requires operational oversight.",
    subjectUser: input.tenantId,
    targetType: "lease",
    targetId: input.leaseId,
    metadata: { landlordId: input.landlordId },
  });

export const listCases = async (query: ComplianceCaseQuery) => {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.severity) filter.severity = query.severity;
  if (query.type) filter.type = query.type;
  if (query.subjectUser) filter.subjectUser = query.subjectUser;

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    ComplianceCase.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(query.limit),
    ComplianceCase.countDocuments(filter),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

export const updateCase = async (
  id: string,
  input: UpdateComplianceCaseInput,
  actorId: string,
  actorRole: string,
) => {
  const item = await ComplianceCase.findById(id);
  if (!item) throw new AppError("Compliance case not found", StatusCodes.NOT_FOUND);

  if (input.status) item.status = input.status;
  if (input.severity) item.severity = input.severity;
  if (input.assignedTo !== undefined) {
    item.assignedTo = input.assignedTo
      ? (input.assignedTo as unknown as typeof item.assignedTo)
      : undefined;
  }
  if (input.resolution !== undefined) item.resolution = input.resolution;
  if (input.note) {
    item.notes.push({
      author: actorId as unknown as (typeof item.notes)[number]["author"],
      body: input.note,
      createdAt: new Date(),
    });
  }
  await item.save();

  await audit.record({
    actor: actorId,
    actorRole,
    action: "compliance.case_updated",
    targetType: "compliance",
    targetId: item.id,
  });

  return item;
};

export const createScreening = async (
  input: CreateScreeningInput,
  actorId: string,
) => {
  const user = await User.findById(input.subjectUser);
  if (!user) throw new AppError("User not found", StatusCodes.NOT_FOUND);

  const screening = await Screening.create({
    ...input,
    reviewedBy: actorId,
    reviewedAt: new Date(),
  });

  if (input.status !== "clear") {
    await openCase({
      type: "kyc",
      severity: input.status === "confirmed_match" ? "critical" : "high",
      title: "Screening match requires review",
      description: `Screening returned ${input.status}.`,
      subjectUser: input.subjectUser,
      targetType: "user",
      targetId: input.subjectUser,
      metadata: { categories: input.categories, reference: input.reference },
    });
  }

  return screening;
};

export const submitBrokerLicense = async (
  ownerId: string,
  input: BrokerLicenseInput,
) => {
  const user = await User.findById(ownerId);
  if (!user) throw new AppError("User not found", StatusCodes.NOT_FOUND);
  if (user.role !== "property_owner") {
    throw new AppError(
      "Only property owners can submit representative licenses",
      StatusCodes.FORBIDDEN,
    );
  }

  const license = await BrokerLicense.create({
    owner: ownerId,
    ...input,
  });

  await openCase({
    type: "broker_license",
    severity: "medium",
    title: "Representative license pending review",
    subjectUser: ownerId,
    targetType: "broker_license",
    targetId: license.id,
    metadata: { jurisdiction: input.jurisdiction },
  });

  return license;
};

export const listBrokerLicenses = async (query: {
  owner?: string;
  status?: string;
  page: number;
  limit: number;
}) => {
  const filter: Record<string, unknown> = {};
  if (query.owner) filter.owner = query.owner;
  if (query.status) filter.status = query.status;
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    BrokerLicense.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(query.limit),
    BrokerLicense.countDocuments(filter),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

export const reviewBrokerLicense = async (
  id: string,
  input: ReviewBrokerLicenseInput,
  adminId: string,
) => {
  const license = await BrokerLicense.findById(id);
  if (!license) throw new AppError("Broker license not found", StatusCodes.NOT_FOUND);

  license.status =
    input.decision === "approve"
      ? "approved"
      : input.decision === "expire"
        ? "expired"
        : "rejected";
  license.reviewNote = input.note;
  license.reviewedBy = adminId as unknown as typeof license.reviewedBy;
  license.reviewedAt = new Date();
  await license.save();

  await notifications.notify({
    recipient: license.owner.toString(),
    type: "compliance.case_update",
    title: "Representative license reviewed",
    message: `Your representative license was ${license.status}.`,
    metadata: { brokerLicenseId: license.id, status: license.status },
  });

  return license;
};

// ─── Admin Flag (B2) ──────────────────────────────────────────────────────────

/**
 * Opens a ComplianceCase from an explicit admin flag action.
 * For targetType "listing", the listing's owner is resolved as subjectUser so
 * the notification reaches them. For other target types the adminId is recorded
 * as actor in the audit log but no subjectUser notification is sent unless a
 * direct user lookup is possible.
 */
export const adminFlagCase = async (
  input: FlagCaseInput,
  adminId: string,
  adminRole: string,
) => {
  let subjectUserId: string | undefined;

  if (input.targetType === "listing") {
    const listing = await Listing.findById(input.targetId).select("createdBy");
    if (!listing) throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
    subjectUserId = listing.createdBy.toString();
  } else if (input.targetType === "user") {
    const user = await User.findById(input.targetId).select("_id");
    if (!user) throw new AppError("User not found", StatusCodes.NOT_FOUND);
    subjectUserId = user.id as string;
  }

  const complianceCase = await openCase({
    type: input.targetType as ComplianceCaseType,
    severity: input.severity as ComplianceSeverity,
    title: input.title,
    description: input.description,
    subjectUser: subjectUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: { reason: "suspicious", flaggedBy: adminId },
  });

  // Explicit admin audit (separate from the system-actor audit inside openCase).
  await audit.record({
    actor: adminId,
    actorRole: adminRole,
    action: "compliance.case_created",
    targetType: "compliance",
    targetId: complianceCase.id as string,
    metadata: {
      targetType: input.targetType,
      targetId: input.targetId,
      severity: input.severity,
    },
  });

  return complianceCase;
};
