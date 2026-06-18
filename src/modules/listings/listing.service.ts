import { StatusCodes } from "http-status-codes";
import {
  Listing,
  IListing,
  ListingStatus,
  DocumentType,
} from "./listing.model";
import { User } from "../auth/auth.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import * as chain from "../../core/blockchain/propertyTitle.service";
import * as chainTransactions from "../chainTransactions/chainTransaction.service";
import * as notifications from "../notifications/notification.service";
import * as compliance from "../compliance/compliance.service";
import * as savedSearches from "../savedSearches/savedSearch.service";
import type { AuditAction } from "../audit/audit.model";
import type { FilterQuery } from "mongoose";
import type {
  CreateListingInput,
  TransitionInput,
  DiscoveryQuery,
  ClusterQuery,
  AdminListQuery,
} from "./listing.validation";

const ADMIN_ROLES = ["admin", "super_admin"];

export const isAdmin = (role: string | null): boolean =>
  role !== null && ADMIN_ROLES.includes(role);

const isOwnerOrAdmin = (
  listing: IListing,
  userId: string | null,
  role: string | null,
): boolean =>
  isAdmin(role) || (!!userId && listing.createdBy.toString() === userId);

const ensureOwnerOrAdmin = (
  listing: IListing,
  userId: string | null,
  role: string | null,
): void => {
  if (!isOwnerOrAdmin(listing, userId, role)) {
    throw new AppError(
      "You do not have permission to access this listing",
      StatusCodes.FORBIDDEN,
    );
  }
};

const findOr404 = async (id: string): Promise<IListing> => {
  const listing = await Listing.findById(id);
  if (!listing) throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  return listing;
};

export const createListing = async (
  input: CreateListingInput,
  userId: string,
  actorRole = "property_owner",
): Promise<IListing> => {
  const listing = await Listing.create({ ...input, createdBy: userId });
  await audit.record({
    actor: userId,
    actorRole,
    action: "listing.created",
    targetId: listing.id,
  });
  return listing;
};

export const getListingById = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  if (
    listing.status !== "published" &&
    !isOwnerOrAdmin(listing, userId, role)
  ) {
    // Don't leak the existence of unpublished listings.
    throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  }
  return listing;
};

// Owners may edit content only while a listing is in draft or rejected;
// once it is in review or live, content is frozen. Admins may edit anytime.
const EDITABLE_BY_OWNER = ["draft", "rejected"];

export const updateListing = async (
  id: string,
  patch: Partial<CreateListingInput>,
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);

  if (!isAdmin(role) && !EDITABLE_BY_OWNER.includes(listing.status)) {
    throw new AppError(
      `A listing in "${listing.status}" cannot be edited`,
      StatusCodes.CONFLICT,
    );
  }

  listing.set(patch);
  await listing.save();

  await audit.record({
    actor: userId!,
    actorRole: role ?? "property_owner",
    action: "listing.updated",
    targetId: listing.id,
  });

  return listing;
};

export const deleteListing = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<void> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);

  await audit.record({
    actor: userId!,
    actorRole: role ?? "property_owner",
    action: "listing.deleted",
    targetId: listing.id,
  });

  await listing.deleteOne();
};

export const listMine = async (userId: string): Promise<IListing[]> =>
  Listing.find({ createdBy: userId }).sort({ createdAt: -1 });

// Shared internals reused by later service modules (transitions, photos, docs).
export const _internal = { findOr404, ensureOwnerOrAdmin, isOwnerOrAdmin };

// ─── Review state machine ───────────────────────────────────────────────────────

const ALL_STATUSES: ListingStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "published",
  "suspended",
  "rented",
  "sold",
  "archived",
];

type Actor = "owner_or_admin" | "admin_only";

interface TransitionRule {
  from: ListingStatus[];
  to: ListingStatus;
  actor: Actor;
  audit: AuditAction;
}

const TRANSITIONS: Record<TransitionInput["action"], TransitionRule> = {
  submit: {
    from: ["draft", "rejected"],
    to: "submitted",
    actor: "owner_or_admin",
    audit: "listing.submitted",
  },
  start_review: {
    from: ["submitted"],
    to: "under_review",
    actor: "admin_only",
    audit: "listing.review_started",
  },
  request_info: {
    from: ["submitted", "under_review"],
    to: "draft",
    actor: "admin_only",
    audit: "listing.info_requested",
  },
  approve: {
    from: ["under_review"],
    to: "approved",
    actor: "admin_only",
    audit: "listing.approved",
  },
  reject: {
    from: ["under_review"],
    to: "rejected",
    actor: "admin_only",
    audit: "listing.rejected",
  },
  publish: {
    from: ["approved"],
    to: "published",
    actor: "admin_only",
    audit: "listing.published",
  },
  suspend: {
    from: ["published"],
    to: "suspended",
    actor: "admin_only",
    audit: "listing.suspended",
  },
  unsuspend: {
    from: ["suspended"],
    to: "published",
    actor: "admin_only",
    audit: "listing.unsuspended",
  },
  archive: {
    from: ALL_STATUSES.filter((s) => s !== "archived"),
    to: "archived",
    actor: "owner_or_admin",
    audit: "listing.archived",
  },
  mark_rented: {
    from: ["published"],
    to: "rented",
    actor: "owner_or_admin",
    audit: "listing.marked_rented",
  },
  mark_sold: {
    from: ["published"],
    to: "sold",
    actor: "owner_or_admin",
    audit: "listing.marked_sold",
  },
  unmark_rented: {
    from: ["rented"],
    to: "published",
    actor: "owner_or_admin",
    audit: "listing.unmarked_rented",
  },
  unmark_sold: {
    from: ["sold"],
    to: "published",
    actor: "owner_or_admin",
    audit: "listing.unmarked_sold",
  },
};

