import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { Lease, ILease, LeaseStatus } from "./lease.model";
import { Listing } from "../listings/listing.model";
import { User } from "../auth/auth.model";
import { AppError } from "../../core/utils/AppError";
import { env } from "../../core/config/env";
import { sha256 } from "../../core/utils/hash";
import * as audit from "../audit/audit.service";
import * as escrow from "../../core/blockchain/leaseEscrow.service";
import * as chainTransactions from "../chainTransactions/chainTransaction.service";
import * as notifications from "../notifications/notification.service";
import * as compliance from "../compliance/compliance.service";
import type { ChainTransactionOperation } from "../chainTransactions/chainTransaction.model";
import type { CreateLeaseInput, DisputeResolveInput } from "./lease.validation";

const ADMIN_ROLES = ["admin", "super_admin"];
const isAdmin = (role: string | null): boolean =>
  role !== null && ADMIN_ROLES.includes(role);

// Amount scaling uses the token's actual decimals (read on first use from the
// token contract and cached).  Delegates to leaseEscrow.service.toBaseUnits.
const toBaseUnits = (amount: number): Promise<bigint> =>
  escrow.toBaseUnits(amount);

const trackEscrowTx = async <T extends { txHash: string }>(
  input: {
    operation: ChainTransactionOperation;
    leaseId: string;
    actorId: string;
    metadata?: Record<string, unknown>;
  },
  run: () => Promise<T>,
): Promise<T> => {
  const chainTx = await chainTransactions.begin({
    operation: input.operation,
    targetType: "lease",
    targetId: input.leaseId,
    createdBy: input.actorId,
    contractAddress: env.ESCROW_CONTRACT_ADDRESS || undefined,
    metadata: input.metadata,
  });

  try {
    const result = await run();
    await chainTransactions.markMined(chainTx.id, {
      txHash: result.txHash,
      contractAddress: env.ESCROW_CONTRACT_ADDRESS || undefined,
      metadata: input.metadata,
    });
    return result;
  } catch (error) {
    await chainTransactions.markFailed(chainTx.id, error);
    throw error;
  }
};

const findOr404 = async (id: string): Promise<ILease> => {
  const lease = await Lease.findById(id);
  if (!lease) throw new AppError("Lease not found", StatusCodes.NOT_FOUND);
  return lease;
};

const isParty = (lease: ILease, userId: string | null): boolean =>
  !!userId &&
  (lease.landlord.toString() === userId || lease.tenant.toString() === userId);

const ensureLandlordOrAdmin = (
  lease: ILease,
  userId: string,
  role: string,
): void => {
  if (!isAdmin(role) && lease.landlord.toString() !== userId) {
    throw new AppError(
      "Only the landlord or an admin may do this",
      StatusCodes.FORBIDDEN,
    );
  }
};

const ensureState = (lease: ILease, allowed: LeaseStatus[]): void => {
  if (!allowed.includes(lease.status)) {
    throw new AppError(
      `A lease in "${lease.status}" cannot do this`,
      StatusCodes.CONFLICT,
    );
  }
};

