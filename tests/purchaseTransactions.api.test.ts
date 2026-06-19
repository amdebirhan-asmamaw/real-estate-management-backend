import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { PurchaseTransaction } from "../src/modules/purchaseTransactions/purchaseTransaction.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const register = (email: string, role: "tenant" | "property_owner") =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Purchase User", email, password: PASSWORD, role });

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

const makeSaleListing = async (ownerToken: string) => {
  const created = await request(app)
    .post("/api/v1/listings")
    .set(bearer(ownerToken))
    .send({
      title: "Purchase Condo",
      listingType: "sale",
      category: "residential",
      propertyType: "apartment",
      price: 250000,
      location: { type: "Point", coordinates: [13.4, 52.5] },
    });
  await Listing.findByIdAndUpdate(created.body.data.id, { status: "published" });
  return created.body.data.id as string;
};

describe("Purchase transactions", () => {
  it("opens a purchase transaction when an offer is accepted", async () => {
    await register("purchase-owner@example.com", "property_owner");
    await register("purchase-buyer@example.com", "tenant");
    const ownerToken = await login("purchase-owner@example.com");
    const buyerToken = await login("purchase-buyer@example.com");
    const listingId = await makeSaleListing(ownerToken);

    const offer = await request(app)
      .post("/api/v1/offers")
      .set(bearer(buyerToken))
      .send({ listingId, amount: 240000 });

    const accepted = await request(app)
      .patch(`/api/v1/offers/${offer.body.data.id}/respond`)
      .set(bearer(ownerToken))
      .send({ action: "accept" });
    expect(accepted.status).toBe(200);

    const tx = await PurchaseTransaction.findOne({ offer: offer.body.data.id });
    expect(tx?.status).toBe("offer_accepted");
    expect(tx?.timeline).toHaveLength(1);

    const buyerList = await request(app)
      .get("/api/v1/purchase-transactions")
      .set(bearer(buyerToken));
    expect(buyerList.status).toBe(200);
    expect(buyerList.body.data.total).toBe(1);

    const listing = await Listing.findById(listingId);
    expect(listing?.availabilityStatus).toBe("under_offer");
  });

  it("blocks completing a purchase via direct status update without a released escrow", async () => {
    await register("purchase-owner2@example.com", "property_owner");
    await register("purchase-buyer2@example.com", "tenant");
    const ownerToken = await login("purchase-owner2@example.com");
    const buyerToken = await login("purchase-buyer2@example.com");
    const adminToken = await makeAdmin("purchase-admin@example.com");
    const listingId = await makeSaleListing(ownerToken);

    const offer = await request(app)
      .post("/api/v1/offers")
      .set(bearer(buyerToken))
      .send({ listingId, amount: 240000 });
    await request(app)
      .patch(`/api/v1/offers/${offer.body.data.id}/respond`)
      .set(bearer(ownerToken))
      .send({ action: "accept" });
    const tx = await PurchaseTransaction.findOne({ offer: offer.body.data.id });

    // Transparency guard: a sale cannot be marked completed without the escrow
    // actually being released on-chain. Direct status jumps are rejected.
    const updated = await request(app)
      .patch(`/api/v1/purchase-transactions/${tx!.id}/status`)
      .set(bearer(adminToken))
      .send({ status: "completed", note: "Closed" });

    expect(updated.status).toBe(409);

    const listing = await Listing.findById(listingId);
    expect(listing?.status).not.toBe("sold");
    expect(listing?.availabilityStatus).not.toBe("sold");
  });
});
