import mongoose from "mongoose";
import { Listing } from "../src/modules/listings/listing.model";
import { discover, findDuplicates } from "../src/modules/listings/listing.service";

const owner = new mongoose.Types.ObjectId();
const otherOwner = new mongoose.Types.ObjectId();

const make = (coords: [number, number], over: Record<string, unknown> = {}) =>
  Listing.create({
    title: "L",
    listingType: "rent",
    category: "residential",
    propertyType: "apartment",
    monthlyRent: 1000,
    currency: "USD",
    status: "published",
    location: { type: "Point", coordinates: coords },
    createdBy: owner,
    ...over,
  });

beforeAll(async () => {
  await Listing.init(); // ensure the 2dsphere index exists for $near/$geoWithin
});

describe("discover", () => {
  it("returns only published listings inside the viewport", async () => {
    await make([13.4, 52.5]); // inside
    await make([2.35, 48.85]); // Paris — outside
    await make([13.41, 52.51], { status: "draft" }); // inside but draft

    const { items, total } = await discover({
      swLng: 13.3,
      swLat: 52.4,
      neLng: 13.5,
      neLat: 52.6,
      page: 1,
      limit: 20,
    });

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].location.coordinates[0]).toBeCloseTo(13.4);
  });

  it("returns listings within a radius and applies filters", async () => {
    await make([13.4, 52.5], { monthlyRent: 800 });
    await make([13.405, 52.505], { monthlyRent: 3000 });

    const { items } = await discover({
      lng: 13.4,
      lat: 52.5,
      radius: 2000,
      maxPrice: 1000,
      page: 1,
      limit: 20,
    } as never);

    expect(items).toHaveLength(1);
    expect(items[0].monthlyRent).toBe(800);
  });

  it("returns listings inside a custom polygon boundary", async () => {
    await make([13.4, 52.5]);
    await make([13.8, 52.9]);

    const { items, total } = await discover({
      polygon: [
        [13.3, 52.4],
        [13.5, 52.4],
        [13.5, 52.6],
        [13.3, 52.6],
      ],
      page: 1,
      limit: 20,
    });

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].location.coordinates[0]).toBeCloseTo(13.4);
  });
});

describe("findDuplicates", () => {
  it("flags another listing by the same owner", async () => {
    const a = await make([13.4, 52.5], { title: "Alpha" });
    await make([20, 40], { title: "Beta" }); // same owner, far away

    const dups = await findDuplicates(a.id);
    expect(dups.length).toBeGreaterThanOrEqual(1);
    expect(dups.some((d) => d.reasons.includes("same_owner"))).toBe(true);
  });

  it("flags a nearby listing with the same title from a different owner", async () => {
    const a = await make([13.4, 52.5], { title: "Twin Tower" });
    await make([13.4001, 52.5001], {
      title: "Twin Tower",
      createdBy: otherOwner,
    });

    const dups = await findDuplicates(a.id);
    expect(dups.some((d) => d.reasons.includes("nearby_similar"))).toBe(true);
  });
});
