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

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

// Creates a published listing owned by the given owner token and returns its id.
const publishedListing = async (ownerToken: string): Promise<string> => {
  const created = await request(app)
    .post("/api/v1/listings")
    .set(bearer(ownerToken))
    .send({
      title: "City Loft",
      listingType: "rent",
      category: "residential",
      monthlyRent: 1500,
      location: { type: "Point", coordinates: [13.4, 52.5] },
    });
  const id = created.body.data.id;
  await Listing.findByIdAndUpdate(id, { status: "published" });
  return id;
};

describe("Favorites API", () => {
  it("lets a tenant save, list, and unsave a listing", async () => {
    const owner = await makeUser("favowner@example.com", "property_owner");
    const tenant = await makeUser("favtenant@example.com", "tenant");
    const id = await publishedListing(owner);

    const saved = await request(app)
      .post("/api/v1/favorites")
      .set(bearer(tenant))
      .send({ listingId: id });
    expect(saved.status).toBe(201);

    const list = await request(app)
      .get("/api/v1/favorites")
      .set(bearer(tenant));
    expect(list.body.data).toHaveLength(1);

    await request(app)
      .delete(`/api/v1/favorites/${id}`)
      .set(bearer(tenant))
      .expect(200);

    const after = await request(app)
      .get("/api/v1/favorites")
      .set(bearer(tenant));
    expect(after.body.data).toHaveLength(0);
  });

  it("requires authentication to save a favorite", async () => {
    const res = await request(app)
      .post("/api/v1/favorites")
      .send({ listingId: "012345678901234567890123" });
    expect(res.status).toBe(401);
  });
});

describe("Inquiries API", () => {
  it("routes a tenant inquiry to the owner, who can respond", async () => {
    const owner = await makeUser("inqowner@example.com", "property_owner");
    const tenant = await makeUser("inqtenant@example.com", "tenant");
    const id = await publishedListing(owner);

    const sent = await request(app)
      .post("/api/v1/inquiries")
      .set(bearer(tenant))
      .send({ listingId: id, message: "Is this still available?" });
    expect(sent.status).toBe(201);
    const inquiryId = sent.body.data.id ?? sent.body.data._id;

    // Owner sees it in received; tenant sees it in mine.
    const received = await request(app)
      .get("/api/v1/inquiries/received")
      .set(bearer(owner));
    expect(received.body.data).toHaveLength(1);

    const mine = await request(app)
      .get("/api/v1/inquiries/mine")
      .set(bearer(tenant));
    expect(mine.body.data).toHaveLength(1);

    // Owner responds.
    const responded = await request(app)
      .patch(`/api/v1/inquiries/${inquiryId}`)
      .set(bearer(owner))
      .send({ response: "Yes, come by this weekend." });
    expect(responded.status).toBe(200);
    expect(responded.body.data.status).toBe("responded");
  });

  it("forbids a non-owner from responding to an inquiry (403)", async () => {
    const owner = await makeUser("inqowner2@example.com", "property_owner");
    const tenant = await makeUser("inqtenant2@example.com", "tenant");
    const stranger = await makeUser("stranger@example.com", "property_owner");
    const id = await publishedListing(owner);

    const sent = await request(app)
      .post("/api/v1/inquiries")
      .set(bearer(tenant))
      .send({ listingId: id, message: "hello" });
    const inquiryId = sent.body.data.id ?? sent.body.data._id;

    const res = await request(app)
      .patch(`/api/v1/inquiries/${inquiryId}`)
      .set(bearer(stranger))
      .send({ status: "closed" });
    expect(res.status).toBe(403);
  });

  it("admins can respond to any inquiry", async () => {
    const owner = await makeUser("inqowner3@example.com", "property_owner");
    const tenant = await makeUser("inqtenant3@example.com", "tenant");
    await register({ name: "Admin", email: "inqadmin@example.com", password: PASSWORD, role: "property_owner" });
    await User.updateOne({ email: "inqadmin@example.com" }, { role: "admin" });
    const adminToken = tokenOf(
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "inqadmin@example.com", password: PASSWORD }),
    );
    const id = await publishedListing(owner);

    const sent = await request(app)
      .post("/api/v1/inquiries")
      .set(bearer(tenant))
      .send({ listingId: id, message: "hi" });
    const inquiryId = sent.body.data.id ?? sent.body.data._id;

    const res = await request(app)
      .patch(`/api/v1/inquiries/${inquiryId}`)
      .set(bearer(adminToken))
      .send({ status: "closed" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("closed");
  });
});
