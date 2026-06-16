import request from "supertest";
import app from "../src/app";
import { Listing } from "../src/modules/listings/listing.model";

const PASSWORD = "Password123";

const register = (body: Record<string, unknown>) =>
  request(app).post("/api/v1/auth/register").send(body);

const tokenOf = (res: { body: { data: { tokens: { accessToken: string } } } }) =>
  res.body.data.tokens.accessToken;

const makeUser = async (email: string, role: string) =>
  tokenOf(await register({ name: "User", email, password: PASSWORD, role }));

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const publishedListing = async (
  ownerToken: string,
  listingType: "rent" | "sale" = "rent",
): Promise<string> => {
  const created = await request(app)
    .post("/api/v1/listings")
    .set(bearer(ownerToken))
    .send({
      title: listingType === "rent" ? "Analytics Rental" : "Analytics Sale",
      listingType,
      category: "residential",
      propertyType: "apartment",
      monthlyRent: listingType === "rent" ? 1500 : undefined,
      price: listingType === "sale" ? 250000 : undefined,
      location: { type: "Point", coordinates: [38.7, 9.0] },
    });
  const id = created.body.data.id;
  await Listing.findByIdAndUpdate(id, { status: "published" });
  return id;
};

describe("Listing analytics API", () => {
  it("rolls up views, favorites, inquiries, and rental applications for the owner", async () => {
    const owner = await makeUser("analytics-owner@example.com", "property_owner");
    const tenant = await makeUser("analytics-tenant@example.com", "tenant");
    const listingId = await publishedListing(owner, "rent");

    await request(app).get(`/api/v1/listings/${listingId}`).set(bearer(tenant)).expect(200);
    await request(app)
      .post("/api/v1/favorites")
      .set(bearer(tenant))
      .send({ listingId })
      .expect(201);
    await request(app)
      .post("/api/v1/inquiries")
      .set(bearer(tenant))
      .send({ listingId, message: "Is it available?" })
      .expect(201);
    await request(app)
      .post("/api/v1/rental-applications")
      .set(bearer(tenant))
      .send({ listingId, occupants: 1 })
      .expect(201);

    const analytics = await request(app)
      .get(`/api/v1/listings/${listingId}/analytics`)
      .set(bearer(owner))
      .expect(200);

    expect(analytics.body.data.counts.view).toBe(1);
    expect(analytics.body.data.counts.favorite).toBe(1);
    expect(analytics.body.data.counts.inquiry).toBe(1);
    expect(analytics.body.data.counts.rental_application).toBe(1);
    expect(analytics.body.data.leadCount).toBe(2);
    expect(analytics.body.data.uniqueViewers).toBe(1);
  });

  it("prevents other property owners from reading listing analytics", async () => {
    const owner = await makeUser("analytics-owner2@example.com", "property_owner");
    const other = await makeUser("analytics-other@example.com", "property_owner");
    const listingId = await publishedListing(owner, "rent");

    await request(app)
      .get(`/api/v1/listings/${listingId}/analytics`)
      .set(bearer(other))
      .expect(403);
  });
});
