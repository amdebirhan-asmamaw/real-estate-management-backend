import mongoose from "mongoose";
import { Listing } from "../src/modules/listings/listing.model";

const base = {
  title: "Sunny 2BR",
  description: "Bright apartment",
  listingType: "rent" as const,
  category: "residential" as const,
  monthlyRent: 1200,
  bedrooms: 2,
  bathrooms: 1,
  area: { value: 75, unit: "sqm" as const },
  address: { city: "Berlin", country: "DE" },
  location: { type: "Point" as const, coordinates: [13.405, 52.52] },
  createdBy: new mongoose.Types.ObjectId(),
};

describe("Listing model", () => {
  it("persists a valid listing with defaults", async () => {
    const doc = await Listing.create(base);
    expect(doc.status).toBe("draft");
    expect(doc.verificationStatus).toBe("unverified");
    expect(doc.currency).toBe("USD");
    expect(doc.location.coordinates).toEqual([13.405, 52.52]);
  });

  it("rejects out-of-range coordinates", async () => {
    await expect(
      Listing.create({
        ...base,
        location: { type: "Point", coordinates: [200, 52] },
      }),
    ).rejects.toThrow();
  });

  it("exposes a 2dsphere index on location", async () => {
    await Listing.init(); // ensure indexes are built
    const indexes = await Listing.collection.indexes();
    expect(
      indexes.some((i) => i.key && i.key.location === "2dsphere"),
    ).toBe(true);
  });

  it("stores private documents but omits them from default JSON", async () => {
    const doc = await Listing.create({
      ...base,
      documents: [
        { type: "title_deed", publicId: "secret/abc", hash: "deadbeef" },
      ],
    });
    expect(doc.documents).toHaveLength(1);
    expect(doc.documents[0].status).toBe("pending");

    const json = doc.toJSON() as Record<string, unknown>;
    expect(json.documents).toBeUndefined();
  });
});
