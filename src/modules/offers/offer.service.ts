import { StatusCodes } from "http-status-codes";
import { Offer, IOffer, OfferStatus } from "./offer.model";
import { Listing } from "../listings/listing.model";
import { AppError } from "../../core/utils/AppError";
import { isAdmin } from "../listings/listing.service";
import * as notifications from "../notifications/notification.service";
import * as compliance from "../compliance/compliance.service";
import type { CreateOfferInput, RespondOfferInput } from "./offer.validation";

const findOr404 = async (id: string): Promise<IOffer> => {
  const offer = await Offer.findById(id);
  if (!offer) throw new AppError("Offer not found", StatusCodes.NOT_FOUND);
  return offer;
};

export const createOffer = async (
  buyerId: string,
  role: string,
  input: CreateOfferInput,
): Promise<IOffer> => {
  const listing = await Listing.findById(input.listingId);
  if (!listing || listing.status !== "published") {
    throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  }
  if (listing.listingType !== "sale") {
    throw new AppError("Offers can only be made on sale listings", StatusCodes.BAD_REQUEST);
  }
  if (listing.createdBy.toString() === buyerId && !isAdmin(role)) {
    throw new AppError("You cannot make an offer on your own listing", StatusCodes.CONFLICT);
  }

  const offer = await Offer.create({
    listing: listing.id,
    listingOwner: listing.createdBy,
    buyer: buyerId,
    amount: input.amount,
    currency: input.currency,
    message: input.message,
    expiresAt: input.expiresAt,
  });

  await notifications.notify({
    recipient: listing.createdBy.toString(),
    type: "offer.received",
    title: "New purchase offer",
    message: `A buyer submitted an offer for "${listing.title}".`,
    metadata: { listingId: listing.id, offerId: offer.id },
  });

  await compliance.flagOfferIfHighRisk({
    offerId: offer.id,
    buyerId,
    amount: offer.amount,
    currency: offer.currency,
  });

  return offer;
};

export const listMine = async (userId: string): Promise<IOffer[]> =>
  Offer.find({ buyer: userId })
    .sort({ createdAt: -1 })
    .populate("listing", "title status listingType");

export const listReceived = async (userId: string): Promise<IOffer[]> =>
  Offer.find({ listingOwner: userId })
    .sort({ createdAt: -1 })
    .populate("listing", "title status listingType");

export const respond = async (
  offerId: string,
  userId: string,
  role: string,
  input: RespondOfferInput,
): Promise<IOffer> => {
  const offer = await findOr404(offerId);
  const owner = offer.listingOwner.toString() === userId;
  if (!owner && !isAdmin(role)) {
    throw new AppError("Only the listing owner can respond to this offer", StatusCodes.FORBIDDEN);
  }
  if (offer.status !== "submitted" && offer.status !== "countered") {
    throw new AppError(`An offer in "${offer.status}" cannot be updated`, StatusCodes.CONFLICT);
  }

  const nextStatus: Record<RespondOfferInput["action"], OfferStatus> = {
    accept: "accepted",
    reject: "rejected",
    counter: "countered",
  };

  offer.status = nextStatus[input.action];
  offer.counterAmount = input.counterAmount;
  offer.responseNote = input.responseNote;
  offer.respondedAt = new Date();
  await offer.save();

  await notifications.notify({
    recipient: offer.buyer.toString(),
    type: "offer.responded",
    title: "Purchase offer updated",
    message: `Your purchase offer was ${offer.status}.`,
    metadata: { offerId: offer.id, listingId: offer.listing.toString() },
  });

  return offer;
};

export const cancel = async (
  offerId: string,
  buyerId: string,
): Promise<IOffer> => {
  const offer = await findOr404(offerId);
  if (offer.buyer.toString() !== buyerId) {
    throw new AppError("Offer not found", StatusCodes.NOT_FOUND);
  }
  if (offer.status !== "submitted" && offer.status !== "countered") {
    throw new AppError(`An offer in "${offer.status}" cannot be cancelled`, StatusCodes.CONFLICT);
  }
  offer.status = "cancelled";
  await offer.save();
  return offer;
};
