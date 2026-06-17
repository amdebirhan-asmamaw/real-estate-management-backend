/**
 * compliance.queues.test.ts
 * Tests for Phase B Tasks B1 (review queues) and B2 (mark-suspicious flag).
 */
import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { Lease } from "../src/modules/leases/lease.model";
import { PurchaseTransaction } from "../src/modules/purchaseTransactions/purchaseTransaction.model";
import { ComplianceCase } from "../src/modules/compliance/compliance.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const register = (email: string, role: "tenant" | "property_owner") =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Queue Test User", email, password: PASSWORD, role });

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

/** Minimal valid listing fixture (coordinates required). */
const listingBase = () => ({
  title: "Test Property",
  listingType: "sale",
  category: "residential",
  propertyType: "apartment",
  currency: "USD",
  location: { type: "Point", coordinates: [38.7469, 9.0222] },
  createdBy: new mongoose.Types.ObjectId(),
});

// ─── B1: KYC Queue ───────────────────────────────────────────────────────────

describe("GET /compliance/queues/kyc", () => {
  it("returns users with kycStatus pending or under_review, excludes others", async () => {
    const adminToken = await makeAdmin("kyc-queue-admin@example.com");

    // Create users with various kycStatus values.
    await User.create({
      name: "KYC Pending",
      email: "kyc-pending@example.com",
      password: PASSWORD,
      role: "tenant",
      accountStatus: "active",
      kycStatus: "pending",
    });
    await User.create({
      name: "KYC Under Review",
      email: "kyc-under@example.com",
      password: PASSWORD,
      role: "tenant",
      accountStatus: "active",
      kycStatus: "under_review",
    });
    await User.create({
      name: "KYC Verified",
      email: "kyc-verified@example.com",
      password: PASSWORD,
      role: "tenant",
      accountStatus: "active",
      kycStatus: "verified",
    });

    const res = await request(app)
      .get("/api/v1/compliance/queues/kyc")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items).toHaveLength(2);
    const statuses = res.body.data.items.map((u: { kycStatus: string }) => u.kycStatus);
    expect(statuses).toContain("pending");
    expect(statuses).toContain("under_review");
    expect(statuses).not.toContain("verified");
  });

  it("blocks tenants from the kyc queue", async () => {
    await register("kyc-tenant@example.com", "tenant");
    const tenantToken = await login("kyc-tenant@example.com");
    const res = await request(app)
      .get("/api/v1/compliance/queues/kyc")
      .set(bearer(tenantToken));
    expect(res.status).toBe(403);
  });
});

// ─── B1: Property-Verification Queue ─────────────────────────────────────────

describe("GET /compliance/queues/property-verification", () => {
  it("returns listings with verificationStatus=pending OR documents.status=pending", async () => {
    const adminToken = await makeAdmin("propverif-admin@example.com");
    const ownerId = new mongoose.Types.ObjectId();

    // Matches: verificationStatus = "pending"
    await Listing.create({
      ...listingBase(),
      title: "Pending Verification",
      verificationStatus: "pending",
      createdBy: ownerId,
    });

    // Matches: has a document with status = "pending"
    await Listing.create({
      ...listingBase(),
      title: "Doc Pending",
      verificationStatus: "unverified",
      createdBy: ownerId,
      documents: [
        {
          type: "title_deed",
          publicId: "cloud-id-1",
          hash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
          status: "pending",
          uploadedAt: new Date(),
        },
      ],
    });

    // Does NOT match: verified with no pending docs
    await Listing.create({
      ...listingBase(),
      title: "Already Verified",
      verificationStatus: "verified",
      createdBy: ownerId,
    });

    const res = await request(app)
      .get("/api/v1/compliance/queues/property-verification")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    const titles = res.body.data.items.map((l: { title: string }) => l.title);
    expect(titles).toContain("Pending Verification");
    expect(titles).toContain("Doc Pending");
    expect(titles).not.toContain("Already Verified");
  });
});

// ─── B1: Certificates Queue ───────────────────────────────────────────────────

