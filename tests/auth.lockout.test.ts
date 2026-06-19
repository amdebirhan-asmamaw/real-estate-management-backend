/**
 * Task 2: Account lockout after repeated failed logins.
 *
 * Uses the API level (supertest) so we exercise the full auth stack.
 * MAX_LOGIN_ATTEMPTS is set to 3 via env.setup.ts overrides within this file.
 *
 * Three behavioural requirements:
 * 1. N failed attempts → next attempt returns 423.
 * 2. Correct password while locked → still 423 (lock wins over password check).
 * 3. Successful login resets the counter (re-locking requires N new failures).
 */

// ── Override lockout config before env module loads ───────────────────────────
// env.setup.ts has already run (setupFiles). We override the relevant vars here
// via jest.mock so the module-level env singleton sees our values.
jest.mock("../src/core/config/env", () => {
  const actual = jest.requireActual(
    "../src/core/config/env",
  ) as typeof import("../src/core/config/env");
  return {
    ...actual,
    env: {
      ...actual.env,
      MAX_LOGIN_ATTEMPTS: 3,
      LOGIN_LOCK_MINUTES: 15,
    },
  };
});

import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";

const BASE = "/api/v1/auth";
const EMAIL = "lockout@example.com";
const GOOD_PW = "GoodPassword1!";
const BAD_PW = "WrongPassword1!";

const register = () =>
  request(app)
    .post(`${BASE}/register`)
    .send({ name: "Lock Out", email: EMAIL, password: GOOD_PW });

const login = (password: string) =>
  request(app).post(`${BASE}/login`).send({ email: EMAIL, password });

describe("account lockout", () => {
  beforeEach(async () => {
    await register();
  });

  it("locks after MAX_LOGIN_ATTEMPTS (3) consecutive failures → 423", async () => {
    // 3 bad attempts — the 3rd should trigger the lock and return 401 for that
    // attempt itself (lock is set for NEXT attempt). Then 4th → 423.
    await login(BAD_PW); // 1
    await login(BAD_PW); // 2
    await login(BAD_PW); // 3  — lock is now set, attempt itself is 401

    const res = await login(BAD_PW); // 4 — should now be 423 (locked)
    expect(res.status).toBe(423);
    expect(res.body.success).toBe(false);
  });

  it("rejects correct password while locked → 423", async () => {
    // Reach lockout
    await login(BAD_PW);
    await login(BAD_PW);
    await login(BAD_PW); // lock set

    // Now try with the CORRECT password — should still be 423
    const res = await login(GOOD_PW);
    expect(res.status).toBe(423);
  });

  it("successful login before lockout resets the counter", async () => {
    await login(BAD_PW); // 1
    await login(BAD_PW); // 2 — still below threshold

    // Correct password resets the counter
    const goodRes = await login(GOOD_PW);
    expect(goodRes.status).toBe(200);

    // Now check the DB: failedLoginAttempts should be 0
    const user = await User.findOne({ email: EMAIL });
    expect(user?.failedLoginAttempts).toBe(0);
    expect(user?.lockedUntil).toBeUndefined();
  });
});
