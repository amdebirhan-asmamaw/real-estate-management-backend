// ── Mock the chain layer BEFORE any application imports ──────────────────────
jest.mock("../src/core/blockchain/leaseEscrow.service", () => ({
  openAndFundEscrow: jest.fn(async () => ({ escrowId: "1", txHash: "0xfund" })),
  activateEscrow: jest.fn(async () => ({ txHash: "0xact" })),
  cancelEscrow: jest.fn(async () => ({ txHash: "0xcancel" })),
  releaseDeposit: jest.fn(async () => ({ txHash: "0xrelease" })),
  refundDeposit: jest.fn(async () => ({ txHash: "0xrefund" })),
  getEscrow: jest.fn(async () => ({ state: "funded" })),
  isConfigured: () => true,
}));

import mongoose from "mongoose";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { Lease } from "../src/modules/leases/lease.model";
import { AppError } from "../src/core/utils/AppError";
import * as service from "../src/modules/leases/lease.service";

// ── Seed helpers ──────────────────────────────────────────────────────────────

const makeUser = async (opts: { role?: string; walletAddress?: string } = {}) =>
  User.create({
    name: "Test User",
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    password: "Password1!",
    role: opts.role ?? "property_owner",
    ...(opts.walletAddress ? { walletAddress: opts.walletAddress } : {}),
  });

const makeListing = async (
  createdBy: string,
  listingType: "rent" | "sale" = "rent",
) =>
  Listing.create({
    title: "Test Listing",
    listingType,
    category: "residential",
    currency: "USD",
    monthlyRent: 1000,
    status: "published",
    location: { type: "Point", coordinates: [38.7, 9.0] },
    createdBy,
  });

const makeLeaseInput = (listingId: string, tenantId: string) => ({
  listingId,
  tenantId,
  monthlyRent: 1000,
  depositAmount: 2000,
  currency: "USD",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  terms: "Standard terms apply",
});

// ── Helper to advance a lease to a given state ─────────────────────────────

const advanceToProposed = async (leaseId: string, landlordId: string) =>
  service.propose(leaseId, landlordId, "property_owner");

const advanceToFunded = async (leaseId: string, adminId: string) =>
  service.fund(leaseId, adminId, "admin");