describe("GET /compliance/queues/certificates", () => {
  it("returns verified listings without a tokenId, excludes minted and unverified", async () => {
    const adminToken = await makeAdmin("cert-queue-admin@example.com");
    const ownerId = new mongoose.Types.ObjectId();

    // Matches: verificationStatus=verified + no tokenId
    await Listing.create({
      ...listingBase(),
      title: "Needs Certificate",
      verificationStatus: "verified",
      createdBy: ownerId,
    });

    // Does NOT match: verified but already has tokenId (already minted)
    await Listing.create({
      ...listingBase(),
      title: "Already Issued",
      verificationStatus: "verified",
      tokenId: "42",
      createdBy: ownerId,
    });

    // Does NOT match: not verified (pending)
    await Listing.create({
      ...listingBase(),
      title: "Still Pending",
      verificationStatus: "pending",
      createdBy: ownerId,
    });

    // Does NOT match: not verified (unverified)
    await Listing.create({
      ...listingBase(),
      title: "Unverified Draft",
      verificationStatus: "unverified",
      createdBy: ownerId,
    });

    const res = await request(app)
      .get("/api/v1/compliance/queues/certificates")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe("Needs Certificate");
  });
});

// ─── B1: Disputes Queue ───────────────────────────────────────────────────────

describe("GET /compliance/queues/disputes", () => {
  it("returns leases with status=disputed, excludes others", async () => {
    const adminToken = await makeAdmin("disputes-admin@example.com");
    const listingId = new mongoose.Types.ObjectId();
    const landlordId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    const leaseBase = {
      listing: listingId,
      landlord: landlordId,
      tenant: tenantId,
      currency: "USD",
      monthlyRent: 1000,
      depositAmount: 2000,
      escrowAmount: 3000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: landlordId,
    };

    await Lease.create({ ...leaseBase, status: "disputed" });
    await Lease.create({ ...leaseBase, status: "active" });

    const res = await request(app)
      .get("/api/v1/compliance/queues/disputes")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    const disputedItems = res.body.data.items.filter(
      (i: { status: string }) => i.status === "disputed",
    );
    expect(disputedItems.length).toBeGreaterThanOrEqual(1);
    // All items must have a kind field.
    res.body.data.items.forEach((item: { kind: string }) => {
      expect(["lease", "purchase_transaction"]).toContain(item.kind);
    });
  });

  it("includes disputed purchase transactions with kind=purchase_transaction", async () => {
    const adminToken = await makeAdmin("disputes-pt-admin@example.com");
    const buyerId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();
    const listingId = new mongoose.Types.ObjectId();

    // Create a disputed purchase transaction.
    await PurchaseTransaction.create({
      listing: listingId,
      offer: new mongoose.Types.ObjectId(),
      seller: sellerId,
      buyer: buyerId,
      amount: 50000,
      currency: "USD",
      status: "disputed",
    });

    // Create a non-disputed purchase transaction (should be excluded).
    await PurchaseTransaction.create({
      listing: listingId,
      offer: new mongoose.Types.ObjectId(),
      seller: sellerId,
      buyer: buyerId,
      amount: 60000,
      currency: "USD",
      status: "deposit_received",
    });

    const res = await request(app)
      .get("/api/v1/compliance/queues/disputes")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    const purchaseItems = res.body.data.items.filter(
      (i: { kind: string }) => i.kind === "purchase_transaction",
    );
    expect(purchaseItems.length).toBeGreaterThanOrEqual(1);
    purchaseItems.forEach((item: { status: string }) => {
      expect(item.status).toBe("disputed");
    });
  });

  it("items from both lease and purchase_transaction appear together in the queue", async () => {
    const adminToken = await makeAdmin("disputes-combined-admin@example.com");
    const listingId = new mongoose.Types.ObjectId();
    const landlordId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    await Lease.create({
      listing: listingId,
      landlord: landlordId,
      tenant: tenantId,
      currency: "USD",
      monthlyRent: 1500,
      depositAmount: 3000,
      escrowAmount: 4500,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdBy: landlordId,
      status: "disputed",
    });
    await PurchaseTransaction.create({
      listing: listingId,
      offer: new mongoose.Types.ObjectId(),
      seller: landlordId,
      buyer: tenantId,
      amount: 75000,
      currency: "USD",
      status: "disputed",
    });

    const res = await request(app)
      .get("/api/v1/compliance/queues/disputes")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    const kinds = res.body.data.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain("lease");
    expect(kinds).toContain("purchase_transaction");
  });
});

// ─── B1: Suspicious Queue ─────────────────────────────────────────────────────

