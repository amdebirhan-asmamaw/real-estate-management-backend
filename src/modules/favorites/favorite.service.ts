import { Favorite, IFavorite } from "./favorite.model";
import { IListing } from "../listings/listing.model";
import { getListingById } from "../listings/listing.service";
import * as listingAnalytics from "../listingAnalytics/listingAnalytics.service";

/**
 * Saves a listing to the user's favorites. Idempotent — saving twice is a
 * no-op. The listing must be visible to the user (published, or their own).
 */
export const addFavorite = async (
  userId: string,
  listingId: string,
  role: string | null,
): Promise<IFavorite> => {
  // Throws 404 if the listing isn't visible to this user.
  const listing = await getListingById(listingId, userId, role);

  const favorite = await Favorite.findOneAndUpdate(
    { user: userId, listing: listingId },
    { $setOnInsert: { user: userId, listing: listingId } },
    { upsert: true, new: true },
  );
  await listingAnalytics.trackEvent({
    listingId,
    ownerId: listing.createdBy.toString(),
    actorId: userId,
    eventType: "favorite",
  });
  return favorite;
};

/** Removes a listing from the user's favorites. Idempotent. */
export const removeFavorite = async (
  userId: string,
  listingId: string,
): Promise<void> => {
  await Favorite.deleteOne({ user: userId, listing: listingId });
};

/** Lists the user's favorited listings (skips any that were since deleted). */
export const listFavorites = async (userId: string): Promise<IListing[]> => {
  const favorites = await Favorite.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate<{ listing: IListing }>("listing");

  return favorites
    .map((f) => f.listing)
    .filter((listing): listing is IListing => Boolean(listing));
};
