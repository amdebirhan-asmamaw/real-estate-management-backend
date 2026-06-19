// ── Mock the chain layer BEFORE any application imports ──────────────────────
jest.mock("../src/core/blockchain/saleEscrow.service", () => ({
  openAndFundEscrow: jest.fn(async () => ({ escrowId: "1", txHash: "0xfund" })),
  releaseEscrow: jest.fn(async () => ({ txHash: "0xrelease" })),
  refundEscrow: jest.fn(async () => ({ txHash: "0xrefund" })),
  getEscrow: jest.fn(async () => ({ state: "funded" })),
  isConfigured: () => true,
  // D2: token-decimals helper — return standard 18-decimal base units in tests.
  toBaseUnits: jest.fn(async (amount: number) => BigInt(amount) * BigInt(10 ** 18)),
}));

jest.mock("../src/core/blockchain/propertyTitle.service", () => ({
  transferTitle: jest.fn(async () => ({ txHash: "0xtitletransfer" })),
  isConfigured: () => true,
}));

import mongoose from "mongoose";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { PurchaseTransaction } from "../src/modules/purchaseTransactions/purchaseTransaction.model";
import { ChainTransaction } from "../src/modules/chainTransactions/chainTransaction.model";
import { AppError } from "../src/core/utils/AppError";
import * as service from "../src/modules/purchaseTransactions/purchaseTransaction.service";

// ── Seed helpers ──────────────────────────────────────────────────────────────

const makeUser = async (opts: {
  role?: string;
  walletAddress?: string;
  kycStatus?: string;
} = {}) =>
  User.create({
    name: "Test User",
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    password: "Password1!",
    role: opts.role ?? "property_owner",
    kycStatus: opts.kycStatus ?? "verified",
    ...(opts.walletAddress ? { walletAddress: opts.walletAddress } : {}),
  });

const makeListing = async (
  createdBy: string,
  verificationStatus = "verified",
  tokenId?: string,
) =>
  Listing.create({
    title: "Test Sale Listing",
    listingType: "sale",
    category: "residential",
    propertyType: "apartment",
    currency: "USD",
    price: 100000,
    status: "published",
    verificationStatus,
    location: { type: "Point", coordinates: [38.7, 9.0] },
    createdBy,
    ...(tokenId ? { tokenId } : {}),
  });

