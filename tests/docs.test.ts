import request from "supertest";
import app from "../src/app";

describe("API docs", () => {
  it("serves the raw OpenAPI document", async () => {
    const res = await request(app).get("/api/docs.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBeDefined();
    // A few representative paths are present.
    expect(res.body.paths["/auth/login"]).toBeDefined();
    expect(res.body.paths["/listings"]).toBeDefined();
    expect(res.body.paths["/kyc/documents"]).toBeDefined();
  });

  it("serves the Swagger UI html", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });
});