const notifyLeaseParties = async (
  lease: ILease,
  title: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> => {
  await Promise.all([
    notifications.notify({
      recipient: lease.landlord.toString(),
      type: "lease.status_update",
      title,
      message,
      metadata: { leaseId: lease.id, status: lease.status, ...metadata },
    }),
    notifications.notify({
      recipient: lease.tenant.toString(),
      type: "lease.status_update",
      title,
      message,
      metadata: { leaseId: lease.id, status: lease.status, ...metadata },
    }),
  ]);
};

export const createLease = async (
  input: CreateLeaseInput,
  userId: string,
  actorRole: string,
): Promise<ILease> => {
  const listing = await Listing.findById(input.listingId);
  if (!listing) throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  if (listing.listingType !== "rent") {
    throw new AppError(
      "Leases require a rent listing",
      StatusCodes.BAD_REQUEST,
    );
  }
  if (listing.status !== "published") {
    throw new AppError(
      "Leases require a published listing",
      StatusCodes.BAD_REQUEST,
    );
  }
  if (!isAdmin(actorRole) && listing.createdBy.toString() !== userId) {
    throw new AppError(
      "Only the listing owner may create a lease",
      StatusCodes.FORBIDDEN,
    );
  }
  const tenant = await User.findById(input.tenantId);
  if (!tenant) throw new AppError("Tenant not found", StatusCodes.NOT_FOUND);

  // Early wallet warning: both parties need wallets before escrow can be funded.
  const landlord = await User.findById(listing.createdBy);
  if (!landlord?.walletAddress || !tenant.walletAddress) {
    // Non-blocking: lease can still be created, but parties are warned.
  }

  const escrowAmount = input.monthlyRent + input.depositAmount;
  const lease = await Lease.create({
    listing: listing.id,
    landlord: listing.createdBy,
    tenant: tenant.id,
    currency: input.currency,
    monthlyRent: input.monthlyRent,
    depositAmount: input.depositAmount,
    escrowAmount,
    startDate: input.startDate,
    endDate: input.endDate,
    terms: input.terms,
    createdBy: userId,
  });
  await audit.record({
    actor: userId,
    actorRole,
    action: "lease.created",
    targetType: "lease",
    targetId: lease.id,
  });
  return lease;
};

export const propose = async (
  id: string,
  userId: string,
  role: string,
): Promise<ILease> => {
  const lease = await findOr404(id);
  ensureLandlordOrAdmin(lease, userId, role);
  ensureState(lease, ["draft"]);
  lease.termsHash = sha256(
    Buffer.from(
      JSON.stringify({
        listing: lease.listing.toString(),
        landlord: lease.landlord.toString(),
        tenant: lease.tenant.toString(),
        monthlyRent: lease.monthlyRent,
        depositAmount: lease.depositAmount,
        startDate: lease.startDate,
        endDate: lease.endDate,
        terms: lease.terms ?? "",
      }),
    ),
  );
  lease.status = "proposed";
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.proposed",
    targetType: "lease",
    targetId: lease.id,
  });
  await notifyLeaseParties(
    lease,
    "Lease proposed",
    "A lease has been proposed and is ready for escrow funding.",
  );
  return lease;
};

export const sign = async (
  id: string,
  userId: string,
  role: string,
  tenantSignature?: string,
): Promise<ILease> => {
  const lease = await findOr404(id);
  // Only the tenant of this lease (or an admin acting on their behalf) may sign.
  if (!isAdmin(role) && lease.tenant.toString() !== userId) {
    throw new AppError(
      "Only the tenant of this lease may sign it",
      StatusCodes.FORBIDDEN,
    );
  }
  ensureState(lease, ["proposed"]);
  lease.signedByTenantAt = new Date();
  if (tenantSignature !== undefined) {
    lease.tenantSignature = tenantSignature;
  }
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.signed",
    targetType: "lease",
    targetId: lease.id,
    metadata: { tenantSignature },
  });
  // Notify landlord that the tenant has signed.
  await notifications.notify({
    recipient: lease.landlord.toString(),
    type: "lease.status_update",
    title: "Tenant signed the lease",
    message:
      "The tenant has signed the lease. You may now proceed to fund escrow.",
    metadata: { leaseId: lease.id, status: lease.status },
  });
  return lease;
};

