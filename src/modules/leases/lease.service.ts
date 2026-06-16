import { StatusCodes } from "http-status-codes";
import { parseUnits } from "ethers";
import { Lease, ILease, LeaseStatus } from "./lease.model";
import { Listing } from "../listings/listing.model";
import { User } from "../auth/auth.model";
import { AppError } from "../../core/utils/AppError";
import { sha256 } from "../../core/utils/hash";
import * as audit from "../audit/audit.service";
import * as escrow from "../../core/blockchain/leaseEscrow.service";
import type { CreateLeaseInput, DisputeResolveInput } from "./lease.validation";

const ADMIN_ROLES = ["admin", "super_admin"];
const isAdmin = (role: string | null): boolean =>
  role !== null && ADMIN_ROLES.includes(role);

const TOKEN_DECIMALS = 18;
const toBaseUnits = (amount: number): bigint =>
  parseUnits(amount.toString(), TOKEN_DECIMALS);

const findOr404 = async (id: string): Promise<ILease> => {
  const lease = await Lease.findById(id);
  if (!lease) throw new AppError("Lease not found", StatusCodes.NOT_FOUND);
  return lease;
};

const isParty = (lease: ILease, userId: string | null): boolean =>
  !!userId &&
  (lease.landlord.toString() === userId || lease.tenant.toString() === userId);

const ensureLandlordOrAdmin = (lease: ILease, userId: string, role: string): void => {
  if (!isAdmin(role) && lease.landlord.toString() !== userId) {
    throw new AppError("Only the landlord or an admin may do this", StatusCodes.FORBIDDEN);
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

export const createLease = async (
  input: CreateLeaseInput,
  userId: string,
  actorRole: string,
): Promise<ILease> => {
  const listing = await Listing.findById(input.listingId);
  if (!listing) throw new AppError("Listing not found", StatusCodes.NOT_FOUND);
  if (listing.listingType !== "rent") {
    throw new AppError("Leases require a rent listing", StatusCodes.BAD_REQUEST);
  }
  if (listing.status !== "published") {
    throw new AppError("Leases require a published listing", StatusCodes.BAD_REQUEST);
  }
  if (!isAdmin(actorRole) && listing.createdBy.toString() !== userId) {
    throw new AppError("Only the listing owner may create a lease", StatusCodes.FORBIDDEN);
  }
  const tenant = await User.findById(input.tenantId);
  if (!tenant) throw new AppError("Tenant not found", StatusCodes.NOT_FOUND);

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
    actor: userId, actorRole, action: "lease.created",
    targetType: "lease", targetId: lease.id,
  });
  return lease;
};

export const propose = async (
  id: string, userId: string, role: string,
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
    actor: userId, actorRole: role, action: "lease.proposed",
    targetType: "lease", targetId: lease.id,
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
  id: string, userId: string, role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["proposed"]);
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
  if (!lease.termsHash) {
    throw new AppError("Lease has no terms hash; propose it first", StatusCodes.CONFLICT);
  }
  const result = await escrow.openAndFundEscrow({
    leaseId: lease.id,
    landlord: landlord.walletAddress,
    tenant: tenant.walletAddress,
    rentAmount: toBaseUnits(lease.monthlyRent),
    depositAmount: toBaseUnits(lease.depositAmount),
    termsHash: lease.termsHash,
  });
  lease.escrow.escrowId = result.escrowId;
  lease.escrow.contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;
  lease.escrow.token = process.env.ESCROW_TOKEN_ADDRESS;
  lease.escrow.state = "funded";
  lease.escrow.fundTxHash = result.txHash;
  lease.escrow.landlordWallet = landlord.walletAddress;
  lease.escrow.tenantWallet = tenant.walletAddress;
  await lease.save();
  await audit.record({
    actor: userId, actorRole: role, action: "lease.escrow_funded",
    targetType: "lease", targetId: lease.id,
    metadata: { escrowId: result.escrowId, txHash: result.txHash },
  });
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
  id: string, userId: string, role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["proposed"]);
  const escrowId = requireFundedEscrow(lease);
  const tx = await escrow.activateEscrow(escrowId);
  lease.status = "active";
  lease.escrow.state = "active";
  lease.escrow.activateTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId, actorRole: role, action: "lease.activated",
    targetType: "lease", targetId: lease.id, metadata: { txHash: tx.txHash },
  });
  return lease;
};