const advanceToActive = async (leaseId: string, adminId: string) =>
  service.activate(leaseId, adminId, "admin");

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("lease.service state machine", () => {
  let landlord: InstanceType<typeof User>;
  let tenant: InstanceType<typeof User>;
  let admin: InstanceType<typeof User>;
  let listing: InstanceType<typeof Listing>;

  beforeEach(async () => {
    landlord = await makeUser({
      role: "property_owner",
      walletAddress: "0x" + "a".repeat(40),
    });
    tenant = await makeUser({
      role: "tenant",
      walletAddress: "0x" + "b".repeat(40),
    });
    admin = await makeUser({ role: "admin" });
    listing = await makeListing(landlord.id, "rent");
  });

  // ── createLease ─────────────────────────────────────────────────────────────

  describe("createLease", () => {
    it("creates a draft lease on a published rent listing", async () => {
      const lease = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );

      expect(lease.status).toBe("draft");
      expect(lease.landlord.toString()).toBe(listing.createdBy.toString());
      expect(lease.tenant.toString()).toBe(tenant.id);
      expect(lease.escrowAmount).toBe(1000 + 2000);
      expect(lease.escrow.state).toBe("none");
    });

    it("sets landlord from listing.createdBy, not the caller ID", async () => {
      const lease = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      expect(lease.landlord.toString()).toBe(landlord.id);
    });

    it("rejects when listing is not a rent listing", async () => {
      const saleListing = await makeListing(landlord.id, "sale");
      await expect(
        service.createLease(
          makeLeaseInput(saleListing.id, tenant.id),
          landlord.id,
          "property_owner",
        ),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("throws 404 when listing does not exist", async () => {
      const missingId = new mongoose.Types.ObjectId().toString();
      await expect(
        service.createLease(
          makeLeaseInput(missingId, tenant.id),
          landlord.id,
          "property_owner",
        ),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("throws 404 when tenant does not exist", async () => {
      const missingId = new mongoose.Types.ObjectId().toString();
      await expect(
        service.createLease(
          makeLeaseInput(listing.id, missingId),
          landlord.id,
          "property_owner",
        ),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── propose ──────────────────────────────────────────────────────────────────

  describe("propose", () => {
    it("advances draft → proposed and sets a non-empty termsHash", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      const proposed = await service.propose(
        draft.id,
        landlord.id,
        "property_owner",
      );

      expect(proposed.status).toBe("proposed");
      expect(proposed.termsHash).toBeTruthy();
      expect(proposed.termsHash!.length).toBeGreaterThan(0);
    });

    it("throws when not in draft state", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await service.propose(draft.id, landlord.id, "property_owner");
      await expect(
        service.propose(draft.id, landlord.id, "property_owner"),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("forbids a non-landlord non-admin from proposing", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      const outsider = await makeUser({ role: "tenant" });
      await expect(
        service.propose(draft.id, outsider.id, "tenant"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── fund ─────────────────────────────────────────────────────────────────────

  describe("fund", () => {
    it("calls openAndFundEscrow, sets escrow.state=funded, escrow.escrowId='1', status stays proposed", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      const funded = await service.fund(draft.id, admin.id, "admin");

      expect(chain.openAndFundEscrow).toHaveBeenCalled();
      expect(funded.escrow.state).toBe("funded");
      expect(funded.escrow.escrowId).toBe("1");
      expect(funded.status).toBe("proposed");
    });

    it("throws when landlord has no walletAddress", async () => {
      const noWalletLandlord = await makeUser({ role: "property_owner" });
      const noWalletListing = await makeListing(noWalletLandlord.id, "rent");
      const draft = await service.createLease(
        makeLeaseInput(noWalletListing.id, tenant.id),
        noWalletLandlord.id,
        "property_owner",
      );
      await service.propose(draft.id, noWalletLandlord.id, "property_owner");
      await expect(
        service.fund(draft.id, admin.id, "admin"),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("throws when tenant has no walletAddress", async () => {
      const noWalletTenant = await makeUser({ role: "tenant" });
      const draft = await service.createLease(
        makeLeaseInput(listing.id, noWalletTenant.id),
        landlord.id,
        "property_owner",
      );
      await service.propose(draft.id, landlord.id, "property_owner");
      await expect(
        service.fund(draft.id, admin.id, "admin"),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("throws FORBIDDEN when non-admin calls fund", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await expect(
        service.fund(draft.id, landlord.id, "property_owner"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── activate ─────────────────────────────────────────────────────────────────

  describe("activate", () => {
    it("advances proposed+funded → active, calls activateEscrow('1')", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      const active = await service.activate(draft.id, admin.id, "admin");

      expect(chain.activateEscrow).toHaveBeenCalledWith("1");
      expect(active.status).toBe("active");
      expect(active.escrow.state).toBe("active");
    });

    it("throws when escrow is not funded (guard: activate when not funded)", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      // escrow state is still "none" at this point
      await expect(
        service.activate(draft.id, admin.id, "admin"),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("throws FORBIDDEN when non-admin calls activate", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await expect(
        service.activate(draft.id, landlord.id, "property_owner"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── complete ─────────────────────────────────────────────────────────────────

  describe("complete", () => {
    it("advances active → completed, calls refundDeposit('1'), escrow.state=closed", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      const completed = await service.complete(draft.id, admin.id, "admin");

      expect(chain.refundDeposit).toHaveBeenCalledWith("1");
      expect(completed.status).toBe("completed");
      expect(completed.escrow.state).toBe("closed");
    });

    it("throws FORBIDDEN when non-admin calls complete", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      await expect(
        service.complete(draft.id, landlord.id, "property_owner"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── terminate ────────────────────────────────────────────────────────────────

  describe("terminate", () => {
    it("advances active → terminated, calls releaseDeposit('1'), escrow.state=closed", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      const terminated = await service.terminate(draft.id, admin.id, "admin");

      expect(chain.releaseDeposit).toHaveBeenCalledWith("1");
      expect(terminated.status).toBe("terminated");
      expect(terminated.escrow.state).toBe("closed");
    });

    it("throws FORBIDDEN when non-admin calls terminate", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      await expect(
        service.terminate(draft.id, landlord.id, "property_owner"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe("cancel", () => {
    it("cancels a funded lease (pre-activation), calls cancelEscrow('1'), sets cancelled + escrow.state=closed", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      const cancelled = await service.cancel(
        draft.id,
        landlord.id,
        "property_owner",
      );

      expect(chain.cancelEscrow).toHaveBeenCalledWith("1");
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.escrow.state).toBe("closed");
    });

    it("allows a party (tenant) to cancel", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      const cancelled = await service.cancel(draft.id, tenant.id, "tenant");
      expect(cancelled.status).toBe("cancelled");
    });

    it("forbids an outsider (non-party, non-admin) from cancelling", async () => {
      const outsider = await makeUser({ role: "property_owner" });
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await expect(
        service.cancel(draft.id, outsider.id, "property_owner"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  // ── dispute + resolveDispute ──────────────────────────────────────────────────

  describe("dispute + resolveDispute", () => {
    it("marks an active lease as disputed", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      const disputed = await service.dispute(draft.id, tenant.id, "tenant");
      expect(disputed.status).toBe("disputed");
    });

    it("resolveDispute: release_deposit → terminated, calls releaseDeposit", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      await service.dispute(draft.id, tenant.id, "tenant");
      const resolved = await service.resolveDispute(
        draft.id,
        { decision: "release_deposit" },
        admin.id,
        "admin",
      );

      expect(chain.releaseDeposit).toHaveBeenCalledWith("1");
      expect(resolved.status).toBe("terminated");
      expect(resolved.escrow.state).toBe("closed");
    });

    it("resolveDispute: refund_deposit → completed, calls refundDeposit", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      await service.dispute(draft.id, tenant.id, "tenant");
      const resolved = await service.resolveDispute(
        draft.id,
        { decision: "refund_deposit" },
        admin.id,
        "admin",
      );

      expect(chain.refundDeposit).toHaveBeenCalledWith("1");
      expect(resolved.status).toBe("completed");
      expect(resolved.escrow.state).toBe("closed");
    });

    it("resolveDispute: cancel only valid when escrow is funded (pre-activation)", async () => {
      const chain = require("../src/core/blockchain/leaseEscrow.service");
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      // Manually set to disputed without activating so escrow.state = "funded"
      await Lease.findByIdAndUpdate(draft.id, { status: "disputed" });
      const resolved = await service.resolveDispute(
        draft.id,
        { decision: "cancel" },
        admin.id,
        "admin",
      );

      expect(chain.cancelEscrow).toHaveBeenCalledWith("1");
      expect(resolved.status).toBe("cancelled");
      expect(resolved.escrow.state).toBe("closed");
    });

    it("resolveDispute: cancel fails when escrow is active (not funded)", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      await service.dispute(draft.id, tenant.id, "tenant");
      await expect(
        service.resolveDispute(
          draft.id,
          { decision: "cancel" },
          admin.id,
          "admin",
        ),
      ).rejects.toBeInstanceOf(AppError);
    });

    it("resolveDispute throws FORBIDDEN for non-admin", async () => {
      const draft = await service.createLease(
        makeLeaseInput(listing.id, tenant.id),
        landlord.id,
        "property_owner",
      );
      await advanceToProposed(draft.id, landlord.id);
      await advanceToFunded(draft.id, admin.id);
      await advanceToActive(draft.id, admin.id);
      await service.dispute(draft.id, tenant.id, "tenant");
      await expect(
        service.resolveDispute(
          draft.id,
          { decision: "refund_deposit" },
          landlord.id,
          "property_owner",
        ),
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
