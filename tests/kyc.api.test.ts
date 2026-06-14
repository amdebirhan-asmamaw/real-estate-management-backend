jest.mock("../src/core/utils/uploader", () => ({
  uploadPrivate: jest.fn().mockResolvedValue({ publicId: "kyc/priv1" }),
  signedUrl: jest.fn(() => "https://cdn/signed?sig=1"),
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
  await User.updateOne({ email }, { role: "admin", accountStatus: "active" });
  return tokenOf(
    await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }),
  );
};

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

const uploadKyc = (token: string) =>
  request(app)
    .post("/api/v1/kyc/documents")
    .set(bearer(token))
    .field("type", "passport")
    .attach("documents", Buffer.from("passport"), {
      filename: "passport.jpg",
      contentType: "image/jpeg",
    });

describe("KYC API", () => {
  it("runs the owner KYC → admin approve → account active flow", async () => {
    const owner = await makeUser("kyc-owner@example.com", "property_owner");
    const admin = await makeAdmin("kyc-admin@example.com");
    const ownerId = (await User.findOne({ email: "kyc-owner@example.com" }))!.id;

    // Owner starts pending and submits KYC.
    const submitted = await uploadKyc(owner);
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.kycStatus).toBe("pending");

    // Self KYC view exposes no publicId.
    const meView = await request(app).get("/api/v1/kyc/me").set(bearer(owner));
    expect(meView.body.data.documents[0]).not.toHaveProperty("publicId");
    const docId = meView.body.data.documents[0].id;

    // Owner can mint a signed URL for their own document.
    const url = await request(app)
      .get(`/api/v1/kyc/documents/${docId}/url`)
      .set(bearer(owner));
    expect(url.body.data.url).toContain("sig=");

    // Admin approves → owner becomes active.
    const reviewed = await request(app)
      .post(`/api/v1/admin/users/${ownerId}/kyc/review`)
      .set(bearer(admin))
      .send({ decision: "approve", note: "looks good" });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.kycStatus).toBe("verified");
    expect(reviewed.body.data.accountStatus).toBe("active");
  });

  it("forbids a non-admin from reviewing another user's KYC (403)", async () => {
    const owner = await makeUser("kyc-owner2@example.com", "property_owner");
    const other = await makeUser("kyc-other@example.com", "tenant");
    await uploadKyc(owner);
    const ownerId = (await User.findOne({ email: "kyc-owner2@example.com" }))!.id;

    const res = await request(app)
      .post(`/api/v1/admin/users/${ownerId}/kyc/review`)
      .set(bearer(other))
      .send({ decision: "approve" });
    expect(res.status).toBe(403);
  });

  it("lets an admin change a user's account status", async () => {
    const tenant = await makeUser("kyc-tenant@example.com", "tenant");
    void tenant;
    const admin = await makeAdmin("kyc-admin2@example.com");
    const tenantId = (await User.findOne({ email: "kyc-tenant@example.com" }))!.id;

    const res = await request(app)
      .patch(`/api/v1/admin/users/${tenantId}/status`)
      .set(bearer(admin))
      .send({ accountStatus: "suspended" });
    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe("suspended");
  });

  it("requires authentication to submit KYC", async () => {
    const res = await request(app).post("/api/v1/kyc/documents");
    expect(res.status).toBe(401);
  });
});