// NOTE: each money-moving transition calls the chain BEFORE persisting the new
// lease/escrow state. In this custodial design that's an accepted trade-off —
// funds are never lost, only the record could lag if the DB write fails after a
// mined tx. The DB escrow sub-state (none/funded/active/closed) guards against
// re-issuing a transition (e.g. double-fund), and getEscrow() exposes the
// on-chain truth for a future reconciliation job. See CLAUDE.md.
export const fund = async (
  id: string,
  userId: string,
  role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["proposed"]);
  if (!lease.signedByTenantAt) {
    throw new AppError(
      "Tenant must sign the lease before escrow can be funded",
      StatusCodes.CONFLICT,
    );
  }
  if (lease.escrow.state !== "none") {
    throw new AppError("Escrow already funded", StatusCodes.CONFLICT);
  }
  const [landlord, tenant] = await Promise.all([
    User.findById(lease.landlord),
    User.findById(lease.tenant),
  ]);
  if (!landlord?.walletAddress || !tenant?.walletAddress) {
    throw new AppError(
      "Both landlord and tenant must have a linked wallet address",
      StatusCodes.BAD_REQUEST,
    );
  }
  // KYC gate: both parties must be KYC-verified before escrow funding.
  if (landlord.kycStatus !== "verified") {
    throw new AppError(
      "The landlord must complete KYC verification before escrow can be funded",
      StatusCodes.FORBIDDEN,
    );
  }
  if (tenant.kycStatus !== "verified") {
    throw new AppError(
      "The tenant must complete KYC verification before escrow can be funded",
      StatusCodes.FORBIDDEN,
    );
  }
  if (!lease.termsHash) {
    throw new AppError(
      "Lease has no terms hash; propose it first",
      StatusCodes.CONFLICT,
    );
  }
  const result = await trackEscrowTx(
    {
      operation: "lease_escrow.open_and_fund",
      leaseId: lease.id,
      actorId: userId,
      metadata: { leaseId: lease.id },
    },
    () =>
      (async () =>
        escrow.openAndFundEscrow({
          leaseId: lease.id,
          landlord: landlord.walletAddress!,
          tenant: tenant.walletAddress!,
          rentAmount: await toBaseUnits(lease.monthlyRent),
          depositAmount: await toBaseUnits(lease.depositAmount),
          termsHash: lease.termsHash!,
        }))(),
  );
  lease.escrow.escrowId = result.escrowId;
  lease.escrow.contractAddress = env.ESCROW_CONTRACT_ADDRESS;
  lease.escrow.token = env.ESCROW_TOKEN_ADDRESS;
  lease.escrow.state = "funded";
  lease.escrow.fundTxHash = result.txHash;
  lease.escrow.landlordWallet = landlord.walletAddress;
  lease.escrow.tenantWallet = tenant.walletAddress;
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.escrow_funded",
    targetType: "lease",
    targetId: lease.id,
    metadata: { escrowId: result.escrowId, txHash: result.txHash },
  });
  await notifyLeaseParties(
    lease,
    "Lease escrow funded",
    "The lease escrow has been funded on-chain.",
    { escrowId: result.escrowId, txHash: result.txHash },
  );
  return lease;
};

const requireFundedEscrow = (lease: ILease): string => {
  if (lease.escrow.state !== "funded" || !lease.escrow.escrowId) {
    throw new AppError("Escrow is not funded", StatusCodes.CONFLICT);
  }
  return lease.escrow.escrowId;
};

const requireActiveEscrow = (lease: ILease): string => {
  if (lease.escrow.state !== "active" || !lease.escrow.escrowId) {
    throw new AppError("Escrow is not active", StatusCodes.CONFLICT);
  }
  return lease.escrow.escrowId;
};

export const activate = async (
  id: string,
  userId: string,
  role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["proposed"]);
  const escrowId = requireFundedEscrow(lease);
  const tx = await trackEscrowTx(
    {
      operation: "lease_escrow.activate",
      leaseId: lease.id,
      actorId: userId,
      metadata: { escrowId },
    },
    () => escrow.activateEscrow(escrowId),
  );
  lease.status = "active";
  lease.escrow.state = "active";
  lease.escrow.activateTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.activated",
    targetType: "lease",
    targetId: lease.id,
    metadata: { txHash: tx.txHash },
  });
  await notifyLeaseParties(
    lease,
    "Lease activated",
    "The lease has been activated and first month rent was released.",
    { txHash: tx.txHash },
  );
  return lease;
};

