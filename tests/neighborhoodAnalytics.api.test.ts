import request from "supertest";
import app from "../src/app";
import { Listing } from "../src/modules/listings/listing.model";
import mongoose from "mongoose";

const ownerId = new mongoose.Types.ObjectId().toString();

const base = {
  listingType: "rent" as const,
  category: "residential" as const,
  propertyType: "apartment",
  status: "published",
  location: { type: "Point" as const, coordinates: [38.7, 9.0] as [number, number] },
  createdBy: ownerId,
  availabilityStatus: "available",
};

describe("GET /listings/analytics/neighborhood", () => {
  beforeEach(async () => {
    // Seed 3 listings in Addis Ababa and 2 in Nairobi
    await Listing.create([
      {
        ...base,
        title: "AA Flat 1",
        monthlyRent: 1000,
        address: { city: "Addis Ababa", region: "Addis Ababa" },
      },
      {
        ...base,
        title: "AA Flat 2",
        monthlyRent: 1200,
        address: { city: "Addis Ababa", region: "Addis Ababa" },
      },
      {
        ...base,
        title: "AA Flat 3",
        monthlyRent: 1400,
        availabilityStatus: "rented",
        address: { city: "Addis Ababa", region: "Addis Ababa" },
      },
      {
        ...base,
        title: "NBI Flat 1",
        monthlyRent: 900,
        address: { city: "Nairobi", region: "Nairobi" },
      },
      {
        ...base,
        title: "NBI Flat 2",
        monthlyRent: 1100,
        address: { city: "Nairobi", region: "Nairobi" },
      },
    ]);
  });

  it("returns aggregated stats per city", async () => {
    const res = await request(app)
      .get("/api/v1/listings/analytics/neighborhood")
      .expect(200);

    const data = res.body.data as Array<{
      city: string;
      count: number;
      avgMonthlyRent: number;
      availability: Record<string, number>;
    }>;

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);

    const aa = data.find((d) => d.city === "Addis Ababa");
    expect(aa).toBeDefined();
    expect(aa!.count).toBe(3);
    // avg of 1000, 1200, 1400 = 1200
    expect(aa!.avgMonthlyRent).toBe(1200);
    // availability breakdown
    expect(aa!.availability["available"]).toBe(2);
    expect(aa!.availability["rented"]).toBe(1);

    const nbi = data.find((d) => d.city === "Nairobi");
    expect(nbi).toBeDefined();
    expect(nbi!.count).toBe(2);
    expect(nbi!.avgMonthlyRent).toBe(1000);
  });

  it("filters by region when provided", async () => {
    const res = await request(app)
      .get("/api/v1/listings/analytics/neighborhood?region=Nairobi")
      .expect(200);

    const data = res.body.data as Array<{ city: string }>;
    const cities = data.map((d) => d.city);
    expect(cities).toContain("Nairobi");
    expect(cities).not.toContain("Addis Ababa");
  });

  it("does not include non-published listings", async () => {
    await Listing.create({
      ...base,
      title: "Draft Flat",
      monthlyRent: 500,
      status: "draft",
      address: { city: "Kigali", region: "Kigali" },
    });

    const res = await request(app)
      .get("/api/v1/listings/analytics/neighborhood")
      .expect(200);

    const data = res.body.data as Array<{ city: string }>;
    const cities = data.map((d) => d.city);
    expect(cities).not.toContain("Kigali");
  });
});
