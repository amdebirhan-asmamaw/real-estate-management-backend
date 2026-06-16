jest.mock("../src/core/utils/mailer", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { RefreshSession } from "../src/modules/auth/session.model";
import { PasswordResetToken } from "../src/modules/auth/passwordResetToken.model";
import { sendPasswordResetEmail } from "../src/core/utils/mailer";

const PASSWORD = "Password123";
const NEW_PASSWORD = "NewPass123";

const register = (email: string, role = "tenant") =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Profile User", email, password: PASSWORD, role });

const login = (email: string, password = PASSWORD) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const resetTokenFromMail = (): string => {
  const resetUrl = (sendPasswordResetEmail as jest.Mock).mock.calls[0][1] as string;
  return new URL(resetUrl).searchParams.get("token")!;
};

describe("PATCH /api/v1/auth/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("updates the caller's profile fields", async () => {
    const reg = await register("profile@example.com");
    const token = reg.body.data.tokens.accessToken;

    const updated = await request(app)
      .patch("/api/v1/auth/me")
      .set(bearer(token))
      .send({ name: "Updated User", phone: "+251911000000" });

    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Updated User");
    expect(updated.body.data.phone).toBe("+251911000000");
    expect(updated.body.data.walletStatus).toBe("unlinked");
  });

  it("rejects empty profile updates", async () => {
    const reg = await register("empty-profile@example.com");
    const token = reg.body.data.tokens.accessToken;

    const res = await request(app)
      .patch("/api/v1/auth/me")
      .set(bearer(token))
      .send({});

    expect(res.status).toBe(422);
  });
});

describe("Password reset by email", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends reset instructions without exposing account existence", async () => {
    await register("reset-request@example.com");

    const known = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "reset-request@example.com" });
    expect(known.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    const unknown = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "unknown@example.com" });
    expect(unknown.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("resets the password, consumes the token, and revokes sessions", async () => {
    const reg = await register("reset@example.com");
    const refreshToken = reg.body.data.tokens.refreshToken;

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "reset@example.com" })
      .expect(200);

    const rawToken = resetTokenFromMail();
    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(reset.status).toBe(200);
    expect((await login("reset@example.com", PASSWORD)).status).toBe(401);
    expect((await login("reset@example.com", NEW_PASSWORD)).status).toBe(200);

    const oldSession = await request(app)
      .post("/api/v1/auth/refresh-token")
      .send({ refreshToken });
    expect(oldSession.status).toBe(401);

    const reused = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: "Another123" });
    expect(reused.status).toBe(401);

    const usedToken = await PasswordResetToken.findOne({});
    expect(usedToken?.usedAt).toBeDefined();
  });

  it("rejects expired reset tokens", async () => {
    await register("expired@example.com");
    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "expired@example.com" })
      .expect(200);

    const rawToken = resetTokenFromMail();
    await PasswordResetToken.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it("does not send reset email for blocked accounts", async () => {
    await register("blocked-reset@example.com");
    await User.updateOne(
      { email: "blocked-reset@example.com" },
      { accountStatus: "blocked" },
    );

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "blocked-reset@example.com" });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/change-password", () => {
  it("rejects reusing the current password", async () => {
    const reg = await register("same-password@example.com");
    const accessToken = reg.body.data.tokens.accessToken;

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set(bearer(accessToken))
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(await RefreshSession.countDocuments({ revokedAt: { $exists: false } })).toBe(1);
  });
});
