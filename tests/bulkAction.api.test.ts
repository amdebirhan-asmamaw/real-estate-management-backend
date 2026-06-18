import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const register = async (email: string, role: "property_owner" | "tenant") => {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Bulk User", email, password: PASSWORD, role });
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

const makeListing = async (ownerId: string, status = "draft") =>
  Listing.create({
    title: "Bulk Test Listing",
    listingType: "rent",
    category: "residential",
    propertyType: "apartment",
    monthlyRent: 1000,
    status,
    location: { type: "Point", coordinates: [38.7, 9.0] },
    createdBy: ownerId,
  });

describe("POST /listings/bulk-action", () => {
  it("returns per-item results with mixed success/failure", async () => {
    const adminToken = await makeAdmin("bulk-admin@example.com");
    const owner = await User.findOne({ email: "bulk-admin@example.com" });

    // One draft listing (valid to submit) + one that's in wrong state for submit
    const valid = await makeListing(owner!.id, "draft");
    const alreadySubmitted = await makeListing(owner!.id, "submitted");
    const nonExistent = "000000000000000000000000";

    const res = await request(app)
      .post("/api/v1/listings/bulk-action")
      .set(bearer(adminToken))
      .send({
        actions: [
          { id: valid.id, action: "submit" },
          { id: alreadySubmitted.id, action: "submit" }, // wrong state → error
          { id: nonExistent, action: "archive" }, // not found → error
        ],
      })
      .expect(200);

    const results = res.body.data as Array<{
      id: string;
      ok: boolean;
      error?: string;
    }>;

    expect(results).toHaveLength(3);

    const r1 = results.find((r) => r.id === valid.id);
    expect(r1!.ok).toBe(true);
    expect(r1!.error).toBeUndefined();

    const r2 = results.find((r) => r.id === alreadySubmitted.id);
    expect(r2!.ok).toBe(false);
    expect(r2!.error).toBeDefined();

    const r3 = results.find((r) => r.id === nonExistent);
    expect(r3!.ok).toBe(false);
    expect(r3!.error).toBeDefined();
  });

  it("validates array length — rejects empty actions", async () => {
    const adminToken = await makeAdmin("bulk-admin2@example.com");
    await request(app)
      .post("/api/v1/listings/bulk-action")
      .set(bearer(adminToken))
      .send({ actions: [] })
      .expect(422);
  });

  it("validates array length — rejects > 50 items", async () => {
    const adminToken = await makeAdmin("bulk-admin3@example.com");
    const fakeId = "000000000000000000000000";
    const actions = Array.from({ length: 51 }, () => ({
      id: fakeId,
      action: "archive",
    }));
    await request(app)
      .post("/api/v1/listings/bulk-action")
      .set(bearer(adminToken))
      .send({ actions })
      .expect(422);
  });

  it("rejects unauthenticated requests", async () => {
    await request(app)
      .post("/api/v1/listings/bulk-action")
      .send({ actions: [{ id: "000000000000000000000000", action: "archive" }] })
      .expect(401);
  });
});