export const transition = async (
  id: string,
  input: TransitionInput,
  userId: string,
  role: string,
): Promise<IListing> => {
  const rule = TRANSITIONS[input.action];
  if (!rule) {
    throw new AppError("Unknown transition action", StatusCodes.BAD_REQUEST);
  }

  const listing = await findOr404(id);

  // Authorization: admin-only actions require an admin; owner actions allow the
  // listing owner or an admin.
  if (rule.actor === "admin_only" && !isAdmin(role)) {
    throw new AppError(
      "Only an administrator can perform this action",
      StatusCodes.FORBIDDEN,
    );
  }
  if (rule.actor === "owner_or_admin") {
    ensureOwnerOrAdmin(listing, userId, role);
  }

  // Legality: is this action allowed from the current status?
  if (!rule.from.includes(listing.status)) {
    throw new AppError(
      `Cannot "${input.action}" a listing in "${listing.status}"`,
      StatusCodes.CONFLICT,
    );
  }

  // A property owner must have an active, KYC-verified account before they can
  // submit a listing for review. Admins acting on a listing are exempt.
  if (input.action === "submit" && !isAdmin(role)) {
    const actor = await User.findById(userId);
    if (!actor || actor.accountStatus !== "active") {
      throw new AppError(
        "Your account must be active before submitting a listing for review",
        StatusCodes.FORBIDDEN,
      );
    }
    if (actor.kycStatus !== "verified") {
      throw new AppError(
        "KYC verification is required before submitting a listing for review",
        StatusCodes.FORBIDDEN,
      );
    }
  }

  // Trust guarantee: a listing may only be published once ownership has been
  // verified — an approved title deed and an anchored document hash.
  if (input.action === "publish") {
    const hasApprovedDeed = listing.documents.some(
      (d) => d.type === "title_deed" && d.status === "approved",
    );
    if (
      listing.verificationStatus !== "verified" ||
      !listing.ownershipDocumentHash ||
      !hasApprovedDeed
    ) {
      throw new AppError(
        "A listing can only be published after ownership is verified (an approved title deed is required)",
        StatusCodes.CONFLICT,
      );
    }
  }

  // Apply side effects per action.
  listing.status = rule.to;
  listing.review.reviewedBy =
    userId as unknown as IListing["review"]["reviewedBy"];
  listing.review.reviewedAt = new Date();

  if (input.action === "reject") {
    listing.review.rejectionReason = { code: input.reason!, note: input.note };
  } else if (input.action === "request_info" || input.action === "suspend") {
    listing.review.reviewNote = input.note;
  }

  // Sync availabilityStatus with terminal listing statuses.
  if (input.action === "mark_rented") listing.availabilityStatus = "rented";
  else if (input.action === "mark_sold") listing.availabilityStatus = "sold";
  else if (input.action === "unmark_rented" || input.action === "unmark_sold")
    listing.availabilityStatus = "available";

  await listing.save();

  await audit.record({
    actor: userId,
    actorRole: role,
    action: rule.audit,
    targetId: listing.id,
    metadata: {
      from: rule.from,
      to: rule.to,
      ...(input.reason && { reason: input.reason }),
    },
  });

  if (rule.actor === "admin_only") {
    const notifType =
      input.action === "publish"
        ? "listing.published"
        : input.action === "reject"
          ? "listing.rejected"
          : "listing.review_update";
    await notifications.notify({
      recipient: listing.createdBy.toString(),
      type: notifType,
      title:
        input.action === "publish"
          ? "Listing published"
          : input.action === "reject"
            ? "Listing rejected"
            : "Listing review updated",
      message: `Your listing "${listing.title}" is now ${listing.status}.`,
      metadata: { listingId: listing.id, action: input.action },
    });
  }

  if (input.action === "publish") {
    await savedSearches.notifyMatchingSavedSearches(listing);
  }

  if (
    input.action === "reject" &&
    (input.reason === "suspicious" || input.reason === "duplicate")
  ) {
    await compliance.flagSuspiciousListing({
      listingId: listing.id,
      ownerId: listing.createdBy.toString(),
      reason: input.reason,
      note: input.note,
    });
  }

  return listing;
};

