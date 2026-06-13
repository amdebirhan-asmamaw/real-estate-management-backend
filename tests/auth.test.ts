import request from "supertest";
import app from "../src/app";

const validUser = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "Password123",
};

const register = (overrides: Partial<typeof validUser> = {}) =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ ...validUser, ...overrides });

describe("POST /api/v1/auth/register", () => {
  it("creates an account and returns tokens", async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user).not.toHaveProperty("password");
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.data.tokens.refreshToken).toEqual(expect.any(String));
  });

  it("rejects a duplicate email with 409", async () => {
    await register();
    const res = await register();

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("rejects a weak password with 422", async () => {
    const res = await register({ password: "weak" });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });

  it("rejects an invalid email with 422", async () => {
    const res = await register({ email: "not-an-email" });

    expect(res.status).toBe(422);
  });
});

describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await register();
  });

  it("logs in with valid credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects an unknown email with 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: validUser.password });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the authenticated user's profile", async () => {
    const { body } = await register();
    const token = body.data.tokens.accessToken;

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(validUser.email);
  });

  it("rejects a request without a token with 401", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
  });

  it("rejects an invalid token with 401", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not.a.real.token");

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/refresh-token", () => {
  it("issues new tokens for a valid refresh token", async () => {
    const { body } = await register();

    const res = await request(app)
      .post("/api/v1/auth/refresh-token")
      .send({ refreshToken: body.data.tokens.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it("rejects an invalid refresh token with 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh-token")
      .send({ refreshToken: "invalid-token" });

    expect(res.status).toBe(401);
  });
});
