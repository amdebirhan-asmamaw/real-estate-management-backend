import mongoose from "mongoose";
import * as service from "../src/modules/listings/listing.service";
import { Listing } from "../src/modules/listings/listing.model";
import { AppError } from "../src/core/utils/AppError";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const otherId = new mongoose.Types.ObjectId().toString();

const input: CreateListingInput = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  monthlyRent: 1000,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

describe("listing.service CRUD", () => {
  it("creates a draft listing owned by the caller", async () => {
    const doc = await service.createListing(input, ownerId);
    expect(doc.createdBy.toString()).toBe(ownerId);
    expect(doc.status).toBe("draft");
  });

  it("blocks a non-owner non-admin from updating", async () => {
    const doc = await service.createListing(input, ownerId);
    await expect(
      service.updateListing(doc.id, { title: "Hacked" }, otherId, "tenant"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lets an admin update any listing", async () => {
    const doc = await service.createListing(input, ownerId);
    const updated = await service.updateListing(
      doc.id,
      { title: "By Admin" },
      otherId,
      "admin",
    );
    expect(updated.title).toBe("By Admin");
  });

  it("blocks an owner from editing a published listing", async () => {
    const doc = await service.createListing(input, ownerId);
    await Listing.findByIdAndUpdate(doc.id, { status: "published" });
    await expect(
      service.updateListing(doc.id, { title: "Sneaky" }, ownerId, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws 404 for a missing listing", async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    await expect(
      service.getListingById(missing, null, null),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("hides non-published listings from anonymous callers", async () => {
    const doc = await service.createListing(input, ownerId);
    await expect(
      service.getListingById(doc.id, null, null),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("shows a published listing to anyone", async () => {
    const doc = await service.createListing(input, ownerId);
    await Listing.findByIdAndUpdate(doc.id, { status: "published" });
    const found = await service.getListingById(doc.id, null, null);
    expect(found.id).toBe(doc.id);
  });

  it("lists the caller's own listings", async () => {
    await service.createListing(input, ownerId);
    await service.createListing(input, ownerId);
    await service.createListing(input, otherId);
    const mine = await service.listMine(ownerId);
    expect(mine).toHaveLength(2);
  });
});
