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
    .send({ name: "Yield User", email, password: PASSWORD, role });
  return res.body.data.tokens.accessToken as string;
};

describe("Rental yield API", () => {
  it("records maintenance costs and returns owner yield summary", async () => {
    const ownerToken = await register("yield-owner@example.com", "property_owner");
    const owner = await User.findOne({ email: "yield-owner@example.com" });
    const tenant = await User.create({
      name: "Tenant",
      email: "yield-tenant@example.com",
      password: PASSWORD,
      role: "tenant",
    });
    const listing = await Listing.create({
      title: "Yield Rental",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1500,
      price: 150000,
      currency: "USD",
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner!.id,
    });
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 2);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 10);
    await Lease.create({
      listing: listing.id,
      landlord: owner!.id,
      tenant: tenant.id,
      currency: "USD",
      monthlyRent: 1500,
      depositAmount: 3000,
      escrowAmount: 4500,
      startDate,
      endDate,
      status: "active",
      escrow: { state: "active", escrowId: "1", fundTxHash: "0xfund" },
      createdBy: owner!.id,
    });

    const created = await request(app)
      .post(`/api/v1/listings/${listing.id}/maintenance-records`)
      .set(bearer(ownerToken))
      .send({
        type: "repair",
        amount: 250,
        currency: "USD",
        incurredAt: new Date().toISOString(),
        note: "Plumbing repair",
      })
      .expect(201);
    expect(created.body.data.type).toBe("repair");

    const records = await request(app)
      .get(`/api/v1/listings/${listing.id}/maintenance-records`)
      .set(bearer(ownerToken))
      .expect(200);
    expect(records.body.data.total).toBe(1);

    const summary = await request(app)
      .get(`/api/v1/listings/${listing.id}/yield`)
      .set(bearer(ownerToken))
      .expect(200);
    expect(summary.body.data.maintenanceCost).toBe(250);
    expect(summary.body.data.grossRent).toBeGreaterThan(0);
    expect(summary.body.data.netIncome).toBe(summary.body.data.grossRent - 250);
    expect(summary.body.data.escrowHistory).toHaveLength(1);
  });

  it("prevents another owner from reading yield data", async () => {
    await register("yield-owner2@example.com", "property_owner");
    const otherToken = await register("yield-other@example.com", "property_owner");
    const owner = await User.findOne({ email: "yield-owner2@example.com" });
    const listing = await Listing.create({
      title: "Private Yield",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1200,
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner!.id,
    });

    await request(app)
      .get(`/api/v1/listings/${listing.id}/yield`)
      .set(bearer(otherToken))
      .expect(403);
  });
});

describe("Lease timeline API", () => {
  it("returns a tenant-visible lease timeline", async () => {
    const owner = await User.create({
      name: "Owner",
      email: "timeline-owner@example.com",
      password: PASSWORD,
      role: "property_owner",
    });
    const tenantToken = await register("timeline-tenant@example.com", "tenant");
    const tenant = await User.findOne({ email: "timeline-tenant@example.com" });
    const listing = await Listing.create({
      title: "Timeline Rental",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1500,
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: owner.id,
    });
    const lease = await Lease.create({
      listing: listing.id,
      landlord: owner.id,
      tenant: tenant!.id,
      currency: "USD",
      monthlyRent: 1500,
      depositAmount: 3000,
      escrowAmount: 4500,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 86_400_000),
      status: "proposed",
      termsHash: "abc",
      signedByTenantAt: new Date(),
      escrow: { state: "funded", escrowId: "1", fundTxHash: "0xfund" },
      createdBy: owner.id,
    });

    const res = await request(app)
      .get(`/api/v1/leases/${lease.id}/timeline`)
      .set(bearer(tenantToken))
      .expect(200);

    expect(res.body.data.currentStatus).toBe("proposed");
    expect(res.body.data.events.map((event: { key: string }) => event.key)).toContain("escrow_funded");
  });
});
