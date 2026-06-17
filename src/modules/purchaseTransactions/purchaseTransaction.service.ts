import { StatusCodes } from "http-status-codes";
import { FilterQuery, Types } from "mongoose";
import { parseUnits } from "ethers";
import {
  IPurchaseTransaction,
  PurchaseTransaction,
} from "./purchaseTransaction.model";
import { Offer, IOffer } from "../offers/offer.model";
import { Listing } from "../listings/listing.model";
import { User } from "../auth/auth.model";
import { AppError } from "../../core/utils/AppError";
import { env } from "../../core/config/env";
import { sha256 } from "../../core/utils/hash";
import * as audit from "../audit/audit.service";
import * as notifications from "../notifications/notification.service";
import * as saleEscrow from "../../core/blockchain/saleEscrow.service";
import * as chainTransactions from "../chainTransactions/chainTransaction.service";
import type { ChainTransactionOperation } from "../chainTransactions/chainTransaction.model";
import type {
  PurchaseTransactionQuery,
  UpdatePurchaseTransactionInput,
  DisputeResolveInput,
} from "./purchaseTransaction.validation";

const ADMIN_ROLES = ["admin", "super_admin"];
const isAdmin = (role: string | null) => role !== null && ADMIN_ROLES.includes(role);

const TOKEN_DECIMALS = 18;
const toBaseUnits = (amount: number): bigint =>
  parseUnits(amount.toString(), TOKEN_DECIMALS);

const trackEscrowTx = async <T extends { txHash: string }>(
  input: {
    operation: ChainTransactionOperation;
    purchaseTransactionId: string;
    actorId: string;
    metadata?: Record<string, unknown>;
  },
  run: () => Promise<T>,
): Promise<T> => {
  const chainTx = await chainTransactions.begin({
    operation: input.operation,
    targetType: "purchase_transaction",
    targetId: input.purchaseTransactionId,
    createdBy: input.actorId,
    contractAddress: env.SALE_ESCROW_CONTRACT_ADDRESS || undefined,
    metadata: input.metadata,
  });

  try {
    const result = await run();
    await chainTransactions.markMined(chainTx.id, {
      txHash: result.txHash,
      contractAddress: env.SALE_ESCROW_CONTRACT_ADDRESS || undefined,
      metadata: input.metadata,
    });
    return result;
  } catch (error) {
    await chainTransactions.markFailed(chainTx.id, error);
    throw error;
  }
};

const notifyPurchaseParties = async (
  pt: IPurchaseTransaction,
  title: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> => {
  await Promise.all([
    notifications.notify({
      recipient: pt.buyer.toString(),
      type: "purchase.status_update",
      title,
      message,
      metadata: { purchaseTransactionId: pt.id, status: pt.status, ...metadata },
    }),
    notifications.notify({
      recipient: pt.seller.toString(),
      type: "purchase.status_update",
      title,
      message,
      metadata: { purchaseTransactionId: pt.id, status: pt.status, ...metadata },
    }),
  ]);
};

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

// ─── Escrow lifecycle ─────────────────────────────────────────────────────────

export const fund = async (
  id: string,
  userId: string,
  role: string,
): Promise<IPurchaseTransaction> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const pt = await getById(id, userId, role);

  if (pt.escrow.state !== "none") {
    throw new AppError("Escrow already funded", StatusCodes.CONFLICT);
  }

  const [buyer, seller] = await Promise.all([
    User.findById(pt.buyer),
    User.findById(pt.seller),
  ]);

  if (buyer?.kycStatus !== "verified") {
    throw new AppError(
      "The buyer must complete KYC verification before escrow can be funded",
      StatusCodes.FORBIDDEN,
    );
  }
  if (seller?.kycStatus !== "verified") {
    throw new AppError(
      "The seller must complete KYC verification before escrow can be funded",
      StatusCodes.FORBIDDEN,
    );
  }
  if (!buyer?.walletAddress) {
    throw new AppError(
      "The buyer must have a linked wallet address",
      StatusCodes.BAD_REQUEST,
    );
  }
  if (!seller?.walletAddress) {
    throw new AppError(
      "The seller must have a linked wallet address",
      StatusCodes.BAD_REQUEST,
    );
  }

  const listing = await Listing.findById(pt.listing);
  if (listing?.verificationStatus !== "verified") {
    throw new AppError(
      "The listing must be verified before escrow can be funded",
      StatusCodes.FORBIDDEN,
    );
  }

  // Compute termsHash from purchase transaction fields.
  const termsHash = sha256(
    Buffer.from(
      JSON.stringify({
        purchaseTransactionId: pt.id,
        listing: pt.listing.toString(),
        buyer: pt.buyer.toString(),
        seller: pt.seller.toString(),
        amount: pt.amount,
        currency: pt.currency,
      }),
    ),
  );
  pt.termsHash = termsHash;

  const result = await trackEscrowTx(
    {
      operation: "sale_escrow.open_and_fund",
      purchaseTransactionId: pt.id,
      actorId: userId,
      metadata: { purchaseTransactionId: pt.id },
    },
    () =>
      saleEscrow.openAndFundEscrow({
        saleId: pt.id,
        buyer: buyer.walletAddress!,
        seller: seller.walletAddress!,
        amount: toBaseUnits(pt.amount),
        termsHash,
      }),
  );

  pt.escrow.escrowId = result.escrowId;
  pt.escrow.contractAddress = env.SALE_ESCROW_CONTRACT_ADDRESS;
  pt.escrow.token = env.ESCROW_TOKEN_ADDRESS;
  pt.escrow.state = "funded";
  pt.escrow.fundTxHash = result.txHash;
  pt.escrow.buyerWallet = buyer.walletAddress;
  pt.escrow.sellerWallet = seller.walletAddress;
  pt.status = "deposit_received";
  pt.timeline.push({
    status: "deposit_received",
    note: "Escrow funded on-chain.",
    actor: userId as unknown as Types.ObjectId,
    createdAt: new Date(),
  });
  await pt.save();

  await audit.record({
    actor: userId, actorRole: role, action: "purchase.escrow_funded",
    targetType: "purchase_transaction", targetId: pt.id,
    metadata: { escrowId: result.escrowId, txHash: result.txHash },
  });
  await notifyPurchaseParties(
    pt,
    "Purchase escrow funded",
    "The purchase escrow has been funded on-chain.",
    { escrowId: result.escrowId, txHash: result.txHash },
  );
  return pt;
};

