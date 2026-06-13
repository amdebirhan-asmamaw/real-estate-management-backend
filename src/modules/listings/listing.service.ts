import { StatusCodes } from "http-status-codes";
import { Listing, IListing, ListingStatus } from "./listing.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import * as chain from "../../core/blockchain/propertyTitle.service";
import type { AuditAction } from "../audit/audit.model";
import type { FilterQuery } from "mongoose";
import type {
  CreateListingInput,
  TransitionInput,
  DiscoveryQuery,
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
  if (listing.status !== "published" && !isOwnerOrAdmin(listing, userId, role)) {
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
  return listing;
};

export const deleteListing = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<void> => {
  const listing = await findOr404(id);
  ensureOwnerOrAdmin(listing, userId, role);
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

  // Apply side effects per action.
  listing.status = rule.to;
  listing.review.reviewedBy = userId as unknown as IListing["review"]["reviewedBy"];
  listing.review.reviewedAt = new Date();

  if (input.action === "reject") {
    listing.review.rejectionReason = { code: input.reason!, note: input.note };
  } else if (input.action === "request_info" || input.action === "suspend") {
    listing.review.reviewNote = input.note;
  }

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

  return listing;
};

// ─── Discovery (public) + duplicate detection (admin) ───────────────────────────

export const discover = async (
  q: DiscoveryQuery,
): Promise<{ items: IListing[]; total: number; page: number; limit: number }> => {
  const filter: FilterQuery<IListing> = { status: "published" };

  if (q.swLng !== undefined) {
    // Viewport bounding box.
    filter.location = {
      $geoWithin: {
        $box: [
          [q.swLng, q.swLat],
          [q.neLng, q.neLat],
        ],
      },
    };
  } else if (q.lng !== undefined) {
    // Radius from a point (meters).
    filter.location = {
      $near: {
        $geometry: { type: "Point", coordinates: [q.lng, q.lat] },
        $maxDistance: q.radius,
      },
    };
  }

  if (q.listingType) filter.listingType = q.listingType;
  if (q.category) filter.category = q.category;
  if (q.minBedrooms !== undefined) filter.bedrooms = { $gte: q.minBedrooms };
  if (q.minBathrooms !== undefined) filter.bathrooms = { $gte: q.minBathrooms };

  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (q.minPrice !== undefined) range.$gte = q.minPrice;
    if (q.maxPrice !== undefined) range.$lte = q.maxPrice;
    filter.$or = [{ price: range }, { monthlyRent: range }];
  }

  const skip = (q.page - 1) * q.limit;

  // countDocuments rejects $near, so radius counts strip the geo clause.
  const [items, total] = await Promise.all([
    Listing.find(filter).skip(skip).limit(q.limit),
    Listing.countDocuments(
      q.lng !== undefined ? { ...filter, location: undefined } : filter,
    ),
  ]);

  return { items, total, page: q.page, limit: q.limit };
};

export const adminList = async (
  q: AdminListQuery,
): Promise<{ items: IListing[]; total: number; page: number; limit: number }> => {
  const filter: FilterQuery<IListing> = {};
  if (q.status) filter.status = q.status;
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
    throw new AppError("Photo not found on this listing", StatusCodes.NOT_FOUND);
  }

  listing.photos = listing.photos.filter(
    (p) => p.publicId !== publicId,
  ) as IListing["photos"];
  await listing.save();
  return { listing, publicId };
};

// ─── Ownership documents (private) ──────────────────────────────────────────────

interface NewDocument {
  type: "title_deed" | "id" | "tax_record" | "other";
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

  return listing;
};

// ─── On-chain titles (Increment 2) ──────────────────────────────────────────────

export interface TitleInfo {
  tokenId: string;
  contractAddress?: string;
  owner: string;
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

  const result = await chain.mintTitle({
    listingId: listing.id,
    documentHash: listing.ownershipDocumentHash,
  });

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
    onChainHash: onChain.documentHash,
    offChainHash: listing.ownershipDocumentHash,
    verified: onChain.documentHash === listing.ownershipDocumentHash,
  };
};
