import request from "supertest";
import app from "../src/app";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const makeUser = async (email: string) => {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Search User", email, password: PASSWORD, role: "tenant" });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return login.body.data.tokens.accessToken as string;
};

describe("Saved searches API", () => {
  it("creates, lists, updates, and deletes a polygon saved search", async () => {
    const token = await makeUser("saved@example.com");

    const created = await request(app)
      .post("/api/v1/saved-searches")
      .set(bearer(token))
      .send({
        name: "Downtown rentals",
        query: {
          polygon: [
            [13.3, 52.4],
            [13.5, 52.4],
            [13.5, 52.6],
            [13.3, 52.6],
          ],
          listingType: "rent",
          maxPrice: 2000,
        },
        alertEnabled: true,
      });

    expect(created.status).toBe(201);
    expect(created.body.data.alertEnabled).toBe(true);

    const listed = await request(app)
      .get("/api/v1/saved-searches")
      .set(bearer(token));
    expect(listed.body.data).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/v1/saved-searches/${created.body.data.id}`)
      .set(bearer(token))
      .send({ name: "Updated search", alertEnabled: false });

    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Updated search");
    expect(updated.body.data.alertEnabled).toBe(false);

    await request(app)
      .delete(`/api/v1/saved-searches/${created.body.data.id}`)
      .set(bearer(token))
      .expect(200);

    const after = await request(app)
      .get("/api/v1/saved-searches")
      .set(bearer(token));
    expect(after.body.data).toHaveLength(0);
  });

  it("prevents users from updating another user's saved search", async () => {
    const owner = await makeUser("saved-owner@example.com");
    const other = await makeUser("saved-other@example.com");

    const created = await request(app)
      .post("/api/v1/saved-searches")
      .set(bearer(owner))
      .send({
        name: "Owner search",
        query: { listingType: "sale" },
      });

    const res = await request(app)
      .patch(`/api/v1/saved-searches/${created.body.data.id}`)
      .set(bearer(other))
      .send({ name: "Stolen" });

    expect(res.status).toBe(404);
  });
});
