import request from "supertest";
import { Wallet } from "ethers";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";

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

describe("registration roles", () => {
  const registerWith = (body: Record<string, unknown>) =>
    request(app).post("/api/v1/auth/register").send(body);

  const userBody = (extra: Record<string, unknown>) => ({
    name: "Role User",
    password: "Password123",
    ...extra,
  });

  it("defaults a new user to the tenant role", async () => {
    const res = await registerWith(userBody({ email: "tenant@example.com" }));
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("tenant");
  });

  it("accepts the property_owner role", async () => {
    const res = await registerWith(
      userBody({ email: "owner@example.com", role: "property_owner" }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("property_owner");
  });

  it("rejects self-registration as admin with 422", async () => {
    const res = await registerWith(
      userBody({ email: "admin@example.com", role: "admin" }),
    );
    expect(res.status).toBe(422);
  });

  it("rejects self-registration as super_admin with 422", async () => {
    const res = await registerWith(
      userBody({ email: "super@example.com", role: "super_admin" }),
    );
    expect(res.status).toBe(422);
  });

  it("starts a tenant active and a property_owner pending", async () => {
    const tenant = await registerWith(userBody({ email: "t1@example.com" }));
    expect(tenant.body.data.user.accountStatus).toBe("active");
    expect(tenant.body.data.user.kycStatus).toBe("not_started");

    const owner = await registerWith(
      userBody({ email: "o1@example.com", role: "property_owner" }),
    );
    expect(owner.body.data.user.accountStatus).toBe("pending");
  });
});

describe("login account-status gating", () => {
  const creds = { email: "gated@example.com", password: "Password123" };

  beforeEach(async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Gated", ...creds, role: "tenant" });
  });

  it("allows a pending property owner to log in", async () => {
    await User.updateOne({ email: creds.email }, { accountStatus: "pending" });
    const res = await request(app).post("/api/v1/auth/login").send(creds);
    expect(res.status).toBe(200);
  });

  it("blocks a suspended account with 403", async () => {
    await User.updateOne({ email: creds.email }, { accountStatus: "suspended" });
    const res = await request(app).post("/api/v1/auth/login").send(creds);
    expect(res.status).toBe(403);
  });

  it("blocks a blocked account with 403", async () => {
    await User.updateOne({ email: creds.email }, { accountStatus: "blocked" });
    const res = await request(app).post("/api/v1/auth/login").send(creds);
    expect(res.status).toBe(403);
  });
});

describe("wallet linking", () => {
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("links and unlinks a wallet after signature verification", async () => {
    const wallet = Wallet.createRandom();
    const { body } = await register({ email: "wallet@example.com" });
    const token = body.data.tokens.accessToken;

    const challenge = await request(app)
      .post("/api/v1/auth/wallet/challenge")
      .set(bearer(token))
      .send({ walletAddress: wallet.address });

    expect(challenge.status).toBe(200);
    expect(challenge.body.data.walletAddress).toBe(wallet.address.toLowerCase());
    expect(challenge.body.data.message).toContain("Real Estate Marketplace wallet linking");

    const signature = await wallet.signMessage(challenge.body.data.message);
    const linked = await request(app)
      .post("/api/v1/auth/wallet/link")
      .set(bearer(token))
      .send({ walletAddress: wallet.address, signature });

    expect(linked.status).toBe(200);
    expect(linked.body.data.walletStatus).toBe("linked");
    expect(linked.body.data.walletAddress).toBe(wallet.address.toLowerCase());
    expect(linked.body.data).not.toHaveProperty("walletLinkChallenge");

    const me = await request(app).get("/api/v1/auth/me").set(bearer(token));
    expect(me.body.data.walletStatus).toBe("linked");

    const unlinked = await request(app)
      .delete("/api/v1/auth/wallet")
      .set(bearer(token));

    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data.walletStatus).toBe("unlinked");
    expect(unlinked.body.data.walletAddress).toBeUndefined();
  });

  it("rejects a signature from a different wallet", async () => {
    const wallet = Wallet.createRandom();
    const signer = Wallet.createRandom();
    const { body } = await register({ email: "badwallet@example.com" });
    const token = body.data.tokens.accessToken;

    const challenge = await request(app)
      .post("/api/v1/auth/wallet/challenge")
      .set(bearer(token))
      .send({ walletAddress: wallet.address });

    const signature = await signer.signMessage(challenge.body.data.message);
    const linked = await request(app)
      .post("/api/v1/auth/wallet/link")
      .set(bearer(token))
      .send({ walletAddress: wallet.address, signature });

    expect(linked.status).toBe(401);
  });

  it("prevents one wallet from being linked to two users", async () => {
    const wallet = Wallet.createRandom();
    const first = await register({ email: "wallet-one@example.com" });
    const second = await register({ email: "wallet-two@example.com" });

    const linkFor = async (token: string) => {
      const challenge = await request(app)
        .post("/api/v1/auth/wallet/challenge")
        .set(bearer(token))
        .send({ walletAddress: wallet.address });
      const signature = await wallet.signMessage(challenge.body.data.message);
      return request(app)
        .post("/api/v1/auth/wallet/link")
        .set(bearer(token))
        .send({ walletAddress: wallet.address, signature });
    };

    expect((await linkFor(first.body.data.tokens.accessToken)).status).toBe(200);
    expect((await linkFor(second.body.data.tokens.accessToken)).status).toBe(409);
  });
});
