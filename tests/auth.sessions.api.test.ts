import request from "supertest";
import app from "../src/app";

const PASSWORD = "Password123";

const register = (email: string) =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ name: "User", email, password: PASSWORD, role: "tenant" });

const login = (email: string, password = PASSWORD) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

const refresh = (refreshToken: string) =>
  request(app).post("/api/v1/auth/refresh-token").send({ refreshToken });

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("Sessions & refresh rotation", () => {
  it("rotates refresh tokens and detects reuse across the family", async () => {
    const reg = await register("rot@example.com");
    const r1 = reg.body.data.tokens.refreshToken;

    const first = await refresh(r1);
    expect(first.status).toBe(200);
    const r2 = first.body.data.refreshToken;
    expect(r2).not.toBe(r1);

    const second = await refresh(r2);
    expect(second.status).toBe(200);
    const r3 = second.body.data.refreshToken;

    // Reusing the already-rotated r2 is detected and revokes the whole family.
    const reuse = await refresh(r2);
    expect(reuse.status).toBe(401);

    // r3 was valid, but the reuse just revoked the entire family.
    const afterReuse = await refresh(r3);
    expect(afterReuse.status).toBe(401);
  });

  it("logout revokes a single refresh token", async () => {
    const reg = await register("logout@example.com");
    const rt = reg.body.data.tokens.refreshToken;

    await request(app).post("/api/v1/auth/logout").send({ refreshToken: rt }).expect(200);
    const res = await refresh(rt);
    expect(res.status).toBe(401);
  });

  it("lists active sessions for the user", async () => {
    const reg = await register("sessions@example.com");
    const access = reg.body.data.tokens.accessToken;

    const res = await request(app).get("/api/v1/auth/sessions").set(bearer(access));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).not.toHaveProperty("tokenHash");
  });

  it("logout-all revokes every session", async () => {
    const reg = await register("logoutall@example.com");
    const access = reg.body.data.tokens.accessToken;
    const r1 = reg.body.data.tokens.refreshToken;
    const second = await login("logoutall@example.com");
    const r2 = second.body.data.tokens.refreshToken;

    await request(app).post("/api/v1/auth/logout-all").set(bearer(access)).expect(200);

    expect((await refresh(r1)).status).toBe(401);
    expect((await refresh(r2)).status).toBe(401);
  });

  it("change-password verifies the old password, revokes sessions, and sets the new one", async () => {
    const reg = await register("changepw@example.com");
    const access = reg.body.data.tokens.accessToken;
    const rt = reg.body.data.tokens.refreshToken;

    // Wrong current password is rejected.
    const wrong = await request(app)
      .post("/api/v1/auth/change-password")
      .set(bearer(access))
      .send({ currentPassword: "WrongPass1", newPassword: "NewPass123" });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post("/api/v1/auth/change-password")
      .set(bearer(access))
      .send({ currentPassword: PASSWORD, newPassword: "NewPass123" });
    expect(ok.status).toBe(200);

    // Old sessions are revoked; old password no longer works; new one does.
    expect((await refresh(rt)).status).toBe(401);
    expect((await login("changepw@example.com", PASSWORD)).status).toBe(401);
    expect((await login("changepw@example.com", "NewPass123")).status).toBe(200);
  });

  it("requires authentication for change-password and logout-all", async () => {
    expect((await request(app).post("/api/v1/auth/logout-all")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/change-password")
          .send({ currentPassword: "x", newPassword: "NewPass123" })
      ).status,
    ).toBe(401);
  });
});
