/**
 * admin.override.test.ts
 * Tests for Phase B Task B3: super-admin restore user + override compliance case.
 */
import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { ComplianceCase } from "../src/modules/compliance/compliance.model";
import { AuditLog } from "../src/modules/audit/audit.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const register = (email: string, role: "tenant" | "property_owner") =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Override Test User", email, password: PASSWORD, role });

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

const makeSuperAdmin = async (email: string) => {
  await register(email, "tenant");
  await User.updateOne({ email }, { role: "super_admin" });
  return login(email);
};

// ─── B3: restoreUser ─────────────────────────────────────────────────────────

describe("POST /admin/users/:id/restore", () => {
  it("super_admin restores a blocked user → accountStatus=active + audit log created", async () => {
    const superToken = await makeSuperAdmin("restore-super@example.com");

    await register("blocked-user@example.com", "tenant");
    const user = await User.findOneAndUpdate(
      { email: "blocked-user@example.com" },
      { accountStatus: "blocked" },
      { new: true },
    );
    expect(user!.accountStatus).toBe("blocked");

    const res = await request(app)
      .post(`/api/v1/admin/users/${user!._id}/restore`)
      .set(bearer(superToken));

    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe("active");

    // Verify audit log was written with the correct previousStatus
    const logs = await AuditLog.find({
      action: "admin.restored_user",
      targetId: user!._id,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata?.previousStatus).toBe("blocked");
  });

  it("super_admin restores a suspended user → accountStatus=active", async () => {
    const superToken = await makeSuperAdmin("restore-super2@example.com");

    await register("suspended-restore@example.com", "tenant");
    const user = await User.findOneAndUpdate(
      { email: "suspended-restore@example.com" },
      { accountStatus: "suspended" },
      { new: true },
    );

    const res = await request(app)
      .post(`/api/v1/admin/users/${user!._id}/restore`)
      .set(bearer(superToken));

    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe("active");
  });

  it("returns 400 when user is not blocked or suspended", async () => {
    const superToken = await makeSuperAdmin("restore-super3@example.com");

    await register("active-user@example.com", "tenant");
    const user = await User.findOne({ email: "active-user@example.com" });

    const res = await request(app)
      .post(`/api/v1/admin/users/${user!._id}/restore`)
      .set(bearer(superToken));

    expect(res.status).toBe(400);
  });

  it("plain admin gets 403 when attempting restore", async () => {
    const adminToken = await makeAdmin("restore-plain-admin@example.com");

    await register("to-restore@example.com", "tenant");
    const user = await User.findOneAndUpdate(
      { email: "to-restore@example.com" },
      { accountStatus: "blocked" },
      { new: true },
    );

    const res = await request(app)
      .post(`/api/v1/admin/users/${user!._id}/restore`)
      .set(bearer(adminToken));

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent user", async () => {
    const superToken = await makeSuperAdmin("restore-super4@example.com");

    const res = await request(app)
      .post(`/api/v1/admin/users/${new mongoose.Types.ObjectId()}/restore`)
      .set(bearer(superToken));

    expect(res.status).toBe(404);
  });
});

// ─── B3: overrideComplianceCase ───────────────────────────────────────────────

describe("POST /admin/compliance/cases/:id/override", () => {
  const makeOpenCase = () =>
    ComplianceCase.create({
      type: "listing",
      status: "open",
      severity: "high",
      title: "Flagged for override",
      targetType: "listing",
      targetId: new mongoose.Types.ObjectId(),
    });

  it("super_admin overrides a case with a reason → terminal status + audit", async () => {
    const superToken = await makeSuperAdmin("override-super@example.com");
    const compCase = await makeOpenCase();

    const res = await request(app)
      .post(`/api/v1/admin/compliance/cases/${compCase._id}/override`)
      .set(bearer(superToken))
      .send({ status: "resolved", reason: "Reviewed and confirmed as false positive after investigation" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("resolved");
    expect(res.body.data.resolution).toBeTruthy();
    expect(res.body.data.notes).toHaveLength(1);
    expect(res.body.data.notes[0].body).toContain("[Super-admin override]");

    const logs = await AuditLog.find({
      action: "admin.override_decision",
      targetId: compCase._id,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata?.status).toBe("resolved");
  });

  it("super_admin can dismiss a case", async () => {
    const superToken = await makeSuperAdmin("override-super2@example.com");
    const compCase = await makeOpenCase();

    const res = await request(app)
      .post(`/api/v1/admin/compliance/cases/${compCase._id}/override`)
      .set(bearer(superToken))
      .send({ status: "dismissed", reason: "Confirmed as spam report with no supporting evidence" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("dismissed");
  });

  it("returns 422 when reason is missing", async () => {
    const superToken = await makeSuperAdmin("override-super3@example.com");
    const compCase = await makeOpenCase();

    const res = await request(app)
      .post(`/api/v1/admin/compliance/cases/${compCase._id}/override`)
      .set(bearer(superToken))
      .send({ status: "resolved" }); // no reason

    expect(res.status).toBe(422);
  });

  it("returns 422 when reason is too short", async () => {
    const superToken = await makeSuperAdmin("override-super4@example.com");
    const compCase = await makeOpenCase();

    const res = await request(app)
      .post(`/api/v1/admin/compliance/cases/${compCase._id}/override`)
      .set(bearer(superToken))
      .send({ status: "resolved", reason: "short" }); // < 10 chars

    expect(res.status).toBe(422);
  });

  it("returns 400 when case is already terminal", async () => {
    const superToken = await makeSuperAdmin("override-super5@example.com");
    const compCase = await ComplianceCase.create({
      type: "kyc",
      status: "resolved",
      severity: "low",
      title: "Already resolved",
      targetType: "user",
      targetId: new mongoose.Types.ObjectId(),
    });

    const res = await request(app)
      .post(`/api/v1/admin/compliance/cases/${compCase._id}/override`)
      .set(bearer(superToken))
      .send({ status: "dismissed", reason: "This case is already closed per policy" });

    expect(res.status).toBe(400);
  });

  it("plain admin gets 403 on override", async () => {
    const adminToken = await makeAdmin("override-plain-admin@example.com");
    const compCase = await makeOpenCase();

    const res = await request(app)
      .post(`/api/v1/admin/compliance/cases/${compCase._id}/override`)
      .set(bearer(adminToken))
      .send({ status: "resolved", reason: "Trying from plain admin account" });

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent compliance case", async () => {
    const superToken = await makeSuperAdmin("override-super6@example.com");

    const res = await request(app)
      .post(`/api/v1/admin/compliance/cases/${new mongoose.Types.ObjectId()}/override`)
      .set(bearer(superToken))
      .send({ status: "resolved", reason: "Targeting a non-existent case for test" });

    expect(res.status).toBe(404);
  });
});
