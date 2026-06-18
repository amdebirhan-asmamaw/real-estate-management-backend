import request from "supertest";
import app from "../src/app";
import { AuditLog } from "../src/modules/audit/audit.model";

describe("request correlation", () => {
  it("returns x-request-id and stores it on audit metadata", async () => {
    const requestId = "req-register-correlation";

    const res = await request(app)
      .post("/api/v1/auth/register")
      .set("x-request-id", requestId)
      .send({
        name: "Correlation User",
        email: "correlation@example.com",
        password: "Password123",
        role: "tenant",
      });

    expect(res.status).toBe(201);
    expect(res.headers["x-request-id"]).toBe(requestId);

    const log = await AuditLog.findOne({ action: "user.registered" });
    expect(log?.metadata?.requestId).toBe(requestId);
  });
});