const requireFundedEscrow = (pt: IPurchaseTransaction): string => {
  if (pt.escrow.state !== "funded" || !pt.escrow.escrowId) {
    throw new AppError("Escrow is not funded", StatusCodes.CONFLICT);
  }
  return pt.escrow.escrowId;
};

export const release = async (
  id: string,
  userId: string,
  role: string,
): Promise<IPurchaseTransaction> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const pt = await getById(id, userId, role);
  const escrowId = requireFundedEscrow(pt);

  const tx = await trackEscrowTx(
    {
      operation: "sale_escrow.release",
      purchaseTransactionId: pt.id,
      actorId: userId,
      metadata: { escrowId },
    },
    () => saleEscrow.releaseEscrow(escrowId),
  );

  pt.escrow.state = "released";
  pt.escrow.settleTxHash = tx.txHash;
  pt.status = "completed";
  pt.timeline.push({
    status: "completed",
    note: "Escrow released to seller.",
    actor: userId as unknown as Types.ObjectId,
    createdAt: new Date(),
  });

  // Mark listing as sold.
  await Listing.findByIdAndUpdate(pt.listing, { status: "sold", availabilityStatus: "sold" });

  await pt.save();
  await audit.record({
    actor: userId, actorRole: role, action: "purchase.escrow_released",
    targetType: "purchase_transaction", targetId: pt.id,
    metadata: { txHash: tx.txHash },
  });
  await notifyPurchaseParties(
    pt,
    "Purchase completed",
    "The purchase escrow has been released to the seller.",
    { txHash: tx.txHash },
  );
  return pt;
};

export const refund = async (
  id: string,
  userId: string,
  role: string,
): Promise<IPurchaseTransaction> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const pt = await getById(id, userId, role);
  const escrowId = requireFundedEscrow(pt);

  const tx = await trackEscrowTx(
    {
      operation: "sale_escrow.refund",
      purchaseTransactionId: pt.id,
      actorId: userId,
      metadata: { escrowId },
    },
    () => saleEscrow.refundEscrow(escrowId),
  );

  pt.escrow.state = "refunded";
  pt.escrow.settleTxHash = tx.txHash;
  pt.status = "cancelled";
  pt.timeline.push({
    status: "cancelled",
    note: "Escrow refunded to buyer.",
    actor: userId as unknown as Types.ObjectId,
    createdAt: new Date(),
  });
  await pt.save();

  await audit.record({
    actor: userId, actorRole: role, action: "purchase.escrow_refunded",
    targetType: "purchase_transaction", targetId: pt.id,
    metadata: { txHash: tx.txHash },
  });
  await notifyPurchaseParties(
    pt,
    "Purchase cancelled",
    "The purchase escrow has been refunded to the buyer.",
    { txHash: tx.txHash },
  );
  return pt;
};

export const dispute = async (
  id: string,
  userId: string,
  role: string,
  reason?: string,
): Promise<IPurchaseTransaction> => {
  const pt = await getById(id, userId, role);
  // Buyer, seller, or admin may open a dispute.
  const isParty =
    pt.buyer.toString() === userId || pt.seller.toString() === userId;
  if (!isAdmin(role) && !isParty) {
    throw new AppError("Not allowed", StatusCodes.FORBIDDEN);
  }
  if (pt.status === "disputed") {
    throw new AppError("Already disputed", StatusCodes.CONFLICT);
  }
  if (pt.status === "completed" || pt.status === "cancelled") {
    throw new AppError(
      `A purchase transaction in "${pt.status}" cannot be disputed`,
      StatusCodes.CONFLICT,
    );
  }

  pt.status = "disputed";
  pt.dispute = {
    openedBy: new Types.ObjectId(userId),
    openedAt: new Date(),
    reason,
  };
  pt.timeline.push({
    status: "disputed",
    note: reason ?? "Dispute opened.",
    actor: userId as unknown as Types.ObjectId,
    createdAt: new Date(),
  });
  await pt.save();

  await audit.record({
    actor: userId, actorRole: role, action: "purchase.disputed",
    targetType: "purchase_transaction", targetId: pt.id,
    metadata: { reason },
  });
  await notifyPurchaseParties(pt, "Purchase disputed", "A dispute was opened.", { reason });
  return pt;
};

export const resolveDispute = async (
  id: string,
  input: DisputeResolveInput,
  userId: string,
  role: string,
): Promise<IPurchaseTransaction> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const pt = await getById(id, userId, role);
  if (pt.status !== "disputed") {
    throw new AppError(
      `A purchase transaction in "${pt.status}" cannot have its dispute resolved`,
      StatusCodes.CONFLICT,
    );
  }

  let result: IPurchaseTransaction;
  if (input.decision === "release") {
    result = await release(id, userId, role);
  } else {
    result = await refund(id, userId, role);
  }

  await audit.record({
    actor: userId, actorRole: role, action: "purchase.dispute_resolved",
    targetType: "purchase_transaction", targetId: result.id,
    metadata: { decision: input.decision, note: input.note },
  });
  return result;
};
