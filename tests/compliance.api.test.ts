import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { ComplianceCase } from "../src/modules/compliance/compliance.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const register = (email: string, role: "tenant" | "property_owner") =>
  request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Compliance User", email, password: PASSWORD, role });

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

describe("Compliance API", () => {
  it("lets property owners submit representative licenses for admin review", async () => {
    await register("license-owner@example.com", "property_owner");
    const ownerToken = await login("license-owner@example.com");
    const adminToken = await makeAdmin("license-admin@example.com");

    const created = await request(app)
      .post("/api/v1/compliance/broker-licenses")
      .set(bearer(ownerToken))
      .send({
        licenseNumber: "BR-123",
        jurisdiction: "ET-AA",
        holderName: "Representative Owner",
      });

    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("pending");

    const listed = await request(app)
      .get("/api/v1/compliance/broker-licenses?status=pending")
      .set(bearer(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.total).toBe(1);

    const licenseId = created.body.data.id ?? created.body.data._id;
    const reviewed = await request(app)
      .post(`/api/v1/compliance/broker-licenses/${licenseId}/review`)
      .set(bearer(adminToken))
      .send({ decision: "approve", note: "Verified" });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.status).toBe("approved");

    const cases = await ComplianceCase.find({ type: "broker_license" });
    expect(cases).toHaveLength(1);
  });

  it("lets admins create screenings and update compliance cases", async () => {
    await register("screened@example.com", "tenant");
    const target = await User.findOne({ email: "screened@example.com" });
    const adminToken = await makeAdmin("screening-admin@example.com");

    const screening = await request(app)
      .post("/api/v1/compliance/screenings")
      .set(bearer(adminToken))
      .send({
        subjectUser: target!.id,
        status: "potential_match",
        categories: ["pep"],
        reference: "manual-check",
      });
    expect(screening.status).toBe(201);

    const cases = await request(app)
      .get("/api/v1/compliance/cases?status=open")
      .set(bearer(adminToken));
    expect(cases.body.data.total).toBe(1);

    const caseId = cases.body.data.items[0].id ?? cases.body.data.items[0]._id;
    const updated = await request(app)
      .patch(`/api/v1/compliance/cases/${caseId}`)
      .set(bearer(adminToken))
      .send({ status: "resolved", resolution: "False positive", note: "Cleared" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe("resolved");
    expect(updated.body.data.notes).toHaveLength(1);
  });

  it("blocks tenants from compliance queues", async () => {
    await register("tenant-blocked@example.com", "tenant");
    const tenantToken = await login("tenant-blocked@example.com");

    const res = await request(app)
      .get("/api/v1/compliance/cases")
      .set(bearer(tenantToken));
    expect(res.status).toBe(403);
  });
});
