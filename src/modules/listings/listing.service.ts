import { StatusCodes } from "http-status-codes";
import { Listing, IListing } from "./listing.model";
import { AppError } from "../../core/utils/AppError";
import type { CreateListingInput } from "./listing.validation";

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
): Promise<IListing> => Listing.create({ ...input, createdBy: userId });

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