describe("GET /compliance/queues/suspicious", () => {
  it("returns open compliance cases of type listing/offer with reason=suspicious", async () => {
    const adminToken = await makeAdmin("suspicious-admin@example.com");
    const listingId = new mongoose.Types.ObjectId();

    // Matches: type=listing, status=open, metadata.reason=suspicious
    await ComplianceCase.create({
      type: "listing",
      status: "open",
      severity: "high",
      title: "Suspicious listing",
      targetType: "listing",
      targetId: listingId,
      metadata: { reason: "suspicious" },
    });

    // Does NOT match: type=listing but reason is not suspicious
    await ComplianceCase.create({
      type: "listing",
      status: "open",
      severity: "medium",
      title: "Normal listing case",
      targetType: "listing",
      targetId: new mongoose.Types.ObjectId(),
      metadata: { reason: "ownership_issue" },
    });

    // Does NOT match: type=kyc (not listing/offer)
    await ComplianceCase.create({
      type: "kyc",
      status: "open",
      severity: "medium",
      title: "KYC case",
      targetType: "user",
      targetId: new mongoose.Types.ObjectId(),
      metadata: { reason: "suspicious" },
    });

    // Does NOT match: status=resolved
    await ComplianceCase.create({
      type: "listing",
      status: "resolved",
      severity: "high",
      title: "Resolved suspicious",
      targetType: "listing",
      targetId: new mongoose.Types.ObjectId(),
      metadata: { reason: "suspicious" },
    });

    const res = await request(app)
      .get("/api/v1/compliance/queues/suspicious")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe("Suspicious listing");
  });

  it("includes duplicate-flagged cases in the suspicious queue", async () => {
    const adminToken = await makeAdmin("suspicious-dup-admin@example.com");
    const listingId = new mongoose.Types.ObjectId();

    // Matches: type=listing, status=open, metadata.reason=duplicate
    await ComplianceCase.create({
      type: "listing",
      status: "open",
      severity: "medium",
      title: "Duplicate listing case",
      targetType: "listing",
      targetId: listingId,
      metadata: { reason: "duplicate" },
    });

    const res = await request(app)
      .get("/api/v1/compliance/queues/suspicious")
      .set(bearer(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    const titles = res.body.data.items.map((c: { title: string }) => c.title);
    expect(titles).toContain("Duplicate listing case");
  });
});

// ─── B2: Flag Endpoint ────────────────────────────────────────────────────────

describe("POST /compliance/flag", () => {
  it("admin can flag a listing → case created + appears in suspicious queue", async () => {
    const adminToken = await makeAdmin("flag-admin@example.com");

    // Register owner + create listing directly in DB
    await register("flag-owner@example.com", "property_owner");
    const owner = await User.findOne({ email: "flag-owner@example.com" });
    const listing = await Listing.create({
      ...listingBase(),
      title: "Flaggable Listing",
      createdBy: owner!._id,
    });

    const flagRes = await request(app)
      .post("/api/v1/compliance/flag")
      .set(bearer(adminToken))
      .send({
        targetType: "listing",
        targetId: listing.id,
        severity: "high",
        title: "Suspicious activity on listing",
        description: "Unusual document pattern",
      });

    expect(flagRes.status).toBe(201);
    expect(flagRes.body.data.type).toBe("listing");
    expect(flagRes.body.data.severity).toBe("high");

    // Verify it appears in the suspicious queue
    const queueRes = await request(app)
      .get("/api/v1/compliance/queues/suspicious")
      .set(bearer(adminToken));

    expect(queueRes.status).toBe(200);
    expect(queueRes.body.data.total).toBe(1);
    expect(queueRes.body.data.items[0].title).toBe("Suspicious activity on listing");
  });

  it("returns 404 when flagging a non-existent listing", async () => {
    const adminToken = await makeAdmin("flag-404-admin@example.com");

    const res = await request(app)
      .post("/api/v1/compliance/flag")
      .set(bearer(adminToken))
      .send({
        targetType: "listing",
        targetId: new mongoose.Types.ObjectId().toString(),
        severity: "medium",
        title: "Non-existent listing flag",
      });

    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin users", async () => {
    await register("flag-tenant@example.com", "tenant");
    const tenantToken = await login("flag-tenant@example.com");

    const res = await request(app)
      .post("/api/v1/compliance/flag")
      .set(bearer(tenantToken))
      .send({
        targetType: "listing",
        targetId: new mongoose.Types.ObjectId().toString(),
        severity: "high",
        title: "Should be blocked",
      });

    expect(res.status).toBe(403);
  });

  it("validates required body fields → 422", async () => {
    const adminToken = await makeAdmin("flag-val-admin@example.com");

    const res = await request(app)
      .post("/api/v1/compliance/flag")
      .set(bearer(adminToken))
      .send({ targetType: "listing" }); // missing targetId, severity, title

    expect(res.status).toBe(422);
  });
});
