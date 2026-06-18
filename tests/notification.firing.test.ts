// Mock chain so listing.service can be imported without blockchain config.
jest.mock("../src/core/blockchain/propertyTitle.service", () => ({
  isConfigured: () => false,
  mintTitle: jest.fn(),
  getTitle: jest.fn(),
  disputeTitle: jest.fn(),
  clearTitleDispute: jest.fn(),
}));

import mongoose from "mongoose";
import * as complianceService from "../src/modules/compliance/compliance.service";
import * as listingService from "../src/modules/listings/listing.service";
import * as notificationService from "../src/modules/notifications/notification.service";
import { Notification } from "../src/modules/notifications/notification.model";
import { User } from "../src/modules/auth/auth.model";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const adminId = new mongoose.Types.ObjectId().toString();

const baseInput: CreateListingInput = {
  title: "Review Flat",
  listingType: "rent",
  category: "residential",
  propertyType: "apartment",
  monthlyRent: 2000,
  currency: "USD",
  location: { type: "Point", coordinates: [38.7, 9.0] },
};

// ─── A7: compliance.case_opened ───────────────────────────────────────────────

describe("compliance.case_opened notification", () => {
  it("notifies the subject user when flagSuspiciousListing creates a case", async () => {
    const subjectId = new mongoose.Types.ObjectId().toString();
    const listingId = new mongoose.Types.ObjectId().toString();

    await complianceService.flagSuspiciousListing({
      listingId,
      ownerId: subjectId,
      reason: "suspicious",
      note: "Test note",
    });

    const notif = await Notification.findOne({
      recipient: subjectId,
      type: "compliance.case_opened",
    });

    expect(notif).not.toBeNull();
    expect(notif!.title).toBe("Compliance case opened");
    expect(notif!.message).toContain("listing");
  });

  it("notifies the subject user when a KYC compliance case is opened directly", async () => {
    const userId = new mongoose.Types.ObjectId().toString();

    await complianceService.flagKycRejection(userId, "KYC documents invalid");

    const notif = await Notification.findOne({
      recipient: userId,
      type: "compliance.case_opened",
    });

    expect(notif).not.toBeNull();
    expect(notif!.message).toContain("kyc");
  });

  it("is best-effort — second call for same target is idempotent (no duplicate case) but notification may re-fire", async () => {
    const subjectId = new mongoose.Types.ObjectId().toString();
    const listingId = new mongoose.Types.ObjectId().toString();

    await complianceService.flagSuspiciousListing({ listingId, ownerId: subjectId });
    // Second call with same target hits the existing-case guard; openCase returns
    // early so the notification is not fired again.
    await complianceService.flagSuspiciousListing({ listingId, ownerId: subjectId });

    const notifs = await Notification.find({ recipient: subjectId, type: "compliance.case_opened" });
    // Only one case was created, so only one notification.
    expect(notifs).toHaveLength(1);
  });

  it("does not throw if subjectUser is missing (no notification sent)", async () => {
    const targetId = new mongoose.Types.ObjectId().toString();
    // openCase without subjectUser — should not throw.
    await expect(
      complianceService.openCase({
        type: "listing",
        severity: "low",
        title: "No subject",
        targetType: "listing",
        targetId,
      }),
    ).resolves.toBeDefined();
  });
});

// ─── A7: admin.review_requested ───────────────────────────────────────────────

describe("admin.review_requested notification", () => {
  beforeEach(async () => {
    // Create an admin user in the DB so User.find picks them up.
    await User.create({
      _id: adminId,
      name: "Admin User",
      email: "admin@example.com",
      password: "hashedpassword123",
      role: "admin",
      accountStatus: "active",
      kycStatus: "not_started",
    });
  });

  it("notifies admins when an owner uploads documents", async () => {
    const listing = await listingService.createListing(baseInput, ownerId, "property_owner");

    // Spy on notify to confirm it is called without actually needing file upload.
    const notifySpy = jest.spyOn(notificationService, "notify");

    await listingService.addDocuments(
      listing.id,
      [{ type: "title_deed", publicId: "pub123", hash: "abc123" }],
      ownerId,
      "property_owner",
    );

    const adminNotifications = notifySpy.mock.calls.filter(
      (call) => call[0].type === "admin.review_requested",
    );

    expect(adminNotifications.length).toBeGreaterThanOrEqual(1);
    const adminCall = adminNotifications.find(
      (call) => call[0].recipient === adminId,
    );
    expect(adminCall).toBeDefined();
    expect(adminCall![0].title).toBe("Ownership document review requested");
    expect(adminCall![0].message).toContain(listing.title);

    notifySpy.mockRestore();
  });

  it("admin notifications are persisted to the DB", async () => {
    const listing = await listingService.createListing(baseInput, ownerId, "property_owner");

    await listingService.addDocuments(
      listing.id,
      [{ type: "title_deed", publicId: "pub456", hash: "def456" }],
      ownerId,
      "property_owner",
    );

    const notif = await Notification.findOne({
      recipient: adminId,
      type: "admin.review_requested",
    });

    expect(notif).not.toBeNull();
    expect(notif!.metadata?.listingId).toBe(listing.id);
    expect(notif!.metadata?.uploadedBy).toBe(ownerId);
  });

  it("does not throw if no admins exist in the database", async () => {
    // Wipe the admin created in beforeEach.
    await User.deleteMany({});

    const listing = await listingService.createListing(baseInput, ownerId, "property_owner");

    await expect(
      listingService.addDocuments(
        listing.id,
        [{ type: "other", publicId: "pub789", hash: "xyz789" }],
        ownerId,
        "property_owner",
      ),
    ).resolves.toBeDefined();
  });
});