export const cancel = async (
  id: string,
  userId: string,
  role: string,
): Promise<ILease> => {
  const lease = await findOr404(id);
  if (!isAdmin(role) && !isParty(lease, userId)) {
    throw new AppError("Not allowed", StatusCodes.FORBIDDEN);
  }
  ensureState(lease, ["proposed"]);
  if (lease.escrow.state === "funded") {
    const escrowId = requireFundedEscrow(lease);
    const tx = await trackEscrowTx(
      {
        operation: "lease_escrow.cancel",
        leaseId: lease.id,
        actorId: userId,
        metadata: { escrowId },
      },
      () => escrow.cancelEscrow(escrowId),
    );
    lease.escrow.state = "closed";
    lease.escrow.settleTxHash = tx.txHash;
  }
  lease.status = "cancelled";
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.cancelled",
    targetType: "lease",
    targetId: lease.id,
  });
  await notifyLeaseParties(
    lease,
    "Lease cancelled",
    "The lease was cancelled.",
    { txHash: lease.escrow.settleTxHash },
  );
  return lease;
};

export const complete = async (
  id: string,
  userId: string,
  role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["active"]);
  const escrowId = requireActiveEscrow(lease);
  const tx = await trackEscrowTx(
    {
      operation: "lease_escrow.refund_deposit",
      leaseId: lease.id,
      actorId: userId,
      metadata: { escrowId },
    },
    () => escrow.refundDeposit(escrowId),
  );
  lease.status = "completed";
  lease.escrow.state = "closed";
  lease.escrow.settleTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.completed",
    targetType: "lease",
    targetId: lease.id,
    metadata: { txHash: tx.txHash },
  });
  await notifyLeaseParties(
    lease,
    "Lease completed",
    "The lease was completed and the deposit was refunded.",
    { txHash: tx.txHash },
  );
  return lease;
};

export const terminate = async (
  id: string,
  userId: string,
  role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["active"]);
  const escrowId = requireActiveEscrow(lease);
  const tx = await trackEscrowTx(
    {
      operation: "lease_escrow.release_deposit",
      leaseId: lease.id,
      actorId: userId,
      metadata: { escrowId },
    },
    () => escrow.releaseDeposit(escrowId),
  );
  lease.status = "terminated";
  lease.escrow.state = "closed";
  lease.escrow.settleTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.terminated",
    targetType: "lease",
    targetId: lease.id,
    metadata: { txHash: tx.txHash },
  });
  await notifyLeaseParties(
    lease,
    "Lease terminated",
    "The lease was terminated and the deposit was released.",
    { txHash: tx.txHash },
  );
  return lease;
};

export const dispute = async (
  id: string,
  userId: string,
  role: string,
  reason?: string,
): Promise<ILease> => {
  const lease = await findOr404(id);
  if (!isAdmin(role) && !isParty(lease, userId)) {
    throw new AppError("Not allowed", StatusCodes.FORBIDDEN);
  }
  ensureState(lease, ["proposed", "active"]);
  lease.status = "disputed";
  lease.dispute = {
    openedBy: new Types.ObjectId(userId),
    openedAt: new Date(),
    reason,
  };
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.disputed",
    targetType: "lease",
    targetId: lease.id,
    metadata: { reason },
  });
  await notifyLeaseParties(
    lease,
    "Lease disputed",
    "A dispute was opened for this lease.",
    { reason },
  );
  await compliance.flagLeaseDispute({
    leaseId: lease.id,
    landlordId: lease.landlord.toString(),
    tenantId: lease.tenant.toString(),
  });
  return lease;
};

export const respondToDispute = async (
  id: string,
  userId: string,
  role: string,
  response: string,
): Promise<ILease> => {
  const lease = await findOr404(id);
  ensureState(lease, ["disputed"]);
  // Only the counterparty (the party who did NOT open the dispute) or admin may respond.
  if (!isAdmin(role)) {
    if (!isParty(lease, userId)) {
      throw new AppError("Not allowed", StatusCodes.FORBIDDEN);
    }
    const openedBy = lease.dispute?.openedBy?.toString();
    if (openedBy && openedBy === userId) {
      throw new AppError(
        "The party who opened the dispute cannot respond to their own dispute",
        StatusCodes.FORBIDDEN,
      );
    }
  }
  if (!lease.dispute) {
    // Initialise dispute sub-doc if somehow missing (shouldn't normally happen).
    lease.dispute = {};
  }
  lease.dispute.response = response;
  lease.dispute.respondedBy = new Types.ObjectId(userId);
  lease.dispute.respondedAt = new Date();
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.dispute_responded",
    targetType: "lease",
    targetId: lease.id,
    metadata: { response },
  });
  // Notify the other party (the opener, or both parties if opened by admin/unknown).
  const openedById = lease.dispute.openedBy?.toString();
  const notifyRecipient =
    openedById && openedById !== userId
      ? openedById
      : lease.landlord.toString() !== userId
        ? lease.landlord.toString()
        : lease.tenant.toString();
  await notifications.notify({
    recipient: notifyRecipient,
    type: "lease.status_update",
    title: "Dispute response received",
    message: "The counterparty has responded to the dispute.",
    metadata: { leaseId: lease.id, status: lease.status, response },
  });
  return lease;
};

