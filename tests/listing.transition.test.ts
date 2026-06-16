import mongoose from "mongoose";
import * as service from "../src/modules/listings/listing.service";
import { AppError } from "../src/core/utils/AppError";
import { AuditLog } from "../src/modules/audit/audit.model";
import { Listing } from "../src/modules/listings/listing.model";
import { User } from "../src/modules/auth/auth.model";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const adminId = new mongoose.Types.ObjectId().toString();

// The owner must have an active (verified) account to submit for review.
beforeEach(async () => {
  await User.create({
    _id: ownerId,
    name: "Owner",
    email: "owner-tx@example.com",
    password: "Password123",
    role: "property_owner",
    accountStatus: "active",
    kycStatus: "verified",
  });
});

const input: CreateListingInput = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  propertyType: "apartment",
  monthlyRent: 1000,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

const newListing = () => service.createListing(input, ownerId, "property_owner");

// Simulate a completed ownership verification (approved title deed + hash) so a
// listing is eligible to be published.
const markVerified = (id: string) =>
  Listing.findByIdAndUpdate(id, {
    verificationStatus: "verified",
    ownershipDocumentHash: "deadbeef",
    $push: {
      documents: {
        type: "title_deed",
        publicId: "secret/deed",
        hash: "deadbeef",
        status: "approved",
      },
    },
  });

describe("listing transition state machine", () => {
  it("walks the full happy path draft → submitted → under_review → approved → published", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await service.transition(doc.id, { action: "start_review" }, adminId, "admin");
    await service.transition(doc.id, { action: "approve" }, adminId, "admin");
    await markVerified(doc.id);
    const published = await service.transition(doc.id, { action: "publish" }, adminId, "admin");
    expect(published.status).toBe("published");

    const logs = await AuditLog.find({ targetId: doc.id }).sort({ createdAt: 1 });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual([
      "listing.created",
      "listing.submitted",
      "listing.review_started",
      "listing.approved",
      "listing.published",
    ]);
  });

  it("forbids a property_owner from publishing (admin-only action)", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await service.transition(doc.id, { action: "start_review" }, adminId, "admin");
    await service.transition(doc.id, { action: "approve" }, adminId, "admin");
    await expect(
      service.transition(doc.id, { action: "publish" }, ownerId, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects an illegal transition (submitted → publish)", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await expect(
      service.transition(doc.id, { action: "publish" }, adminId, "admin"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("records the rejection reason on reject", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await service.transition(doc.id, { action: "start_review" }, adminId, "admin");
    const rejected = await service.transition(
      doc.id,
      { action: "reject", reason: "missing_document", note: "Need the deed" },
      adminId,
      "admin",
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.review.rejectionReason?.code).toBe("missing_document");
  });

  it("forbids a pending (unverified) owner from submitting", async () => {
    const pendingOwnerId = new mongoose.Types.ObjectId().toString();
    await User.create({
      _id: pendingOwnerId,
      name: "Pending",
      email: "pending-owner@example.com",
      password: "Password123",
      role: "property_owner",
      accountStatus: "pending",
    });
    const doc = await service.createListing(input, pendingOwnerId, "property_owner");
    await expect(
      service.transition(doc.id, { action: "submit" }, pendingOwnerId, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses to publish an approved listing whose ownership is not verified", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await service.transition(doc.id, { action: "start_review" }, adminId, "admin");
    await service.transition(doc.id, { action: "approve" }, adminId, "admin");
    // No verified ownership / approved title deed → publish must be blocked.
    await expect(
      service.transition(doc.id, { action: "publish" }, adminId, "admin"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("allows archive from published", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await service.transition(doc.id, { action: "start_review" }, adminId, "admin");
    await service.transition(doc.id, { action: "approve" }, adminId, "admin");
    await markVerified(doc.id);
    await service.transition(doc.id, { action: "publish" }, adminId, "admin");
    const archived = await service.transition(doc.id, { action: "archive" }, adminId, "admin");
    expect(archived.status).toBe("archived");
  });
});