// ─── Discovery (public) + duplicate detection (admin) ───────────────────────────

export const discover = async (
  q: DiscoveryQuery,
): Promise<{
  items: IListing[];
  total: number;
  page: number;
  limit: number;
}> => {
  const filter: FilterQuery<IListing> = { status: "published" };

  // Full-text search on title + description.
  if (q.q) {
    filter.$text = { $search: q.q };
  }

  if (q.swLng !== undefined) {
    filter.location = {
      $geoWithin: {
        $box: [
          [q.swLng, q.swLat],
          [q.neLng, q.neLat],
        ],
      },
    };
  } else if (q.polygon !== undefined) {
    filter.location = {
      $geoWithin: {
        $polygon: q.polygon,
      },
    };
  } else if (q.lng !== undefined) {
    filter.location = {
      $near: {
        $geometry: { type: "Point", coordinates: [q.lng, q.lat] },
        $maxDistance: q.radius,
      },
    };
  }

  if (q.listingType) filter.listingType = q.listingType;
  if (q.category) filter.category = q.category;
  if (q.propertyType) filter.propertyType = q.propertyType;
  if (q.minBedrooms !== undefined) filter.bedrooms = { $gte: q.minBedrooms };
  if (q.minBathrooms !== undefined) filter.bathrooms = { $gte: q.minBathrooms };
  if (q.verifiedOnly) filter.verificationStatus = "verified";
  if (q.availabilityStatus) filter.availabilityStatus = q.availabilityStatus;

  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (q.minPrice !== undefined) range.$gte = q.minPrice;
    if (q.maxPrice !== undefined) range.$lte = q.maxPrice;
    filter.$or = [{ price: range }, { monthlyRent: range }];
  }

  if (q.minArea !== undefined || q.maxArea !== undefined) {
    const areaRange: Record<string, number> = {};
    if (q.minArea !== undefined) areaRange.$gte = q.minArea;
    if (q.maxArea !== undefined) areaRange.$lte = q.maxArea;
    filter["area.value"] = areaRange;
  }

  // Amenities filter: listing must contain ALL requested amenities.
  if (q.amenities) {
    const arr = Array.isArray(q.amenities) ? q.amenities : [q.amenities];
    if (arr.length > 0) filter.amenities = { $all: arr };
  }

  // Sort mapping
  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    price_asc: { price: 1, monthlyRent: 1 },
    price_desc: { price: -1, monthlyRent: -1 },
  };
  const sortOption = sortMap[q.sort ?? "newest"] ?? { createdAt: -1 };

  const skip = (q.page - 1) * q.limit;

  // countDocuments rejects $near, so radius counts strip the geo clause.
  const countFilter =
    q.lng !== undefined ? { ...filter, location: undefined } : filter;
  const [items, total] = await Promise.all([
    Listing.find(filter).sort(sortOption).skip(skip).limit(q.limit),
    Listing.countDocuments(countFilter),
  ]);

  return { items, total, page: q.page, limit: q.limit };
};

export interface ListingCluster {
  id: string;
  count: number;
  center: { type: "Point"; coordinates: [number, number] };
  listingIds: string[];
  minPrice?: number;
  maxPrice?: number;
}

export const clusters = async (q: ClusterQuery): Promise<ListingCluster[]> => {
  const filter: FilterQuery<IListing> = {
    status: "published",
    location: {
      $geoWithin: {
        $box: [
          [q.swLng, q.swLat],
          [q.neLng, q.neLat],
        ],
      },
    },
  };
  if (q.listingType) filter.listingType = q.listingType;
  if (q.category) filter.category = q.category;
  if (q.propertyType) filter.propertyType = q.propertyType;
  if (q.verifiedOnly) filter.verificationStatus = "verified";
  if (q.availabilityStatus) filter.availabilityStatus = q.availabilityStatus;
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (q.minPrice !== undefined) range.$gte = q.minPrice;
    if (q.maxPrice !== undefined) range.$lte = q.maxPrice;
    filter.$or = [{ price: range }, { monthlyRent: range }];
  }

  const listings = await Listing.find(filter)
    .select("_id location price monthlyRent listingType")
    .limit(5000)
    .lean();

  const divisor = Math.max(2, Math.min(128, 2 ** Math.max(1, q.zoom - 8)));
  const lngStep = Math.max((q.neLng - q.swLng) / divisor, 0.0001);
  const latStep = Math.max((q.neLat - q.swLat) / divisor, 0.0001);
  const map = new Map<
    string,
    {
      lngSum: number;
      latSum: number;
      count: number;
      listingIds: string[];
      prices: number[];
    }
  >();

  for (const listing of listings) {
    const [lng, lat] = listing.location.coordinates;
    const x = Math.floor((lng - q.swLng) / lngStep);
    const y = Math.floor((lat - q.swLat) / latStep);
    const key = `${x}:${y}`;
    const entry = map.get(key) ?? {
      lngSum: 0,
      latSum: 0,
      count: 0,
      listingIds: [],
      prices: [],
    };
    entry.lngSum += lng;
    entry.latSum += lat;
    entry.count += 1;
    entry.listingIds.push(String(listing._id));
    const price =
      listing.listingType === "sale" ? listing.price : listing.monthlyRent;
    if (typeof price === "number") entry.prices.push(price);
    map.set(key, entry);
  }

  return Array.from(map.entries()).map(([id, entry]) => ({
    id,
    count: entry.count,
    center: {
      type: "Point",
      coordinates: [entry.lngSum / entry.count, entry.latSum / entry.count],
    },
    listingIds: entry.listingIds,
    minPrice: entry.prices.length > 0 ? Math.min(...entry.prices) : undefined,
    maxPrice: entry.prices.length > 0 ? Math.max(...entry.prices) : undefined,
  }));
};