export const resolveDispute = async (
  id: string,
  input: DisputeResolveInput,
  userId: string,
  role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["disputed"]);
  const escrowId = lease.escrow.escrowId;
  if (!escrowId)
    throw new AppError("No escrow to settle", StatusCodes.CONFLICT);

  let tx: { txHash: string };
  let finalStatus: LeaseStatus;
  if (input.decision === "cancel") {
    if (lease.escrow.state !== "funded") {
      throw new AppError(
        "Can only cancel a funded (pre-activation) escrow",
        StatusCodes.CONFLICT,
      );
    }
    tx = await trackEscrowTx(
      {
        operation: "lease_escrow.cancel",
        leaseId: lease.id,
        actorId: userId,
        metadata: { escrowId, disputeDecision: input.decision },
      },
      () => escrow.cancelEscrow(escrowId),
    );
    finalStatus = "cancelled";
  } else {
    if (lease.escrow.state !== "active") {
      throw new AppError(
        "Deposit settlement requires an active escrow",
        StatusCodes.CONFLICT,
      );
    }
    tx =
      input.decision === "release_deposit"
        ? await trackEscrowTx(
            {
              operation: "lease_escrow.release_deposit",
              leaseId: lease.id,
              actorId: userId,
              metadata: { escrowId, disputeDecision: input.decision },
            },
            () => escrow.releaseDeposit(escrowId),
          )
        : await trackEscrowTx(
            {
              operation: "lease_escrow.refund_deposit",
              leaseId: lease.id,
              actorId: userId,
              metadata: { escrowId, disputeDecision: input.decision },
            },
            () => escrow.refundDeposit(escrowId),
          );
    finalStatus =
      input.decision === "release_deposit" ? "terminated" : "completed";
  }
  lease.status = finalStatus;
  lease.escrow.state = "closed";
  lease.escrow.settleTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId,
    actorRole: role,
    action: "lease.dispute_resolved",
    targetType: "lease",
    targetId: lease.id,
    metadata: {
      decision: input.decision,
      note: input.note,
      txHash: tx.txHash,
      disputeResponse: lease.dispute?.response,
    },
  });
  await notifyLeaseParties(
    lease,
    "Lease dispute resolved",
    "The lease dispute was resolved.",
    { decision: input.decision, txHash: tx.txHash },
  );
  return lease;
};

export const listMine = async (userId: string): Promise<ILease[]> =>
  Lease.find({ $or: [{ landlord: userId }, { tenant: userId }] }).sort({
    createdAt: -1,
  });

export const getLeaseById = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<ILease> => {
  const lease = await findOr404(id);
  if (!isAdmin(role) && !isParty(lease, userId)) {
    throw new AppError("Lease not found", StatusCodes.NOT_FOUND);
  }
  return lease;
};

export const getEscrowInfo = async (
  id: string,
  userId: string | null,
  role: string | null,
): Promise<{
  lease: ILease;
  onChain: Awaited<ReturnType<typeof escrow.getEscrow>> | null;
}> => {
  const lease = await getLeaseById(id, userId, role);
  const onChain = lease.escrow.escrowId
    ? await escrow.getEscrow(lease.escrow.escrowId)
    : null;
  return { lease, onChain };
};
