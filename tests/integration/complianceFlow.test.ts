// ── Mock chain services so compliance-adjacent modules that import them compile ─
jest.mock("../../src/core/blockchain/leaseEscrow.service", () => ({
  openAndFundEscrow: jest.fn(),
  activateEscrow: jest.fn(),
  cancelEscrow: jest.fn(),
  releaseDeposit: jest.fn(),
  refundDeposit: jest.fn(),
  getEscrow: jest.fn(),
  isConfigured: () => false,
  toBaseUnits: jest.fn(async (amount: number) => BigInt(amount) * BigInt(10 ** 18)),
}));
jest.mock("../../src/core/blockchain/saleEscrow.service", () => ({
  openAndFundEscrow: jest.fn(),
  releaseEscrow: jest.fn(),
  refundEscrow: jest.fn(),
  getEscrow: jest.fn(),
  isConfigured: () => false,
  toBaseUnits: jest.fn(async (amount: number) => BigInt(amount) * BigInt(10 ** 18)),
}));

import mongoose from "mongoose";
import {
  seedUser,
  seedVerifiedUserWithWallet,
  seedPublishedSaleListing,
} from "./_helpers";
import { Notification } from "../../src/modules/notifications/notification.model";
import * as complianceService from "../../src/modules/compliance/compliance.service";
import * as queuesService from "../../src/modules/compliance/queues.service";

// DB harness (connect / clear / disconnect) is provided by tests/setup.ts
// which is registered as setupFilesAfterEnv in jest.config.js.

describe("integration: compliance flow", () => {
  it("admin flags listing suspicious → appears in suspicious queue → update/resolve → no longer open", async () => {
    // ── seed actors ─────────────────────────────────────────────────────────
    const listingOwner = await seedVerifiedUserWithWallet("property_owner");
    const admin = await seedUser({ role: "admin" });
    const listing = await seedPublishedSaleListing(listingOwner.id, "verified");

    // ── admin flags the listing as suspicious ─────────────────────────────
    const flaggedCase = await complianceService.adminFlagCase(
      {
        targetType: "listing",
        targetId: listing.id,
        severity: "high",
        title: "Suspicious listing activity",
        description: "Multiple high-value offers from unverified accounts",
      },
      admin.id,
      "admin",
    );
    expect(flaggedCase.status).toBe("open");
    expect(flaggedCase.type).toBe("listing");
    expect(flaggedCase.severity).toBe("high");
    expect(flaggedCase.targetId?.toString()).toBe(listing.id.toString());

    // ── appears in suspicious queue ────────────────────────────────────────
    const queue = await queuesService.suspiciousQueue({ page: 1, limit: 10 });
    expect(queue.total).toBeGreaterThanOrEqual(1);
    const queuedCase = queue.items.find(
      (item: unknown) =>
        (item as { _id: mongoose.Types.ObjectId })._id.toString() === flaggedCase.id,
    );
    expect(queuedCase).toBeDefined();

    // ── admin updates case to under_review ─────────────────────────────────
    const underReview = await complianceService.updateCase(
      flaggedCase.id,
      { status: "under_review", note: "Investigating now" },
      admin.id,
      "admin",
    );
    expect(underReview.status).toBe("under_review");

    // still in queue (under_review is included)
    const queueMid = await queuesService.suspiciousQueue({ page: 1, limit: 10 });
    const stillInQueue = queueMid.items.find(
      (item: unknown) =>
        (item as { _id: mongoose.Types.ObjectId })._id.toString() === flaggedCase.id,
    );
    expect(stillInQueue).toBeDefined();

    // ── admin resolves case ────────────────────────────────────────────────
    const resolved = await complianceService.updateCase(
      flaggedCase.id,
      { status: "resolved", resolution: "No violation found after review" },
      admin.id,
      "admin",
    );
    expect(resolved.status).toBe("resolved");

    // ── no longer open in suspicious queue ────────────────────────────────
    const queueAfter = await queuesService.suspiciousQueue({ page: 1, limit: 10 });
    const noLongerQueued = queueAfter.items.find(
      (item: unknown) =>
        (item as { _id: mongoose.Types.ObjectId })._id.toString() === flaggedCase.id,
    );
    expect(noLongerQueued).toBeUndefined();
  });

  it("compliance.case_opened notification is created for the listing owner when case is flagged", async () => {
    // ── seed ─────────────────────────────────────────────────────────────
    const listingOwner = await seedVerifiedUserWithWallet("property_owner");
    const admin = await seedUser({ role: "admin" });
    const listing = await seedPublishedSaleListing(listingOwner.id, "verified");

    await complianceService.adminFlagCase(
      {
        targetType: "listing",
        targetId: listing.id,
        severity: "medium",
        title: "Compliance check required",
      },
      admin.id,
      "admin",
    );

    // ── verify notification was sent to listing owner ─────────────────────
    const notifs = await Notification.find({
      recipient: listingOwner.id,
      type: "compliance.case_opened",
    });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs[0].title).toBe("Compliance case opened");
  });

  it("idempotent: flagging the same listing twice does not create duplicate open cases", async () => {
    const listingOwner = await seedVerifiedUserWithWallet("property_owner");
    const admin = await seedUser({ role: "admin" });
    const listing = await seedPublishedSaleListing(listingOwner.id, "verified");

    const flagInput = {
      targetType: "listing" as const,
      targetId: listing.id,
      severity: "high" as const,
      title: "Duplicate test",
    };

    await complianceService.adminFlagCase(flagInput, admin.id, "admin");
    await complianceService.adminFlagCase(flagInput, admin.id, "admin");

    const queue = await queuesService.suspiciousQueue({ page: 1, limit: 10 });
    const matchingCases = queue.items.filter(
      (item: unknown) =>
        (item as { targetId?: string })?.targetId?.toString() === listing.id.toString(),
    );
    expect(matchingCases.length).toBe(1);
  });
});