export const adminList = async (
  q: AdminListQuery,
): Promise<{
  items: IListing[];
  total: number;
  page: number;
  limit: number;
}> => {
  const filter: FilterQuery<IListing> = {};
  if (q.status) filter.status = q.status;
  if (q.verificationStatus) filter.verificationStatus = q.verificationStatus;
  if (q.propertyType) filter.propertyType = q.propertyType;
  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    Listing.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(q.limit),
    Listing.countDocuments(filter),
  ]);
  return { items, total, page: q.page, limit: q.limit };
};

export interface DuplicateCandidate {
  id: string;
  title: string;
  status: string;
  reasons: string[];
}

/**
 * Non-blocking duplicate warning surfaced to admins at review time. Flags other
 * listings by the same owner, or nearby listings with a matching title/postcode.
 */
export const findDuplicates = async (
  id: string,
): Promise<DuplicateCandidate[]> => {
  const listing = await findOr404(id);
  const norm = (s?: string): string => (s ?? "").trim().toLowerCase();

  const [sameOwner, nearby] = await Promise.all([
    Listing.find({
      _id: { $ne: listing._id },
      createdBy: listing.createdBy,
    }).limit(20),
    Listing.find({
      _id: { $ne: listing._id },
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: listing.location.coordinates,
          },
          $maxDistance: 50, // meters
        },
      },
    }).limit(20),
  ]);

  const map = new Map<string, DuplicateCandidate>();
  const add = (l: IListing, reason: string): void => {
    const entry: DuplicateCandidate = map.get(l.id) ?? {
      id: l.id,
      title: l.title,
      status: l.status,
      reasons: [],
    };
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    map.set(l.id, entry);
  };

  sameOwner.forEach((l) => add(l, "same_owner"));
  nearby
    .filter(
      (l) =>
        norm(l.title) === norm(listing.title) ||
        (!!listing.address?.postalCode &&
          l.address?.postalCode === listing.address.postalCode),
    )
    .forEach((l) => add(l, "nearby_similar"));

  return Array.from(map.values());
};

// ─── Photos (public) ────────────────────────────────────────────────────────────

export const addPhotos = async (
  id: string,
  photos: { url: string; publicId: string }[],
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);
  listing.photos.push(...photos);
  await listing.save();
  return listing;
};

/**
 * Removes a photo following a safe order: locate listing → check permission →
 * confirm the photo belongs to this listing → remove from the listing → and
 * only THEN does the caller destroy the remote asset. Returns the publicId so
 * the controller can destroy the external file after the DB write succeeds.
 */
export const removePhoto = async (
  id: string,
  publicId: string,
  userId: string | null,
  role: string | null,
): Promise<{ listing: IListing; publicId: string }> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);

  const exists = listing.photos.some((p) => p.publicId === publicId);
  if (!exists) {
    throw new AppError(
      "Photo not found on this listing",
      StatusCodes.NOT_FOUND,
    );
  }

  listing.photos = listing.photos.filter(
    (p) => p.publicId !== publicId,
  ) as IListing["photos"];
  await listing.save();
  return { listing, publicId };
};

// ─── Ownership documents (private) ──────────────────────────────────────────────

interface NewDocument {
  type: DocumentType;
  publicId: string;
  hash: string;
}

