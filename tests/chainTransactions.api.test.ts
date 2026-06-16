import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { ChainTransaction } from "../src/modules/chainTransactions/chainTransaction.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const makeUser = async (email: string, role: "tenant" | "admin") => {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Chain User", email, password: PASSWORD, role: "tenant" });
  await User.updateOne({ email }, { role });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return login.body.data.tokens.accessToken as string;
};

describe("GET /api/v1/chain-transactions", () => {
  it("lets admins query chain transactions", async () => {
    const admin = await makeUser("chain-admin@example.com", "admin");
    const actor = await User.findOne({ email: "chain-admin@example.com" });
    const targetId = new mongoose.Types.ObjectId();

    await ChainTransaction.create({
      operation: "title.mint",
      status: "mined",
      targetType: "listing",
      targetId,
      createdBy: actor!.id,
      txHash: "0xtitle",
    });

    const res = await request(app)
      .get("/api/v1/chain-transactions?status=mined&targetType=listing")
      .set(bearer(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].txHash).toBe("0xtitle");
  });

  it("blocks tenants from querying chain transactions", async () => {
    const tenant = await makeUser("chain-tenant@example.com", "tenant");

    const res = await request(app)
      .get("/api/v1/chain-transactions")
      .set(bearer(tenant));

    expect(res.status).toBe(403);
  });
});
