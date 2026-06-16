import { StatusCodes } from "http-status-codes";
import { FilterQuery } from "mongoose";
import {
  IPurchaseTransaction,
  PurchaseTransaction,
} from "./purchaseTransaction.model";
import { Offer, IOffer } from "../offers/offer.model";
import { Listing } from "../listings/listing.model";
import { AppError } from "../../core/utils/AppError";
import * as audit from "../audit/audit.service";
import * as notifications from "../notifications/notification.service";
import type {
  PurchaseTransactionQuery,
  UpdatePurchaseTransactionInput,
} from "./purchaseTransaction.validation";

const ADMIN_ROLES = ["admin", "super_admin"];
const isAdmin = (role: string | null) => role !== null && ADMIN_ROLES.includes(role);

export const createFromAcceptedOffer = async (
  offer: IOffer,
  actorId: string,
  actorRole: string,
): Promise<IPurchaseTransaction> => {
  const existing = await PurchaseTransaction.findOne({ offer: offer.id });
  if (existing) return existing;

  const transaction = await PurchaseTransaction.create({
    listing: offer.listing,
    offer: offer.id,
    seller: offer.listingOwner,
    buyer: offer.buyer,
    amount: offer.counterAmount ?? offer.amount,
    currency: offer.currency,
    status: "offer_accepted",
    timeline: [
      {
        status: "offer_accepted",
        note: "Purchase transaction opened from accepted offer.",
        actor: actorId,
        createdAt: new Date(),
      },
    ],
  });

  await Listing.findByIdAndUpdate(offer.listing, {
    availabilityStatus: "under_offer",
  });

  await audit.record({
    actor: actorId,
    actorRole,
    action: "purchase_transaction.created",
    targetType: "purchase_transaction",
    targetId: transaction.id,
    metadata: { offerId: offer.id, listingId: offer.listing.toString() },
  });

  await Promise.all([
    notifications.notify({
      recipient: offer.buyer.toString(),
      type: "purchase.status_update",
      title: "Purchase transaction opened",
      message: "Your accepted offer has opened a purchase transaction.",
      metadata: { purchaseTransactionId: transaction.id },
    }),
    notifications.notify({
      recipient: offer.listingOwner.toString(),
      type: "purchase.status_update",
      title: "Purchase transaction opened",
      message: "An accepted offer has opened a purchase transaction.",
      metadata: { purchaseTransactionId: transaction.id },
    }),
  ]);

  return transaction;
};

export const listMine = async (
  userId: string,
  role: string,
  query: PurchaseTransactionQuery,
) => {
  const filter: FilterQuery<IPurchaseTransaction> = {};
  if (!isAdmin(role)) {
    filter.$or = [{ buyer: userId }, { seller: userId }];
  } else if (query.role === "buyer") {
    filter.buyer = userId;
  } else if (query.role === "seller") {
    filter.seller = userId;
  }
  if (query.status) filter.status = query.status;

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    PurchaseTransaction.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate("listing", "title status listingType availabilityStatus")
      .populate("offer", "amount counterAmount status"),
    PurchaseTransaction.countDocuments(filter),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

export const getById = async (
  id: string,
  userId: string,
  role: string,
): Promise<IPurchaseTransaction> => {
  const item = await PurchaseTransaction.findById(id);
  if (!item) throw new AppError("Purchase transaction not found", StatusCodes.NOT_FOUND);
  if (
    !isAdmin(role) &&
    item.buyer.toString() !== userId &&
    item.seller.toString() !== userId
  ) {
    throw new AppError("Purchase transaction not found", StatusCodes.NOT_FOUND);
  }
  return item;
};

export const updateStatus = async (
  id: string,
  input: UpdatePurchaseTransactionInput,
  actorId: string,
  actorRole: string,
): Promise<IPurchaseTransaction> => {
  if (!isAdmin(actorRole)) {
    throw new AppError(
      "Only an administrator can update purchase transactions",
      StatusCodes.FORBIDDEN,
    );
  }
  const item = await getById(id, actorId, actorRole);

  item.status = input.status;
  if (input.depositAmount !== undefined) item.depositAmount = input.depositAmount;
  if (input.closingChecklist) {
    item.closingChecklist = {
      ...item.closingChecklist,
      ...input.closingChecklist,
    };
  }
  item.timeline.push({
    status: input.status,
    note: input.note,
    actor: actorId as unknown as (typeof item.timeline)[number]["actor"],
    createdAt: new Date(),
  });
  await item.save();

  if (input.status === "completed") {
    await Listing.findByIdAndUpdate(item.listing, {
      status: "sold",
      availabilityStatus: "sold",
    });
  }

  await audit.record({
    actor: actorId,
    actorRole,
    action: "purchase_transaction.updated",
    targetType: "purchase_transaction",
    targetId: item.id,
    metadata: { status: input.status },
  });

  await Promise.all([
    notifications.notify({
      recipient: item.buyer.toString(),
      type: "purchase.status_update",
      title: "Purchase transaction updated",
      message: `Purchase transaction status changed to ${item.status}.`,
      metadata: { purchaseTransactionId: item.id, status: item.status },
    }),
    notifications.notify({
      recipient: item.seller.toString(),
      type: "purchase.status_update",
      title: "Purchase transaction updated",
      message: `Purchase transaction status changed to ${item.status}.`,
      metadata: { purchaseTransactionId: item.id, status: item.status },
    }),
  ]);

  return item;
};

export const ensureOfferAcceptedTransaction = async (
  offerId: string,
  actorId: string,
  actorRole: string,
) => {
  const offer = await Offer.findById(offerId);
  if (!offer || offer.status !== "accepted") return null;
  return createFromAcceptedOffer(offer, actorId, actorRole);
};