export const addDocuments = async (
  id: string,
  docs: NewDocument[],
  userId: string,
  role: string,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);

  docs.forEach((d) =>
    listing.documents.push({ ...d, status: "pending", uploadedAt: new Date() }),
  );
  // Documents now await admin verification.
  listing.verificationStatus = "pending";
  await listing.save();

  await Promise.all(
    docs.map((d) =>
      audit.record({
        actor: userId,
        actorRole: role,
        action: "document.uploaded",
        targetId: listing.id,
        metadata: { type: d.type },
      }),
    ),
  );

  // Notify all admins that documents have been uploaded and a review is needed.
  try {
    const admins = await User.find({ role: { $in: ["admin", "super_admin"] } })
      .select("_id")
      .lean();
    await Promise.all(
      admins.map((a) =>
        notifications.notify({
          recipient: a._id.toString(),
          type: "admin.review_requested",
          title: "Ownership document review requested",
          message: `Ownership document(s) have been uploaded for listing "${listing.title}" and require review.`,
          metadata: { listingId: listing.id, uploadedBy: userId },
        }),
      ),
    );
  } catch {
    // best-effort — never surface upload errors
  }

  return listing;
};

export interface DocumentSummary {
  id: string;
  type: string;
  status: string;
  hash: string;
  reviewNote?: string;
  uploadedAt: Date;
}

const summarizeDoc = (d: IListing["documents"][number]): DocumentSummary => ({
  id: d._id.toString(),
  type: d.type,
  status: d.status,
  hash: d.hash, // hash is non-sensitive; publicId is intentionally omitted
  reviewNote: d.reviewNote,
  uploadedAt: d.uploadedAt,
});

export const listDocuments = async (
  id: string,
  userId: string,
  role: string,
): Promise<DocumentSummary[]> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);
  return listing.documents.map(summarizeDoc);
};

// Returns the raw subdoc (incl. publicId) for server-side signed-URL minting.
export const getDocumentForAccess = async (
  id: string,
  docId: string,
  userId: string,
  role: string,
): Promise<IListing["documents"][number]> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);
  const doc = listing.documents.id(docId);
  if (!doc) throw new AppError("Document not found", StatusCodes.NOT_FOUND);
  return doc;
};

export const reviewDocument = async (
  id: string,
  docId: string,
  decision: "approve" | "reject",
  note: string | undefined,
  adminId: string,
  role: string,
): Promise<IListing> => {
  if (!isAdmin(role)) {
    throw new AppError(
      "Only an administrator can review documents",
      StatusCodes.FORBIDDEN,
    );
  }

  const listing = await findOr404(id);
  const doc = listing.documents.id(docId);
  if (!doc) throw new AppError("Document not found", StatusCodes.NOT_FOUND);

  if (decision === "approve") {
    doc.status = "approved";
    doc.reviewNote = note;
    // Approving the title deed verifies the listing and captures the hash that
    // Increment 2 will anchor on-chain.
    if (doc.type === "title_deed") {
      listing.verificationStatus = "verified";
      listing.verifiedBy = adminId as unknown as IListing["verifiedBy"];
      listing.verifiedAt = new Date();
      listing.ownershipDocumentHash = doc.hash;
    }
  } else {
    doc.status = "rejected";
    doc.reviewNote = note;
    listing.verificationStatus = "rejected";
  }

  await listing.save();

  await audit.record({
    actor: adminId,
    actorRole: role,
    action: decision === "approve" ? "document.approved" : "document.rejected",
    targetId: listing.id,
    metadata: { docId, type: doc.type },
  });

  await notifications.notify({
    recipient: listing.createdBy.toString(),
    type: "listing.review_update",
    title: "Ownership document reviewed",
    message: `Your ${doc.type} document was ${doc.status}.`,
    metadata: { listingId: listing.id, docId, decision },
  });

  return listing;
};

// ─── On-chain titles (Increment 2) ──────────────────────────────────────────────

export interface TitleInfo {
  tokenId: string;
  contractAddress?: string;
  owner: string;
  status: string;
  onChainHash: string;
  offChainHash?: string;
  verified: boolean;
}

/**
 * Mints a digital title NFT for a verified listing (admin only, explicit
 * action). Anchors the approved ownership-document hash on-chain and records
 * the token/tx metadata on the listing. Idempotent guard: refuses if already
 * minted.
 */
