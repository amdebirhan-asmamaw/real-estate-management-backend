import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { Listing } from "../listings/listing.model";
import { ListingEvent, ListingEventType } from "./listingEvent.model";
import { AppError } from "../../core/utils/AppError";

const ADMIN_ROLES = ["admin", "super_admin"];
const isAdmin = (role: string | null): boolean =>
  role !== null && ADMIN_ROLES.includes(role);

export const trackEvent = async (input: {
  listingId: string;
  ownerId: string;
  actorId?: string | null;
  eventType: ListingEventType;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  await ListingEvent.create({
    listing: input.listingId,
    owner: input.ownerId,
    actor: input.actorId ?? undefined,
    eventType: input.eventType,
    metadata: input.metadata,
  });
};

export interface ListingAnalytics {
  listingId: string;
  counts: Record<ListingEventType, number>;
  uniqueViewers: number;
  leadCount: number;
  conversionRate: number;
  lastEventAt?: Date;
}

const emptyCounts = (): Record<ListingEventType, number> => ({
  view: 0,
  favorite: 0,
  inquiry: 0,
  offer: 0,
  rental_application: 0,
});

export const getListingAnalytics = async (
  listingId: string,
  userId: string,
  role: string,
): Promise<ListingAnalytics> => {
  const listing = await Listing.findById(listingId).select("createdBy");
  if (!listing) throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  if (!isAdmin(role) && listing.createdBy.toString() !== userId) {
    throw new AppError("Only the listing owner or an admin may view analytics", StatusCodes.FORBIDDEN);
  }

  const [eventCounts, viewers, lastEvent] = await Promise.all([
    ListingEvent.aggregate([
      { $match: { listing: new Types.ObjectId(listingId) } },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]),
    ListingEvent.distinct("actor", {
      listing: listing._id,
      eventType: "view",
      actor: { $exists: true },
    }),
    ListingEvent.findOne({ listing: listing._id }).sort({ createdAt: -1 }),
  ]);

  const counts = emptyCounts();
  for (const item of eventCounts) {
    counts[item._id as ListingEventType] = item.count as number;
  }
  const leadCount =
    counts.inquiry + counts.offer + counts.rental_application;
  const conversionRate = counts.view > 0 ? leadCount / counts.view : 0;
  return {
    listingId,
    counts,
    uniqueViewers: viewers.filter(Boolean).length,
    leadCount,
    conversionRate,
    lastEventAt: lastEvent?.createdAt,
  };
};

export const getOwnerAnalytics = async (
  ownerId: string,
): Promise<{ counts: Record<ListingEventType, number>; leadCount: number }> => {
  const eventCounts = await ListingEvent.aggregate([
    { $match: { owner: new Types.ObjectId(ownerId) } },
    { $group: { _id: "$eventType", count: { $sum: 1 } } },
  ]);
  const counts = emptyCounts();
  for (const item of eventCounts) {
    counts[item._id as ListingEventType] = item.count as number;
  }
  return {
    counts,
    leadCount: counts.inquiry + counts.offer + counts.rental_application,
  };
};
