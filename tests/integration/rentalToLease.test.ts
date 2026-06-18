// ── Mock the chain layer BEFORE any application imports ──────────────────────
jest.mock("../../src/core/blockchain/leaseEscrow.service", () => ({
  openAndFundEscrow: jest.fn(async () => ({ escrowId: "1", txHash: "0xfund" })),
  activateEscrow: jest.fn(async () => ({ txHash: "0xact" })),
  cancelEscrow: jest.fn(async () => ({ txHash: "0xcancel" })),
  releaseDeposit: jest.fn(async () => ({ txHash: "0xrelease" })),
  refundDeposit: jest.fn(async () => ({ txHash: "0xrefund" })),
  getEscrow: jest.fn(async () => ({ state: "funded" })),
  isConfigured: () => true,
  toBaseUnits: jest.fn(async (amount: number) => BigInt(amount) * BigInt(10 ** 18)),
}));

import {
  seedVerifiedUserWithWallet,
  seedUser,
  seedPublishedRentListing,
} from "./_helpers";
import { Notification } from "../../src/modules/notifications/notification.model";
import * as rentalAppService from "../../src/modules/rentalApplications/rentalApplication.service";
import * as leaseService from "../../src/modules/leases/lease.service";

// DB harness (connect / clear / disconnect) is provided by tests/setup.ts
// which is registered as setupFilesAfterEnv in jest.config.js.

describe("integration: rental application → lease lifecycle", () => {
  it("full flow: submit → screen passed → approve → create lease → propose → sign → fund → activate → complete", async () => {
    const chain = require("../../src/core/blockchain/leaseEscrow.service");

    // ── seed actors ──────────────────────────────────────────────────────────
    const landlord = await seedVerifiedUserWithWallet("property_owner");
    const tenant = await seedVerifiedUserWithWallet("tenant");
    const admin = await seedUser({ role: "admin" });
    const listing = await seedPublishedRentListing(landlord.id);

    // ── tenant submits application ────────────────────────────────────────────
    const application = await rentalAppService.create(tenant.id, "tenant", {
      listingId: listing.id,
      desiredStartDate: "2026-08-01",
      desiredEndDate: "2027-07-31",
    });
    expect(application.status).toBe("submitted");

    // ── landlord screens (passed) ─────────────────────────────────────────────
    const screened = await rentalAppService.updateScreening(
      application.id,
      { status: "passed", provider: "TestProvider", reference: "REF001" },
      landlord.id,
      "property_owner",
    );
    expect(screened.screening.status).toBe("passed");

    // ── landlord approves ─────────────────────────────────────────────────────
    const approved = await rentalAppService.review(
      application.id,
      { status: "approved" },
      landlord.id,
      "property_owner",
    );
    expect(approved.status).toBe("approved");

    // ── landlord creates lease from approved application ──────────────────────
    const updatedApp = await rentalAppService.createLease(
      application.id,
      {
        monthlyRent: 1500,
        depositAmount: 3000,
        currency: "USD",
        startDate: "2026-08-01",
        endDate: "2027-07-31",
        terms: "Standard terms apply",
      },
      landlord.id,
      "property_owner",
    );
    expect(updatedApp.status).toBe("lease_created");
    expect(updatedApp.lease).toBeDefined();

    const leaseId = updatedApp.lease!.toString();

    // ── landlord proposes lease ───────────────────────────────────────────────
    const proposed = await leaseService.propose(leaseId, landlord.id, "property_owner");
    expect(proposed.status).toBe("proposed");

    // ── tenant signs lease ────────────────────────────────────────────────────
    const signed = await leaseService.sign(leaseId, tenant.id, "tenant");
    expect(signed.signedByTenantAt).toBeInstanceOf(Date);

    // ── admin funds escrow ────────────────────────────────────────────────────
    const funded = await leaseService.fund(leaseId, admin.id, "admin");
    expect(funded.escrow.state).toBe("funded");
    expect(funded.escrow.escrowId).toBe("1");
    expect(chain.openAndFundEscrow).toHaveBeenCalled();

    // ── admin activates lease ─────────────────────────────────────────────────
    const active = await leaseService.activate(leaseId, admin.id, "admin");
    expect(active.status).toBe("active");
    expect(active.escrow.state).toBe("active");
    expect(chain.activateEscrow).toHaveBeenCalledWith("1");

    // ── admin completes lease ─────────────────────────────────────────────────
    const completed = await leaseService.complete(leaseId, admin.id, "admin");
    expect(completed.status).toBe("completed");
    expect(completed.escrow.state).toBe("closed");
    expect(chain.refundDeposit).toHaveBeenCalledWith("1");

    // ── cross-module: rental application is lease_created ────────────────────
    const { RentalApplication } = await import("../../src/modules/rentalApplications/rentalApplication.model");
    const finalApp = await RentalApplication.findById(application.id);
    expect(finalApp?.status).toBe("lease_created");

    // ── notifications were created for tenant on status changes ──────────────
    const notifs = await Notification.find({ recipient: tenant.id });
    expect(notifs.length).toBeGreaterThan(0);
  });
});