export const mintTitle = async (
  id: string,
  adminId: string,
  role: string,
): Promise<IListing> => {
  if (!isAdmin(role)) {
    throw new AppError(
      "Only an administrator can mint a title",
      StatusCodes.FORBIDDEN,
    );
  }

  const listing = await findOr404(id);

  if (listing.verificationStatus !== "verified") {
    throw new AppError(
      "Listing must be verified before a title can be minted",
      StatusCodes.CONFLICT,
    );
  }
  if (!listing.ownershipDocumentHash) {
    throw new AppError(
      "Listing has no anchored ownership-document hash",
      StatusCodes.CONFLICT,
    );
  }
  if (listing.tokenId) {
    throw new AppError(
      "A title has already been minted for this listing",
      StatusCodes.CONFLICT,
    );
  }

  const chainTx = await chainTransactions.begin({
    operation: "title.mint",
    targetType: "listing",
    targetId: listing.id,
    createdBy: adminId,
    metadata: { listingId: listing.id },
  });

  let result: Awaited<ReturnType<typeof chain.mintTitle>>;
  // If the property owner has a linked wallet, mint directly to them.
  // Otherwise fall back to the custodial minter wallet.
  const owner = await User.findById(listing.createdBy);
  const mintTo = owner?.walletAddress ?? undefined;
  try {
    result = await chain.mintTitle({
      listingId: listing.id,
      documentHash: listing.ownershipDocumentHash,
      to: mintTo,
    });
    await chainTransactions.markMined(chainTx.id, {
      txHash: result.txHash,
      contractAddress: result.contractAddress,
      metadata: { listingId: listing.id, tokenId: result.tokenId },
    });
  } catch (error) {
    await chainTransactions.markFailed(chainTx.id, error);
    throw error;
  }

  listing.tokenId = result.tokenId;
  listing.contractAddress = result.contractAddress;
  listing.blockchainTxHash = result.txHash;
  listing.titleCertificateId = `PTITLE-${result.tokenId}`;
  await listing.save();

  await audit.record({
    actor: adminId,
    actorRole: role,
    action: "listing.title_minted",
    targetId: listing.id,
    metadata: { tokenId: result.tokenId, txHash: result.txHash },
  });

  // Notify property owner that their title certificate has been minted.
  await notifications.notify({
    recipient: listing.createdBy.toString(),
    type: "listing.title_minted",
    title: "Digital title certificate minted",
    message: `A blockchain-backed title certificate has been issued for "${listing.title}".`,
    metadata: {
      listingId: listing.id,
      tokenId: result.tokenId,
      txHash: result.txHash,
    },
  });

  return listing;
};

/**
 * Reads the on-chain title for a listing and compares the anchored hash to the
 * off-chain document hash. Visible per normal listing visibility rules.
 */
export const getTitleInfo = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<TitleInfo> => {
  const listing = await getListingById(id, userId, role);
  if (!listing.tokenId) {
    throw new AppError(
      "No title has been minted for this listing",
      StatusCodes.NOT_FOUND,
    );
  }

  const onChain = await chain.getTitle(listing.tokenId);
  return {
    tokenId: listing.tokenId,
    contractAddress: listing.contractAddress,
    owner: onChain.owner,
    status: onChain.status,
    onChainHash: onChain.documentHash,
    offChainHash: listing.ownershipDocumentHash,
    verified: onChain.documentHash === listing.ownershipDocumentHash,
  };
};

// ─── Title dispute / revoke (admin only) ─────────────────────────────────────

const ensureHasMintedTitle = (listing: IListing): void => {
  if (!listing.tokenId) {
    throw new AppError(
      "No title has been minted for this listing",
      StatusCodes.CONFLICT,
    );
  }
};

/** Marks a minted title as disputed on-chain and suspends the listing. */
export const disputeOnChainTitle = async (
  id: string,
  reason: string,
  adminId: string,
  role: string,
): Promise<IListing> => {
  if (!isAdmin(role)) {
    throw new AppError(
      "Only an administrator can dispute a title",
      StatusCodes.FORBIDDEN,
    );
  }
  const listing = await findOr404(id);
  ensureHasMintedTitle(listing);

  const chainTx = await chainTransactions.begin({
    operation: "title.dispute",
    targetType: "listing",
    targetId: listing.id,
    createdBy: adminId,
    metadata: { listingId: listing.id, tokenId: listing.tokenId, reason },
  });

  let txHash: string;
  try {
    ({ txHash } = await chain.disputeTitle(listing.tokenId!, reason));
    await chainTransactions.markMined(chainTx.id, {
      txHash,
      contractAddress: listing.contractAddress,
      metadata: { listingId: listing.id, tokenId: listing.tokenId },
    });
  } catch (error) {
    await chainTransactions.markFailed(chainTx.id, error);
    throw error;
  }

  // Sync listing status → suspended if currently published.
  if (listing.status === "published") {
    listing.status = "suspended";
  }
  await listing.save();

  await audit.record({
    actor: adminId,
    actorRole: role,
    action: "listing.title_disputed",
    targetId: listing.id,
    metadata: { tokenId: listing.tokenId, txHash, reason },
  });

  await notifications.notify({
    recipient: listing.createdBy.toString(),
    type: "listing.review_update",
    title: "Title disputed",
    message: `The title for "${listing.title}" has been marked as disputed.`,
    metadata: { listingId: listing.id, reason },
  });

  return listing;
};

