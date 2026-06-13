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
    expect(res.body.services.database).toBe("up");
  });

  it("returns 404 with a structured body for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Route not found");
  });
});
