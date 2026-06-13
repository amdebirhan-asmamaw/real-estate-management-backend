import mongoose from "mongoose";
import * as favorites from "../src/modules/favorites/favorite.service";
import * as listings from "../src/modules/listings/listing.service";
import { Listing } from "../src/modules/listings/listing.model";
import { AppError } from "../src/core/utils/AppError";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const tenantId = new mongoose.Types.ObjectId().toString();

const input: CreateListingInput = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  monthlyRent: 1000,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

const publishedListing = async () => {
  const doc = await listings.createListing(input, ownerId, "property_owner");
  await Listing.findByIdAndUpdate(doc.id, { status: "published" });
  return doc;
};

describe("favorites.service", () => {
  it("saves a published listing for a user", async () => {
    const doc = await publishedListing();
    const fav = await favorites.addFavorite(tenantId, doc.id, "tenant");
    expect(fav.user.toString()).toBe(tenantId);
    expect(fav.listing.toString()).toBe(doc.id);
  });

  it("is idempotent when saving the same listing twice", async () => {
    const doc = await publishedListing();
    await favorites.addFavorite(tenantId, doc.id, "tenant");
    await favorites.addFavorite(tenantId, doc.id, "tenant");
    const mine = await favorites.listFavorites(tenantId);
    expect(mine).toHaveLength(1);
  });

  it("refuses to favorite a non-published listing the user can't see", async () => {
    const draft = await listings.createListing(input, ownerId, "property_owner");
    await expect(
      favorites.addFavorite(tenantId, draft.id, "tenant"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("removes a favorite (idempotent)", async () => {
    const doc = await publishedListing();
    await favorites.addFavorite(tenantId, doc.id, "tenant");
    await favorites.removeFavorite(tenantId, doc.id);
    await favorites.removeFavorite(tenantId, doc.id); // no error second time
    const mine = await favorites.listFavorites(tenantId);
    expect(mine).toHaveLength(0);
  });

  it("lists the user's favorited listings", async () => {
    const a = await publishedListing();
    const b = await publishedListing();
    await favorites.addFavorite(tenantId, a.id, "tenant");
    await favorites.addFavorite(tenantId, b.id, "tenant");
    const mine = await favorites.listFavorites(tenantId);
    expect(mine).toHaveLength(2);
    expect(mine[0].id).toBeDefined();
  });
});