/** Clears a dispute on a minted title and restores the listing to published. */
export const clearOnChainTitleDispute = async (
  id: string,
  reason: string,
  adminId: string,
  role: string,
): Promise<IListing> => {
  if (!isAdmin(role)) {
    throw new AppError(
      "Only an administrator can clear a title dispute",
      StatusCodes.FORBIDDEN,
    );
  }
  const listing = await findOr404(id);
  ensureHasMintedTitle(listing);

  const chainTx = await chainTransactions.begin({
    operation: "title.clear_dispute",
    targetType: "listing",
    targetId: listing.id,
    createdBy: adminId,
    metadata: { listingId: listing.id, tokenId: listing.tokenId, reason },
  });

  let txHash: string;
  try {
    ({ txHash } = await chain.clearTitleDispute(listing.tokenId!, reason));
    await chainTransactions.markMined(chainTx.id, {
      txHash,
      contractAddress: listing.contractAddress,
      metadata: { listingId: listing.id, tokenId: listing.tokenId },
    });
  } catch (error) {
    await chainTransactions.markFailed(chainTx.id, error);
    throw error;
  }

  // Sync listing status → published if currently suspended due to dispute.
  if (listing.status === "suspended") {
    listing.status = "published";
  }
  await listing.save();

  await audit.record({
    actor: adminId,
    actorRole: role,
    action: "listing.title_dispute_cleared",
    targetId: listing.id,
    metadata: { tokenId: listing.tokenId, txHash, reason },
  });

  await notifications.notify({
    recipient: listing.createdBy.toString(),
    type: "listing.review_update",
    title: "Title dispute cleared",
    message: `The dispute on "${listing.title}" has been resolved.`,
    metadata: { listingId: listing.id, reason },
  });

  return listing;
};

/** Permanently revokes a minted title on-chain and archives the listing. */
export const revokeOnChainTitleForListing = async (
  id: string,
  reason: string,
  adminId: string,
  role: string,
): Promise<IListing> => {
  if (!isAdmin(role)) {
    throw new AppError(
      "Only an administrator can revoke a title",
      StatusCodes.FORBIDDEN,
    );
  }
  const listing = await findOr404(id);
  ensureHasMintedTitle(listing);

  const chainTx = await chainTransactions.begin({
    operation: "title.revoke",
    targetType: "listing",
    targetId: listing.id,
    createdBy: adminId,
    metadata: { listingId: listing.id, tokenId: listing.tokenId, reason },
  });

  let txHash: string;
  try {
    ({ txHash } = await chain.revokeOnChainTitle(listing.tokenId!, reason));
    await chainTransactions.markMined(chainTx.id, {
      txHash,
      contractAddress: listing.contractAddress,
      metadata: { listingId: listing.id, tokenId: listing.tokenId },
    });
  } catch (error) {
    await chainTransactions.markFailed(chainTx.id, error);
    throw error;
  }

  // Revoked titles → archive the listing permanently.
  listing.status = "archived";
  listing.verificationStatus = "suspended";
  await listing.save();

  await audit.record({
    actor: adminId,
    actorRole: role,
    action: "listing.title_revoked",
    targetId: listing.id,
    metadata: { tokenId: listing.tokenId, txHash, reason },
  });

  await notifications.notify({
    recipient: listing.createdBy.toString(),
    type: "listing.review_update",
    title: "Title revoked",
    message: `The title for "${listing.title}" has been permanently revoked.`,
    metadata: { listingId: listing.id, reason },
  });

  return listing;
};

// ─── Certificate view ───────────────────────────────────────────────────────────

const CERTIFICATE_DISCLAIMER =
  "Blockchain-backed verification record; not a government-recognized legal title.";

type CertificateStatus = "not_issued" | "issued" | "suspended" | "revoked";

export interface CertificateView {
  status: CertificateStatus;
  certificateId: string | null;
  propertyId: string;
  ownerWallet: string | null;
  verificationDate: Date | null;
  documentHash: string | null;
  txHash: string | null;
  contractAddress: string | null;
  tokenId: string | null;
  disclaimer: string;
}

const mapOnChainStatus = (
  raw: "none" | "active" | "disputed" | "revoked",
): CertificateStatus => {
  if (raw === "active") return "issued";
  if (raw === "disputed") return "suspended";
  if (raw === "revoked") return "revoked";
  return "not_issued";
};

export const getCertificate = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<CertificateView> => {
  const listing = await getListingById(id, userId, role);

  if (!listing.tokenId) {
    return {
      status: "not_issued",
      certificateId: null,
      propertyId: listing.id,
      ownerWallet: null,
      verificationDate: null,
      documentHash: null,
      txHash: null,
      contractAddress: null,
      tokenId: null,
      disclaimer: CERTIFICATE_DISCLAIMER,
    };
  }

  const onChain = await chain.getTitle(listing.tokenId);

  return {
    status: mapOnChainStatus(onChain.status),
    certificateId: listing.titleCertificateId ?? null,
    propertyId: listing.id,
    ownerWallet: onChain.owner,
    verificationDate: listing.verifiedAt ?? null,
    documentHash: listing.ownershipDocumentHash ?? null,
    txHash: listing.blockchainTxHash ?? null,
    contractAddress: listing.contractAddress ?? null,
    tokenId: listing.tokenId,
    disclaimer: CERTIFICATE_DISCLAIMER,
  };
};

