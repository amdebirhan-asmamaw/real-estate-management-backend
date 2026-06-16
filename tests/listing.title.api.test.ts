jest.mock("../src/core/blockchain/propertyTitle.service", () => ({
  isConfigured: () => true,
  mintTitle: jest.fn().mockResolvedValue({
    tokenId: "42",
    txHash: "0xabc",
    contractAddress: "0xContract",
    owner: "0xMinter",
  }),
  getTitle: jest
    .fn()
    .mockResolvedValue({
      owner: "0xMinter",
      documentHash: "deadbeef",
      status: "active",
    }),
}));

import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";

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
  return tokenOf(
    await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }),
  );
};

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// Create a published + verified listing and return its id.
const verifiedListing = async (ownerToken: string): Promise<string> => {
  const created = await request(app)
    .post("/api/v1/listings")
    .set(bearer(ownerToken))
    .send({
      title: "Verified Home",
      listingType: "sale",
      category: "residential",
      price: 250000,
      location: { type: "Point", coordinates: [13.4, 52.5] },
    });
  const id = created.body.data.id;
  await Listing.findByIdAndUpdate(id, {
    status: "published",
    verificationStatus: "verified",
    ownershipDocumentHash: "deadbeef",
  });
  return id;
};

describe("On-chain title API", () => {
  it("lets an admin mint a title and exposes on-chain verification publicly", async () => {
    const owner = await makeUser("titleowner@example.com", "property_owner");
    const admin = await makeAdmin("titleadmin@example.com");
    const id = await verifiedListing(owner);

    const minted = await request(app)
      .post(`/api/v1/listings/${id}/mint-title`)
      .set(bearer(admin));
    expect(minted.status).toBe(200);
    expect(minted.body.data.tokenId).toBe("42");
    expect(minted.body.data.titleCertificateId).toBe("PTITLE-42");

    // Public verification endpoint (no auth) confirms the anchored hash matches.
    const title = await request(app).get(`/api/v1/listings/${id}/title`);
    expect(title.status).toBe(200);
    expect(title.body.data.verified).toBe(true);
    expect(title.body.data.owner).toBe("0xMinter");
  });

  it("forbids a property_owner from minting (403)", async () => {
    const owner = await makeUser("titleowner2@example.com", "property_owner");
    const id = await verifiedListing(owner);
    const res = await request(app)
      .post(`/api/v1/listings/${id}/mint-title`)
      .set(bearer(owner));
    expect(res.status).toBe(403);
  });

  it("404s the title endpoint when nothing has been minted", async () => {
    const owner = await makeUser("titleowner3@example.com", "property_owner");
    const id = await verifiedListing(owner);
    const res = await request(app).get(`/api/v1/listings/${id}/title`);
    expect(res.status).toBe(404);
  });
});
