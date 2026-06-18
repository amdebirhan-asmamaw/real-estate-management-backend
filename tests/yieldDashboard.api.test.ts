import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { Lease } from "../src/modules/leases/lease.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const register = async (email: string, role: "property_owner" | "tenant") => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Yield Dashboard User", email, password: PASSWORD, role });
  return res.body.data.tokens.accessToken as string;
};

describe("GET /listings/dashboard/yield", () => {
  it("returns zeros when the owner has no leases", async () => {
    const token = await register("yield-empty@example.com", "property_owner");

    const res = await request(app)
      .get("/api/v1/listings/dashboard/yield")
      .set(bearer(token))
      .expect(200);

    expect(res.body.data.activeLeaseCount).toBe(0);
    expect(res.body.data.grossMonthlyRent).toBe(0);
    expect(res.body.data.realizedRevenue).toBe(0);
    expect(res.body.data.occupancyRate).toBe(0);
  });

  it("returns correct rollup with seeded active + completed leases", async () => {
    const token = await register("yield-full@example.com", "property_owner");
    const owner = await User.findOne({ email: "yield-full@example.com" });
    const tenant = await User.create({
      name: "Tenant Y",
      email: "yield-tenant-y@example.com",
      password: PASSWORD,
      role: "tenant",
    });

    const listing1 = await Listing.create({
      title: "Yield L1",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1000,
      status: "rented",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner!.id,
    });
    const listing2 = await Listing.create({
      title: "Yield L2",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1500,
      status: "published",
      location: { type: "Point", coordinates: [38.8, 9.1] },
      createdBy: owner!.id,
    });

    const leaseBase = {
      landlord: owner!.id,
      tenant: tenant.id,
      currency: "USD",
      depositAmount: 2000,
      escrowAmount: 3000,
      startDate: new Date(Date.now() - 30 * 86_400_000),
      endDate: new Date(Date.now() + 335 * 86_400_000),
      escrow: { state: "active" as const, escrowId: "1", fundTxHash: "0xf" },
      createdBy: owner!.id,
    };

    // Active lease on listing1
    await Lease.create({
      ...leaseBase,
      listing: listing1.id,
      monthlyRent: 1000,
      status: "active",
    });
    // Completed lease on listing2
    await Lease.create({
      ...leaseBase,
      listing: listing2.id,
      monthlyRent: 1500,
      status: "completed",
      escrow: { state: "closed", escrowId: "2", fundTxHash: "0xg" },
    });

    const res = await request(app)
      .get("/api/v1/listings/dashboard/yield")
      .set(bearer(token))
      .expect(200);

    const d = res.body.data as {
      totalListings: number;
      activeLeaseCount: number;
      grossMonthlyRent: number;
      realizedRevenue: number;
      occupancyRate: number;
    };

    expect(d.totalListings).toBe(2);
    expect(d.activeLeaseCount).toBe(1);
    expect(d.grossMonthlyRent).toBe(1000);
    expect(d.realizedRevenue).toBe(1500);
    // 1 rented out of (1 published + 1 rented) = 0.5
    expect(d.occupancyRate).toBe(0.5);
  });

  it("rejects unauthenticated requests", async () => {
    await request(app)
      .get("/api/v1/listings/dashboard/yield")
      .expect(401);
  });
});
