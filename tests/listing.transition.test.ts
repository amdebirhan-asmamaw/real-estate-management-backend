import mongoose from "mongoose";
import * as service from "../src/modules/listings/listing.service";
import { AppError } from "../src/core/utils/AppError";
import { AuditLog } from "../src/modules/audit/audit.model";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const adminId = new mongoose.Types.ObjectId().toString();

const input: CreateListingInput = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  monthlyRent: 1000,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

const newListing = () => service.createListing(input, ownerId, "property_owner");

describe("listing transition state machine", () => {
  it("walks the full happy path draft → submitted → under_review → approved → published", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await service.transition(doc.id, { action: "start_review" }, adminId, "admin");
    await service.transition(doc.id, { action: "approve" }, adminId, "admin");
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

  it("allows archive from published", async () => {
    const doc = await newListing();
    await service.transition(doc.id, { action: "submit" }, ownerId, "property_owner");
    await service.transition(doc.id, { action: "start_review" }, adminId, "admin");
    await service.transition(doc.id, { action: "approve" }, adminId, "admin");
    await service.transition(doc.id, { action: "publish" }, adminId, "admin");
    const archived = await service.transition(doc.id, { action: "archive" }, adminId, "admin");
    expect(archived.status).toBe("archived");
  });
});
