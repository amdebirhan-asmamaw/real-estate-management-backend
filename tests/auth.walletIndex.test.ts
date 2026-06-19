/**
 * Task 1: unique + sparse wallet address index.
 *
 * Tests that two users cannot share the same walletAddress (duplicate-key
 * failure), while multiple users with NO walletAddress are still allowed
 * (sparse index — null values don't participate in uniqueness).
 */

import { User } from "../src/modules/auth/auth.model";

const WALLET = "0x" + "a".repeat(40);

const makeUser = (overrides: Record<string, unknown> = {}) =>
  User.create({
    name: "Test User",
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    password: "Password1!",
    ...overrides,
  });

describe("walletAddress unique sparse index", () => {
  it("allows two users with no walletAddress (sparse — nulls excluded)", async () => {
    // Both have walletAddress omitted; sparse index must not block this.
    await expect(makeUser()).resolves.toBeDefined();
    await expect(makeUser()).resolves.toBeDefined();
  });

  it("allows a single user with a walletAddress", async () => {
    await expect(makeUser({ walletAddress: WALLET })).resolves.toBeDefined();
  });

  it("rejects a second user with the same walletAddress (duplicate-key error)", async () => {
    await makeUser({ walletAddress: WALLET });

    await expect(makeUser({ walletAddress: WALLET })).rejects.toMatchObject({
      code: 11000, // MongoDB duplicate-key error code
    });
  });

  it("allows different users with different walletAddresses", async () => {
    const wallet2 = "0x" + "b".repeat(40);
    await makeUser({ walletAddress: WALLET });
    await expect(makeUser({ walletAddress: wallet2 })).resolves.toBeDefined();
  });
});
