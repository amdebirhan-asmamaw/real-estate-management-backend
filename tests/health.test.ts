import request from "supertest";
import app from "../src/app";

describe("Health endpoints", () => {
  it("GET /health returns liveness status", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });

  it("GET /health/ready reports the database as up", async () => {
    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.services.database.status).toBe("up");
    expect(res.body.services.smtp.status).toBeDefined();
    expect(res.body.services.cloudinary.status).toBeDefined();
    expect(res.body.services.rpcProvider.status).toBeDefined();
    expect(res.body.services.titleContract.status).toBeDefined();
    expect(res.body.services.leaseEscrow.status).toBeDefined();
    expect(res.body.services.saleEscrow.status).toBeDefined();
    expect(res.body.services.geocoder.status).toBe("configured");
  });

  it("returns 404 with a structured body for unknown routes", async () => {
    const res = await request(app)
      .get("/api/v1/does-not-exist")
      .set("x-request-id", "req-health-404");

    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toBe("req-health-404");
    expect(res.body.success).toBe(false);
    expect(res.body.requestId).toBe("req-health-404");
    expect(res.body.message).toContain("Route not found");
  });
});
