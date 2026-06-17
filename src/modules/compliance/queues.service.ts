/**
 * queues.service.ts — Dedicated admin review queues (Phase B, Task B1).
 *
 * Each function returns a paginated { items, total, page, limit } snapshot
 * without schema changes — all queries run against existing models.
 *
 * Extension point: Phase C will add a `purchasesQueue` for disputed purchase
 * transactions by querying PurchaseTransaction with status "disputed".
 */
import { User } from "../auth/auth.model";
import { Listing } from "../listings/listing.model";
import { Lease } from "../leases/lease.model";
import { ComplianceCase } from "./compliance.model";

export interface QueuePage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface QueueQuery {
  page: number;
  limit: number;
}

// ─── KYC Queue ───────────────────────────────────────────────────────────────
// Users whose kycStatus is "pending" or "under_review".

export const kycQueue = async (q: QueueQuery): Promise<QueuePage<unknown>> => {
  const filter = { kycStatus: { $in: ["pending", "under_review"] } };
  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    User.find(filter)
      .select("name email role kycStatus accountStatus createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(q.limit),
    User.countDocuments(filter),
  ]);
  return { items, total, page: q.page, limit: q.limit };
};

// ─── Property-Verification Queue ─────────────────────────────────────────────
// Listings with verificationStatus = "pending" OR any ownership document with
// status = "pending" (matches the IOwnershipDocument sub-doc shape on listing.model).

export const propertyVerificationQueue = async (
  q: QueueQuery,
): Promise<QueuePage<unknown>> => {
  const filter = {
    $or: [
      { verificationStatus: "pending" },
      { "documents.status": "pending" },
    ],
  };
  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    Listing.find(filter)
      .select("title status verificationStatus createdBy createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(q.limit),
    Listing.countDocuments(filter),
  ]);
  return { items, total, page: q.page, limit: q.limit };
};

// ─── Certificate-Issuance Queue ───────────────────────────────────────────────
// Listings that are verified AND have no tokenId (title certificate not yet
// issued). Matches the actual mintTitle gate in listing.service.ts (~line 772)
// which requires verificationStatus === "verified" and no tokenId.

export const certificatesQueue = async (
  q: QueueQuery,
): Promise<QueuePage<unknown>> => {
  const filter = {
    verificationStatus: "verified",
    $or: [{ tokenId: { $exists: false } }, { tokenId: null }, { tokenId: "" }],
  };
  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    Listing.find(filter)
      .select("title status verificationStatus tokenId createdBy createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(q.limit),
    Listing.countDocuments(filter),
  ]);
  return { items, total, page: q.page, limit: q.limit };
};

// ─── Disputes Queue ───────────────────────────────────────────────────────────
// Leases with status = "disputed".
// Phase C extension point: add purchaseTransactionDisputesQueue here for
// PurchaseTransaction records with status = "disputed".

export const disputesQueue = async (
  q: QueueQuery,
): Promise<QueuePage<unknown>> => {
  const filter = { status: "disputed" };
  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    Lease.find(filter)
      .select("listing landlord tenant status monthlyRent createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(q.limit),
    Lease.countDocuments(filter),
  ]);
  return { items, total, page: q.page, limit: q.limit };
};

// ─── Suspicious Queue ─────────────────────────────────────────────────────────
// Open ComplianceCases of type "listing" or "offer" whose metadata.reason is
// "suspicious" OR "duplicate" — flagSuspiciousListing is called with both
// reasons (listing.service.ts ~line 368), so both must appear in this queue.

export const suspiciousQueue = async (
  q: QueueQuery,
): Promise<QueuePage<unknown>> => {
  const filter = {
    status: { $in: ["open", "under_review"] },
    type: { $in: ["listing", "offer"] },
    "metadata.reason": { $in: ["suspicious", "duplicate"] },
  };
  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    ComplianceCase.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(q.limit),
    ComplianceCase.countDocuments(filter),
  ]);
  return { items, total, page: q.page, limit: q.limit };
};
