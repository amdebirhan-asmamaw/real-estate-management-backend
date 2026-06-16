import request from "supertest";
import app from "../src/app";
import { Listing } from "../src/modules/listings/listing.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const register = (body: Record<string, unknown>) =>
  request(app).post("/api/v1/auth/register").send(body);

const tokenOf = (res: { body: { data: { tokens: { accessToken: string } } } }) =>
  res.body.data.tokens.accessToken;

const makeUser = async (email: string, role: "tenant" | "property_owner") =>
  tokenOf(await register({ name: "Offer User", email, password: PASSWORD, role }));

const makeSaleListing = async (ownerToken: string): Promise<string> => {
  const created = await request(app)
    .post("/api/v1/listings")
    .set(bearer(ownerToken))
    .send({
      title: "Sale Condo",
      listingType: "sale",
      category: "residential",
      propertyType: "condominium",
      price: 250000,
      location: { type: "Point", coordinates: [13.4, 52.5] },
    });
  await Listing.findByIdAndUpdate(created.body.data.id, { status: "published" });
  return created.body.data.id;
};

describe("Offers API", () => {
  it("lets a tenant submit an offer and the owner counter it", async () => {
    const owner = await makeUser("offer-owner@example.com", "property_owner");
    const buyer = await makeUser("offer-buyer@example.com", "tenant");
    const listingId = await makeSaleListing(owner);

    const submitted = await request(app)
      .post("/api/v1/offers")
      .set(bearer(buyer))
      .send({ listingId, amount: 240000, currency: "USD" });

    expect(submitted.status).toBe(201);
    expect(submitted.body.data.status).toBe("submitted");

    const received = await request(app)
      .get("/api/v1/offers/received")
      .set(bearer(owner));
    expect(received.body.data).toHaveLength(1);

    const ownerNotifications = await request(app)
      .get("/api/v1/notifications")
      .set(bearer(owner));
    expect(ownerNotifications.body.data.items[0].type).toBe("offer.received");

    const countered = await request(app)
      .patch(`/api/v1/offers/${submitted.body.data.id}/respond`)
      .set(bearer(owner))
      .send({ action: "counter", counterAmount: 245000 });

    expect(countered.status).toBe(200);
    expect(countered.body.data.status).toBe("countered");
    expect(countered.body.data.counterAmount).toBe(245000);

    const buyerNotifications = await request(app)
      .get("/api/v1/notifications")
      .set(bearer(buyer));
    expect(buyerNotifications.body.data.items[0].type).toBe("offer.responded");
  });

  it("rejects offers on rental listings", async () => {
    const owner = await makeUser("rent-offer-owner@example.com", "property_owner");
    const buyer = await makeUser("rent-offer-buyer@example.com", "tenant");

    const rent = await request(app)
      .post("/api/v1/listings")
      .set(bearer(owner))
      .send({
        title: "Rental",
        listingType: "rent",
        category: "residential",
        propertyType: "apartment",
        monthlyRent: 1200,
        location: { type: "Point", coordinates: [13.4, 52.5] },
      });
    await Listing.findByIdAndUpdate(rent.body.data.id, { status: "published" });

    const res = await request(app)
      .post("/api/v1/offers")
      .set(bearer(buyer))
      .send({ listingId: rent.body.data.id, amount: 200000 });

    expect(res.status).toBe(400);
  });

  it("prevents another property owner from responding", async () => {
    const owner = await makeUser("offer-owner2@example.com", "property_owner");
    const buyer = await makeUser("offer-buyer2@example.com", "tenant");
    const stranger = await makeUser("offer-stranger@example.com", "property_owner");
    const listingId = await makeSaleListing(owner);

    const submitted = await request(app)
      .post("/api/v1/offers")
      .set(bearer(buyer))
      .send({ listingId, amount: 240000 });

    const res = await request(app)
      .patch(`/api/v1/offers/${submitted.body.data.id}/respond`)
      .set(bearer(stranger))
      .send({ action: "accept" });

    expect(res.status).toBe(403);
  });

  it("lets the buyer cancel a submitted offer", async () => {
    const owner = await makeUser("offer-owner3@example.com", "property_owner");
    const buyer = await makeUser("offer-buyer3@example.com", "tenant");
    const listingId = await makeSaleListing(owner);

    const submitted = await request(app)
      .post("/api/v1/offers")
      .set(bearer(buyer))
      .send({ listingId, amount: 240000 });

    const cancelled = await request(app)
      .post(`/api/v1/offers/${submitted.body.data.id}/cancel`)
      .set(bearer(buyer));

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");
  });
});