// ─── Photo management ───────────────────────────────────────────────────────────

/** Reorder photos by providing an ordered array of publicIds. */
export const reorderPhotos = async (
  id: string,
  order: string[],
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);

  const photoMap = new Map(listing.photos.map((p) => [p.publicId, p]));
  const reordered = order
    .map((pid) => photoMap.get(pid))
    .filter(Boolean) as IListing["photos"];

  // Append any photos not in the order array at the end.
  const remaining = listing.photos.filter((p) => !order.includes(p.publicId));
  listing.photos = [...reordered, ...remaining] as IListing["photos"];
  await listing.save();
  return listing;
};

/** Set a specific photo as the cover image. */
export const setCoverPhoto = async (
  id: string,
  publicId: string,
  userId: string | null,
  role: string | null,
): Promise<IListing> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);

  const exists = listing.photos.some((p) => p.publicId === publicId);
  if (!exists) {
    throw new AppError(
      "Photo not found on this listing",
      StatusCodes.NOT_FOUND,
    );
  }

  listing.photos.forEach((p) => {
    p.isCover = p.publicId === publicId;
  });
  await listing.save();
  return listing;
};

// ─── Dashboard stats ────────────────────────────────────────────────────────────

import { Inquiry } from "../inquiries/inquiry.model";

export interface OwnerDashboardStats {
  total: number;
  byStatus: Record<string, number>;
  pendingInquiries: number;
}

/** Aggregated dashboard stats for a property owner. */
export const ownerDashboard = async (
  userId: string,
): Promise<OwnerDashboardStats> => {
  const [statusAgg, inquiryCount] = await Promise.all([
    Listing.aggregate([
      { $match: { createdBy: userId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Inquiry.countDocuments({ listingOwner: userId, status: "open" }),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const s of statusAgg) {
    byStatus[s._id as string] = s.count as number;
    total += s.count as number;
  }

  return { total, byStatus, pendingInquiries: inquiryCount };
};

export interface AdminListingStats {
  total: number;
  byStatus: Record<string, number>;
  byVerification: Record<string, number>;
  pendingReview: number;
}

/** Aggregated listing stats for admin dashboard. */
export const adminDashboardStats = async (): Promise<AdminListingStats> => {
  const [statusAgg, verificationAgg, pendingReview] = await Promise.all([
    Listing.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Listing.aggregate([
      { $group: { _id: "$verificationStatus", count: { $sum: 1 } } },
    ]),
    Listing.countDocuments({ status: { $in: ["submitted", "under_review"] } }),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const s of statusAgg) {
    byStatus[s._id as string] = s.count as number;
    total += s.count as number;
  }

  const byVerification: Record<string, number> = {};
  for (const v of verificationAgg) {
    byVerification[v._id as string] = v.count as number;
  }

  return { total, byStatus, byVerification, pendingReview };
};

// ─── Neighborhood analytics ─────────────────────────────────────────────────────

export interface NeighborhoodStat {
  city: string;
  region?: string;
  count: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgMonthlyRent: number | null;
  availability: Record<string, number>;
}

export interface NeighborhoodAnalyticsQuery {
  region?: string;
}

/** Aggregates published listings grouped by city (and optionally region). */
export const neighborhoodAnalytics = async (
  q: NeighborhoodAnalyticsQuery,
): Promise<NeighborhoodStat[]> => {
  const match: FilterQuery<IListing> = { status: "published" };
  if (q.region) match["address.region"] = q.region;

  const rows = await Listing.aggregate([
    { $match: match },
    {
      $group: {
        _id: { city: "$address.city", region: "$address.region" },
        count: { $sum: 1 },
        avgPrice: { $avg: "$price" },
        minPrice: { $min: "$price" },
        maxPrice: { $max: "$price" },
        avgMonthlyRent: { $avg: "$monthlyRent" },
        availabilityStatuses: { $push: "$availabilityStatus" },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return rows.map((row) => {
    const availability: Record<string, number> = {};
    for (const s of row.availabilityStatuses as string[]) {
      availability[s] = (availability[s] ?? 0) + 1;
    }
    return {
      city: (row._id as { city?: string }).city ?? "Unknown",
      region: (row._id as { region?: string }).region,
      count: row.count as number,
      avgPrice:
        row.avgPrice != null ? Math.round(row.avgPrice as number) : null,
      minPrice: row.minPrice != null ? (row.minPrice as number) : null,
      maxPrice: row.maxPrice != null ? (row.maxPrice as number) : null,
      avgMonthlyRent:
        row.avgMonthlyRent != null
          ? Math.round(row.avgMonthlyRent as number)
          : null,
      availability,
    };
  });
};
