// Mock side-effect services before any application imports.
jest.mock("../src/modules/notifications/notification.service", () => ({
  notify: jest.fn(async () => {}),
}));
jest.mock("../src/modules/compliance/compliance.service", () => ({
  flagKycRejection: jest.fn(async () => {}),
}));
jest.mock("../src/core/utils/uploader", () => ({
  signedUrl: jest.fn(() => "https://cdn/signed?sig=1"),
}));

import mongoose from "mongoose";
import { User } from "../src/modules/auth/auth.model";
import * as kyc from "../src/modules/kyc/kyc.service";
import { isKycValid } from "../src/modules/kyc/kyc.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeOwner = async (email: string) =>
  User.create({
    name: "Owner",
    email,
    password: "Password123!",
    role: "property_owner",
  });

const adminId = new mongoose.Types.ObjectId().toString();
const docs = [{ type: "national_id" as const, publicId: "secret/b", hash: "def" }];

// ── isKycValid unit tests (pure logic) ────────────────────────────────────────

describe("isKycValid", () => {
  it("returns false when kycStatus is not verified", () => {
    expect(isKycValid({ kycStatus: "pending", kycExpiresAt: undefined })).toBe(false);
    expect(isKycValid({ kycStatus: "rejected", kycExpiresAt: undefined })).toBe(false);
    expect(isKycValid({ kycStatus: "not_started", kycExpiresAt: undefined })).toBe(false);
    expect(isKycValid({ kycStatus: "under_review", kycExpiresAt: undefined })).toBe(false);
    expect(isKycValid({ kycStatus: "expired", kycExpiresAt: undefined })).toBe(false);
  });

  it("returns true when verified and no expiry set", () => {
    expect(isKycValid({ kycStatus: "verified", kycExpiresAt: undefined })).toBe(true);
  });

  it("returns true when verified and expiry is in the future", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isKycValid({ kycStatus: "verified", kycExpiresAt: future })).toBe(true);
  });

  it("returns false when verified but expiry has passed", () => {
    const past = new Date(Date.now() - 1);
    expect(isKycValid({ kycStatus: "verified", kycExpiresAt: past })).toBe(false);
  });
});

// ── kycVerifiedAt is set on approval ─────────────────────────────────────────

describe("reviewKyc approval sets kycVerifiedAt", () => {
  it("sets kycVerifiedAt to a Date on approval", async () => {
    const user = await makeOwner("exp1@example.com");
    await kyc.submitKyc(user.id, docs);
    await kyc.reviewKyc(user.id, "approve", undefined, adminId, "admin");

    const fresh = await User.findById(user.id);
    expect(fresh?.kycVerifiedAt).toBeInstanceOf(Date);
    expect(fresh?.kycStatus).toBe("verified");
  });

  it("does not set kycVerifiedAt on rejection", async () => {
    const user = await makeOwner("exp2@example.com");
    await kyc.submitKyc(user.id, docs);
    await kyc.reviewKyc(user.id, "reject", "Bad docs", adminId, "admin");

    const fresh = await User.findById(user.id);
    expect(fresh?.kycVerifiedAt).toBeUndefined();
    expect(fresh?.kycStatus).toBe("rejected");
  });
});

// ── isKycValid integrates with real DB user ───────────────────────────────────

describe("isKycValid with DB user", () => {
  it("returns true for a freshly approved user with no expiry", async () => {
    const user = await makeOwner("exp3@example.com");
    await kyc.submitKyc(user.id, docs);
    await kyc.reviewKyc(user.id, "approve", undefined, adminId, "admin");

    const fresh = await User.findById(user.id);
    expect(isKycValid(fresh!)).toBe(true);
  });

  it("returns false for a user with a past kycExpiresAt", async () => {
    const user = await makeOwner("exp4@example.com");
    await kyc.submitKyc(user.id, docs);
    await kyc.reviewKyc(user.id, "approve", undefined, adminId, "admin");

    // Manually set an expired date directly on the document.
    await User.findByIdAndUpdate(user.id, {
      kycExpiresAt: new Date(Date.now() - 1000),
    });
    const fresh = await User.findById(user.id);
    expect(isKycValid(fresh!)).toBe(false);
  });
});
