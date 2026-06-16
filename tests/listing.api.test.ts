jest.mock("../src/core/utils/uploader", () => ({
  uploadPublic: jest.fn().mockResolvedValue({
    url: "https://cdn/p.jpg",
    publicId: "pub1",
  }),
  uploadPrivate: jest.fn().mockResolvedValue({ publicId: "priv1" }),
  signedUrl: jest.fn(() => "https://cdn/signed?sig=1"),
  destroyAsset: jest.fn().mockResolvedValue(undefined),
}));

import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";

const PASSWORD = "Password123";

const register = (body: Record<string, unknown>) =>
  request(app).post("/api/v1/auth/register").send(body);

const tokenOf = (res: { body: { data: { tokens: { accessToken: string } } } }) =>
  res.body.data.tokens.accessToken;

const makeUser = async (email: string, role: string) =>
  tokenOf(await register({ name: "User", email, password: PASSWORD, role }));

const makeAdmin = async (email: string) => {
  await register({ name: "Admin", email, password: PASSWORD, role: "property_owner" });
  await User.updateOne({ email }, { role: "admin" });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return tokenOf(res);
};

const sample = {
  title: "City Loft",
  listingType: "rent",
  category: "residential",
  propertyType: "apartment",
  monthlyRent: 1500,
  address: { postalCode: "10115" },
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("Listings API — verified review lifecycle", () => {
  it("runs owner draft → docs → submit → admin verify/approve/publish → public discovery", async () => {
    const owner = await makeUser("owner1@example.com", "property_owner");
    await User.updateOne({ email: "owner1@example.com" }, { accountStatus: "active", kycStatus: "verified" });
    const admin = await makeAdmin("admin1@example.com");

    // Create draft.
    const created = await request(app)
      .post("/api/v1/listings")
      .set(bearer(owner))
      .send(sample);
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("draft");
    const id = created.body.data.id;

    // Upload a private ownership document (title deed).
    const docRes = await request(app)
      .post(`/api/v1/listings/${id}/documents`)
      .set(bearer(owner))
      .field("type", "title_deed")
      .attach("documents", Buffer.from("deed"), {
        filename: "deed.pdf",
        contentType: "application/pdf",
      });
    expect(docRes.status).toBe(201);
    const docId = docRes.body.data.documents[0].id;
    // Listing JSON must never carry the private documents array or publicId.
    expect(docRes.body.data.documents[0]).not.toHaveProperty("publicId");

    // Submit for review.
    await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(owner))
      .send({ action: "submit" })
      .expect(200);

    // Admin walks the review.
    await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(admin))
      .send({ action: "start_review" })
      .expect(200);

    const reviewed = await request(app)
      .post(`/api/v1/listings/${id}/documents/${docId}/review`)
      .set(bearer(admin))
      .send({ decision: "approve", note: "valid" });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.verificationStatus).toBe("verified");

    await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(admin))
      .send({ action: "approve" })
      .expect(200);
    await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(admin))
      .send({ action: "publish" })
      .expect(200);

    // Public discovery now finds it.
    const disc = await request(app).get("/api/v1/listings").query({
      swLng: 13.3,
      swLat: 52.4,
      neLng: 13.5,
      neLat: 52.6,
    });
    expect(disc.body.data.total).toBe(1);

    // Audit trail captured the full chain.
    const audit = await request(app)
      .get("/api/v1/audit-logs")
      .set(bearer(admin))
      .query({ targetId: id });
    const actions = audit.body.data.items.map(
      (l: { action: string }) => l.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "listing.created",
        "document.uploaded",
        "listing.submitted",
        "document.approved",
        "listing.published",
      ]),
    );
  });

  it("forbids a tenant from creating a listing (403)", async () => {
    const tenant = await makeUser("tenant1@example.com", "tenant");
    const res = await request(app)
      .post("/api/v1/listings")
      .set(bearer(tenant))
      .send(sample);
    expect(res.status).toBe(403);
  });

  it("forbids a property_owner from publishing their own listing (403)", async () => {
    const owner = await makeUser("owner2@example.com", "property_owner");
    await User.updateOne({ email: "owner2@example.com" }, { accountStatus: "active", kycStatus: "verified" });
    const admin = await makeAdmin("admin2@example.com");
    const created = await request(app)
      .post("/api/v1/listings")
      .set(bearer(owner))
      .send(sample);
    const id = created.body.data.id;
    await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(owner))
      .send({ action: "submit" });
    await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(admin))
      .send({ action: "start_review" });
    await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(admin))
      .send({ action: "approve" });

    const res = await request(app)
      .post(`/api/v1/listings/${id}/transition`)
      .set(bearer(owner))
      .send({ action: "publish" });
    expect(res.status).toBe(403);
  });

  it("prevents one owner from editing another owner's listing (403)", async () => {
    const a = await makeUser("ownerA@example.com", "property_owner");
    const b = await makeUser("ownerB@example.com", "property_owner");
    const created = await request(app)
      .post("/api/v1/listings")
      .set(bearer(a))
      .send(sample);
    const id = created.body.data.id;
    const res = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set(bearer(b))
      .send({ title: "Stolen" });
    expect(res.status).toBe(403);
  });

  it("keeps ownership documents private from other users", async () => {
    const owner = await makeUser("ownerC@example.com", "property_owner");
    const tenant = await makeUser("tenantC@example.com", "tenant");
    const created = await request(app)
      .post("/api/v1/listings")
      .set(bearer(owner))
      .send(sample);
    const id = created.body.data.id;
    await request(app)
      .post(`/api/v1/listings/${id}/documents`)
      .set(bearer(owner))
      .field("type", "title_deed")
      .attach("documents", Buffer.from("deed"), {
        filename: "deed.pdf",
        contentType: "application/pdf",
      });

    // Another non-admin user cannot list the documents.
    const res = await request(app)
      .get(`/api/v1/listings/${id}/documents`)
      .set(bearer(tenant));
    expect(res.status).toBe(403);
  });

  it("validates type-specific fields (422 when rent lacks monthlyRent)", async () => {
    const owner = await makeUser("ownerD@example.com", "property_owner");
    const { monthlyRent: _omit, ...bad } = sample;
    const res = await request(app)
      .post("/api/v1/listings")
      .set(bearer(owner))
      .send(bad);
    expect(res.status).toBe(422);
  });

  it("blocks tenants from the audit log (403)", async () => {
    const tenant = await makeUser("tenantE@example.com", "tenant");
    const res = await request(app)
      .get("/api/v1/audit-logs")
      .set(bearer(tenant));
    expect(res.status).toBe(403);
  });
});
