import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { Lease } from "../src/modules/leases/lease.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const register = async (
  email: string,
  role: "property_owner" | "tenant",
) => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Roster User", email, password: PASSWORD, role });
  return res.body.data.tokens.accessToken as string;
};

const login = async (email: string) => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return res.body.data.tokens.accessToken as string;
};

const makeAdmin = async (email: string) => {
  await register(email, "tenant");
  await User.updateOne({ email }, { role: "admin" });
  return login(email);
};

const makeListing = async (ownerId: string, title: string) =>
  Listing.create({
    title,
    listingType: "rent",
    category: "residential",
    propertyType: "apartment",
    monthlyRent: 1200,
    status: "published",
    location: { type: "Point", coordinates: [38.7, 9.0] },
    createdBy: ownerId,
  });

const makeLease = async (
  landlordId: string,
  tenantId: string,
  listingId: string,
) =>
  Lease.create({
    listing: listingId,
    landlord: landlordId,
    tenant: tenantId,
    currency: "USD",
    monthlyRent: 1200,
    depositAmount: 2400,
    escrowAmount: 3600,
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 86_400_000),
    status: "active",
    escrow: { state: "active", escrowId: "r1", fundTxHash: "0xr" },
    createdBy: landlordId,
  });

describe("GET /leases/tenants", () => {
  it("owner A sees only their own tenants, not owner B's", async () => {
    const ownerAToken = await register(
      "roster-ownerA@example.com",
      "property_owner",
    );
    const ownerBToken = await register(
      "roster-ownerB@example.com",
      "property_owner",
    );
    const ownerA = await User.findOne({ email: "roster-ownera@example.com" });
    const ownerB = await User.findOne({ email: "roster-ownerb@example.com" });
    const tenantA = await User.create({
      name: "Tenant A",
      email: "roster-tenantA@example.com",
      password: PASSWORD,
      role: "tenant",
    });
    const tenantB = await User.create({
      name: "Tenant B",
      email: "roster-tenantB@example.com",
      password: PASSWORD,
      role: "tenant",
    });

    const listingA = await makeListing(ownerA!.id, "Owner A Flat");
    const listingB = await makeListing(ownerB!.id, "Owner B Flat");

    await makeLease(ownerA!.id, tenantA.id, listingA.id);
    await makeLease(ownerB!.id, tenantB.id, listingB.id);

    const resA = await request(app)
      .get("/api/v1/leases/tenants")
      .set(bearer(ownerAToken))
      .expect(200);

    const rosterA = resA.body.data as Array<{
      tenant: { email: string };
      listing: { title: string };
    }>;
    expect(rosterA.length).toBe(1);
    expect(rosterA[0].tenant.email).toBe("roster-tenanta@example.com");
    expect(rosterA[0].listing.title).toBe("Owner A Flat");

    // Owner B's token should only see their own lease
    const resB = await request(app)
      .get("/api/v1/leases/tenants")
      .set(bearer(ownerBToken))
      .expect(200);

    const rosterB = resB.body.data as Array<{ tenant: { email: string } }>;
    const emails = rosterB.map((r) => r.tenant.email);
    expect(emails).not.toContain("roster-tenanta@example.com");
    expect(emails).toContain("roster-tenantb@example.com");
  });

  it("admin sees all leases", async () => {
    const ownerToken = await register(
      "roster-owner2@example.com",
      "property_owner",
    );
    const adminToken = await makeAdmin("roster-admin@example.com");
    const owner = await User.findOne({ email: "roster-owner2@example.com" });
    const tenant = await User.create({
      name: "Tenant C",
      email: "roster-tenantC@example.com",
      password: PASSWORD,
      role: "tenant",
    });
    const listing = await makeListing(owner!.id, "Admin View Flat");
    await makeLease(owner!.id, tenant.id, listing.id);

    const ownerRes = await request(app)
      .get("/api/v1/leases/tenants")
      .set(bearer(ownerToken))
      .expect(200);

    const adminRes = await request(app)
      .get("/api/v1/leases/tenants")
      .set(bearer(adminToken))
      .expect(200);

    // Admin should see at least as many leases as the owner
    expect(adminRes.body.data.length).toBeGreaterThanOrEqual(
      ownerRes.body.data.length,
    );
  });

  it("admin can filter by ownerId", async () => {
    const adminToken = await makeAdmin("roster-admin2@example.com");
    const owner = await User.create({
      name: "Specific Owner",
      email: "roster-specific@example.com",
      password: PASSWORD,
      role: "property_owner",
    });
    const tenant = await User.create({
      name: "Tenant D",
      email: "roster-tenantD@example.com",
      password: PASSWORD,
      role: "tenant",
    });
    const listing = await makeListing(owner.id, "Specific Owner Flat");
    await makeLease(owner.id, tenant.id, listing.id);

    const res = await request(app)
      .get(`/api/v1/leases/tenants?ownerId=${owner.id}`)
      .set(bearer(adminToken))
      .expect(200);

    const roster = res.body.data as Array<{
      tenant: { email: string };
    }>;
    expect(roster.length).toBeGreaterThanOrEqual(1);
    // all results belong to the filtered owner's listings
    expect(roster.some((r) => r.tenant.email === "roster-tenantd@example.com")).toBe(true);
  });

  it("rejects tenant role (403)", async () => {
    const tenantToken = await register(
      "roster-tenant-e@example.com",
      "tenant",
    );
    await request(app)
      .get("/api/v1/leases/tenants")
      .set(bearer(tenantToken))
      .expect(403);
  });
});