const makePurchaseTransaction = async (
  listingId: string,
  buyerId: string,
  sellerId: string,
) =>
  PurchaseTransaction.create({
    listing: listingId,
    offer: new mongoose.Types.ObjectId(),
    seller: sellerId,
    buyer: buyerId,
    amount: 100000,
    currency: "USD",
    status: "deposit_pending",
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("purchaseTransaction.service escrow state machine", () => {
  let buyer: InstanceType<typeof User>;
  let seller: InstanceType<typeof User>;
  let admin: InstanceType<typeof User>;
  let listing: InstanceType<typeof Listing>;

  beforeEach(async () => {
    buyer = await makeUser({
      role: "tenant",
      walletAddress: "0x" + "a".repeat(40),
      kycStatus: "verified",
    });
    seller = await makeUser({
      role: "property_owner",
      walletAddress: "0x" + "b".repeat(40),
      kycStatus: "verified",
    });
    admin = await makeUser({ role: "admin" });
    // Listing has a tokenId so that release() can transfer the title on-chain.
    listing = await makeListing(seller.id, "verified", "42");
  });

  // ── fund ─────────────────────────────────────────────────────────────────────

  describe("fund", () => {
    it("happy path: calls openAndFundEscrow, sets escrow.state=funded, status=deposit_received", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);

      const funded = await service.fund(pt.id, admin.id, "admin");

      expect(chain.openAndFundEscrow).toHaveBeenCalled();
      expect(funded.escrow.state).toBe("funded");
      expect(funded.escrow.escrowId).toBe("1");
      expect(funded.escrow.fundTxHash).toBe("0xfund");
      expect(funded.status).toBe("deposit_received");

      const tx = await ChainTransaction.findOne({
        targetType: "purchase_transaction",
        targetId: pt.id,
        operation: "sale_escrow.open_and_fund",
      });
      expect(tx?.status).toBe("mined");
      expect(tx?.txHash).toBe("0xfund");
    });

    it("throws FORBIDDEN when non-admin calls fund", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await expect(service.fund(pt.id, buyer.id, "tenant")).rejects.toBeInstanceOf(AppError);
    });

    it("throws when buyer KYC is not verified", async () => {
      const unverifiedBuyer = await makeUser({
        role: "tenant",
        walletAddress: "0x" + "c".repeat(40),
        kycStatus: "pending",
      });
      const pt = await makePurchaseTransaction(listing.id, unverifiedBuyer.id, seller.id);
      await expect(service.fund(pt.id, admin.id, "admin")).rejects.toBeInstanceOf(AppError);
    });

    it("throws when seller KYC is not verified", async () => {
      const unverifiedSeller = await makeUser({
        role: "property_owner",
        walletAddress: "0x" + "d".repeat(40),
        kycStatus: "pending",
      });
      const pt = await makePurchaseTransaction(listing.id, buyer.id, unverifiedSeller.id);
      await expect(service.fund(pt.id, admin.id, "admin")).rejects.toBeInstanceOf(AppError);
    });

    it("throws when buyer has no wallet", async () => {
      const noWalletBuyer = await makeUser({ role: "tenant", kycStatus: "verified" });
      const pt = await makePurchaseTransaction(listing.id, noWalletBuyer.id, seller.id);
      await expect(service.fund(pt.id, admin.id, "admin")).rejects.toBeInstanceOf(AppError);
    });

    it("throws when seller has no wallet", async () => {
      const noWalletSeller = await makeUser({ role: "property_owner", kycStatus: "verified" });
      const pt = await makePurchaseTransaction(listing.id, buyer.id, noWalletSeller.id);
      await expect(service.fund(pt.id, admin.id, "admin")).rejects.toBeInstanceOf(AppError);
    });

    it("throws when listing is not verified", async () => {
      const unverifiedListing = await makeListing(seller.id, "pending");
      const pt = await makePurchaseTransaction(unverifiedListing.id, buyer.id, seller.id);
      await expect(service.fund(pt.id, admin.id, "admin")).rejects.toBeInstanceOf(AppError);
    });

    it("rejects a second fund call (double-fund guard)", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await expect(service.fund(pt.id, admin.id, "admin")).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── release ───────────────────────────────────────────────────────────────────

  describe("release", () => {
    it("releases funded escrow → status=completed, escrow.state=released, transfers title to buyer", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      const titleSvc = require("../src/core/blockchain/propertyTitle.service");
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      const released = await service.release(pt.id, admin.id, "admin");

      expect(chain.releaseEscrow).toHaveBeenCalledWith("1");
      expect(released.status).toBe("completed");
      expect(released.escrow.state).toBe("released");
      expect(released.escrow.settleTxHash).toBe("0xrelease");

      // Title transfer assertions.
      expect(titleSvc.transferTitle).toHaveBeenCalledWith("42", buyer.walletAddress);
      expect(released.titleTransferTxHash).toBe("0xtitletransfer");

      const escrowTx = await ChainTransaction.findOne({
        targetType: "purchase_transaction",
        targetId: pt.id,
        operation: "sale_escrow.release",
      });
      expect(escrowTx?.status).toBe("mined");

      const titleTx = await ChainTransaction.findOne({
        targetType: "purchase_transaction",
        targetId: pt.id,
        operation: "title.transfer",
      });
      expect(titleTx?.status).toBe("mined");
      expect(titleTx?.txHash).toBe("0xtitletransfer");
    });

    it("throws FORBIDDEN when non-admin calls release", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await expect(service.release(pt.id, seller.id, "property_owner")).rejects.toBeInstanceOf(AppError);
    });

    it("throws CONFLICT when escrow is not funded", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await expect(service.release(pt.id, admin.id, "admin")).rejects.toBeInstanceOf(AppError);
    });

    it("blocks release (throws CONFLICT, does NOT call releaseEscrow) when listing has no tokenId", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      chain.releaseEscrow.mockClear();

      // Listing without a tokenId.
      const noTokenListing = await makeListing(seller.id, "verified");
      const pt = await makePurchaseTransaction(noTokenListing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");

      await expect(service.release(pt.id, admin.id, "admin")).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(chain.releaseEscrow).not.toHaveBeenCalled();
    });

    it("blocks release (throws CONFLICT, does NOT call releaseEscrow) when buyer has no wallet", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      chain.releaseEscrow.mockClear();

      const noWalletBuyer = await makeUser({ role: "tenant", kycStatus: "verified" });
      const pt = await makePurchaseTransaction(listing.id, noWalletBuyer.id, seller.id);

      // Manually force escrow into funded state so requireFundedEscrow passes,
      // but the pre-flight wallet check fires before releaseEscrow is called.
      await pt.updateOne({
        "escrow.state": "funded",
        "escrow.escrowId": "99",
        status: "deposit_received",
      });

      await expect(service.release(pt.id, admin.id, "admin")).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(chain.releaseEscrow).not.toHaveBeenCalled();
    });

    it("writes a purchase.title_transferred audit record on successful release", async () => {
      const { AuditLog } = require("../src/modules/audit/audit.model");
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await service.release(pt.id, admin.id, "admin");

      const auditEntry = await AuditLog.findOne({
        action: "purchase.title_transferred",
        targetId: pt.id,
      });
      expect(auditEntry).not.toBeNull();
      expect(auditEntry?.metadata?.toWallet).toBe(buyer.walletAddress);
    });
  });

  // ── refund ────────────────────────────────────────────────────────────────────

  describe("refund", () => {
    it("refunds funded escrow → status=cancelled, escrow.state=refunded", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      const refunded = await service.refund(pt.id, admin.id, "admin");

      expect(chain.refundEscrow).toHaveBeenCalledWith("1");
      expect(refunded.status).toBe("cancelled");
      expect(refunded.escrow.state).toBe("refunded");
      expect(refunded.escrow.settleTxHash).toBe("0xrefund");

      const tx = await ChainTransaction.findOne({
        targetType: "purchase_transaction",
        targetId: pt.id,
        operation: "sale_escrow.refund",
      });
      expect(tx?.status).toBe("mined");
    });

    it("throws FORBIDDEN when non-admin calls refund", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await expect(service.refund(pt.id, buyer.id, "tenant")).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── dispute ───────────────────────────────────────────────────────────────────

  describe("dispute", () => {
    it("buyer can dispute a funded purchase transaction", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      const disputed = await service.dispute(pt.id, buyer.id, "tenant", "Price mismatch");

      expect(disputed.status).toBe("disputed");
      expect(disputed.dispute?.reason).toBe("Price mismatch");
    });

    it("seller can dispute", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      const disputed = await service.dispute(pt.id, seller.id, "property_owner");
      expect(disputed.status).toBe("disputed");
    });

    it("admin can dispute", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      const disputed = await service.dispute(pt.id, admin.id, "admin");
      expect(disputed.status).toBe("disputed");
    });

    it("outsider (non-party, non-admin) cannot dispute — throws FORBIDDEN", async () => {
      const outsider = await makeUser({ role: "tenant" });
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await expect(
        service.dispute(pt.id, outsider.id, "tenant"),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("cannot dispute a completed transaction", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await service.release(pt.id, admin.id, "admin");
      await expect(service.dispute(pt.id, buyer.id, "tenant")).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── resolveDispute ─────────────────────────────────────────────────────────────

  describe("resolveDispute", () => {
    it("resolve with decision=release → completed, calls releaseEscrow", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await service.dispute(pt.id, buyer.id, "tenant", "Dispute reason");
      const resolved = await service.resolveDispute(
        pt.id,
        { decision: "release" },
        admin.id,
        "admin",
      );

      expect(chain.releaseEscrow).toHaveBeenCalledWith("1");
      expect(resolved.status).toBe("completed");
      expect(resolved.escrow.state).toBe("released");
    });

    it("resolve with decision=refund → cancelled, calls refundEscrow", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await service.dispute(pt.id, seller.id, "property_owner", "Dispute reason");
      const resolved = await service.resolveDispute(
        pt.id,
        { decision: "refund", note: "In buyer's favour" },
        admin.id,
        "admin",
      );

      expect(chain.refundEscrow).toHaveBeenCalledWith("1");
      expect(resolved.status).toBe("cancelled");
      expect(resolved.escrow.state).toBe("refunded");
    });

    it("throws FORBIDDEN when non-admin calls resolveDispute", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await service.dispute(pt.id, buyer.id, "tenant");
      await expect(
        service.resolveDispute(pt.id, { decision: "release" }, seller.id, "property_owner"),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("throws CONFLICT when transaction is not disputed", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await service.fund(pt.id, admin.id, "admin");
      await expect(
        service.resolveDispute(pt.id, { decision: "release" }, admin.id, "admin"),
      ).rejects.toBeInstanceOf(AppError);
    });

    // ── unfunded (escrow.state === "none") dispute resolution ─────────────────

    it("unfunded dispute + decision=refund → cancelled, does NOT call saleEscrow", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      chain.refundEscrow.mockClear();
      chain.releaseEscrow.mockClear();

      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      // Dispute without funding first (escrow.state stays "none").
      await service.dispute(pt.id, buyer.id, "tenant", "Unfunded dispute");

      const resolved = await service.resolveDispute(
        pt.id,
        { decision: "refund", note: "Resolved off-chain" },
        admin.id,
        "admin",
      );

      expect(resolved.status).toBe("cancelled");
      // escrow.state must remain "none" — no chain call was made.
      expect(resolved.escrow.state).toBe("none");
      expect(chain.refundEscrow).not.toHaveBeenCalled();
      expect(chain.releaseEscrow).not.toHaveBeenCalled();
    });

    it("unfunded dispute + decision=release → closing_review, does NOT call saleEscrow", async () => {
      const chain = require("../src/core/blockchain/saleEscrow.service");
      chain.refundEscrow.mockClear();
      chain.releaseEscrow.mockClear();

      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      // Dispute without funding first (escrow.state stays "none").
      await service.dispute(pt.id, seller.id, "property_owner", "Unfunded dispute release");

      const resolved = await service.resolveDispute(
        pt.id,
        { decision: "release" },
        admin.id,
        "admin",
      );

      // "release" on an unfunded transaction resumes it in closing_review rather
      // than marking it completed, because there is no on-chain settlement to record.
      expect(resolved.status).toBe("closing_review");
      expect(resolved.escrow.state).toBe("none");
      expect(chain.releaseEscrow).not.toHaveBeenCalled();
      expect(chain.refundEscrow).not.toHaveBeenCalled();
    });
  });

  // ── updateStatus guards (Task 2) ──────────────────────────────────────────

  describe("updateStatus transparency guards", () => {
    it("throws CONFLICT when setting status=completed without a released escrow", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      // Fund escrow so escrow.state becomes "funded", not "released".
      await service.fund(pt.id, admin.id, "admin");

      await expect(
        service.updateStatus(pt.id, { status: "completed" }, admin.id, "admin"),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("throws CONFLICT when manually setting status=deposit_received (escrow-gated)", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);

      await expect(
        service.updateStatus(pt.id, { status: "deposit_received" }, admin.id, "admin"),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("throws CONFLICT when manually setting status=closing_review (escrow-gated)", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);

      await expect(
        service.updateStatus(pt.id, { status: "closing_review" }, admin.id, "admin"),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("allows benign non-financial status transitions (e.g. offer_accepted → disputed)", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      // "disputed" is not in the escrow-gated list, so updateStatus should allow it.
      const updated = await service.updateStatus(
        pt.id,
        { status: "disputed", note: "Admin override" },
        admin.id,
        "admin",
      );
      expect(updated.status).toBe("disputed");
    });

    it("throws FORBIDDEN when non-admin calls updateStatus", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);
      await expect(
        service.updateStatus(pt.id, { status: "cancelled" }, buyer.id, "tenant"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── funding idempotency via chainTransaction guard (Task 3) ───────────────

  describe("fund idempotency — chainTransaction-level guard", () => {
    it("rejects a second fund when chainTransaction record already exists for sale_escrow.open_and_fund", async () => {
      const pt = await makePurchaseTransaction(listing.id, buyer.id, seller.id);

      // First fund succeeds and writes a chainTransaction with status=mined.
      await service.fund(pt.id, admin.id, "admin");

      // Reset the DB escrow.state back to "none" to bypass the service-level
      // escrow.state gate — this isolates the chainTransaction-level guard.
      await PurchaseTransaction.findByIdAndUpdate(pt.id, {
        "escrow.state": "none",
        "escrow.escrowId": undefined,
        status: "deposit_pending",
      });

      // The chainTransaction record (status=mined) is still in DB.
      // assertNoActiveFund in chainTransaction.service.begin() should reject.
      await expect(service.fund(pt.id, admin.id, "admin")).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});