export const cancel = async (
  id: string, userId: string, role: string,
): Promise<ILease> => {
  const lease = await findOr404(id);
  if (!isAdmin(role) && !isParty(lease, userId)) {
    throw new AppError("Not allowed", StatusCodes.FORBIDDEN);
  }
  ensureState(lease, ["proposed"]);
  if (lease.escrow.state === "funded") {
    const tx = await escrow.cancelEscrow(requireFundedEscrow(lease));
    lease.escrow.state = "closed";
    lease.escrow.settleTxHash = tx.txHash;
  }
  lease.status = "cancelled";
  await lease.save();
  await audit.record({
    actor: userId, actorRole: role, action: "lease.cancelled",
    targetType: "lease", targetId: lease.id,
  });
  return lease;
};

export const complete = async (
  id: string, userId: string, role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["active"]);
  const tx = await escrow.refundDeposit(requireActiveEscrow(lease));
  lease.status = "completed";
  lease.escrow.state = "closed";
  lease.escrow.settleTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId, actorRole: role, action: "lease.completed",
    targetType: "lease", targetId: lease.id, metadata: { txHash: tx.txHash },
  });
  return lease;
};

export const terminate = async (
  id: string, userId: string, role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["active"]);
  const tx = await escrow.releaseDeposit(requireActiveEscrow(lease));
  lease.status = "terminated";
  lease.escrow.state = "closed";
  lease.escrow.settleTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId, actorRole: role, action: "lease.terminated",
    targetType: "lease", targetId: lease.id, metadata: { txHash: tx.txHash },
  });
  return lease;
};

export const dispute = async (
  id: string, userId: string, role: string,
): Promise<ILease> => {
  const lease = await findOr404(id);
  if (!isAdmin(role) && !isParty(lease, userId)) {
    throw new AppError("Not allowed", StatusCodes.FORBIDDEN);
  }
  ensureState(lease, ["proposed", "active"]);
  lease.status = "disputed";
  await lease.save();
  await audit.record({
    actor: userId, actorRole: role, action: "lease.disputed",
    targetType: "lease", targetId: lease.id,
  });
  return lease;
};

export const resolveDispute = async (
  id: string, input: DisputeResolveInput, userId: string, role: string,
): Promise<ILease> => {
  if (!isAdmin(role)) throw new AppError("Admin only", StatusCodes.FORBIDDEN);
  const lease = await findOr404(id);
  ensureState(lease, ["disputed"]);
  const escrowId = lease.escrow.escrowId;
  if (!escrowId) throw new AppError("No escrow to settle", StatusCodes.CONFLICT);

  let tx: { txHash: string };
  let finalStatus: LeaseStatus;
  if (input.decision === "cancel") {
    if (lease.escrow.state !== "funded") {
      throw new AppError("Can only cancel a funded (pre-activation) escrow", StatusCodes.CONFLICT);
    }
    tx = await escrow.cancelEscrow(escrowId);
    finalStatus = "cancelled";
  } else {
    if (lease.escrow.state !== "active") {
      throw new AppError("Deposit settlement requires an active escrow", StatusCodes.CONFLICT);
    }
    tx = input.decision === "release_deposit"
      ? await escrow.releaseDeposit(escrowId)
      : await escrow.refundDeposit(escrowId);
    finalStatus = input.decision === "release_deposit" ? "terminated" : "completed";
  }
  lease.status = finalStatus;
  lease.escrow.state = "closed";
  lease.escrow.settleTxHash = tx.txHash;
  await lease.save();
  await audit.record({
    actor: userId, actorRole: role, action: "lease.dispute_resolved",
    targetType: "lease", targetId: lease.id,
    metadata: { decision: input.decision, note: input.note, txHash: tx.txHash },
  });
  return lease;
};

export const listMine = async (userId: string): Promise<ILease[]> =>
  Lease.find({ $or: [{ landlord: userId }, { tenant: userId }] }).sort({ createdAt: -1 });

export const getLeaseById = async (
  id: string, userId: string | null, role: string | null,
): Promise<ILease> => {
  const lease = await findOr404(id);
  if (!isAdmin(role) && !isParty(lease, userId)) {
    throw new AppError("Lease not found", StatusCodes.NOT_FOUND);
  }
  return lease;
};

export const getEscrowInfo = async (
  id: string, userId: string | null, role: string | null,
): Promise<{ lease: ILease; onChain: Awaited<ReturnType<typeof escrow.getEscrow>> | null }> => {
  const lease = await getLeaseById(id, userId, role);
  const onChain = lease.escrow.escrowId
    ? await escrow.getEscrow(lease.escrow.escrowId)
    : null;
  return { lease, onChain };
};
