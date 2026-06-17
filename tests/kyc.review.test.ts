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
import { AuditLog } from "../src/modules/audit/audit.model";
import { AppError } from "../src/core/utils/AppError";
import * as kyc from "../src/modules/kyc/kyc.service";
import { kycReviewSchema } from "../src/modules/kyc/kyc.validation";

// ── Seed helpers ──────────────────────────────────────────────────────────────

const makeOwner = async (
  email: string,
  opts: { kycStatus?: string } = {},
) =>
  User.create({
    name: "Owner",
    email,
    password: "Password123!",
    role: "property_owner",
    ...(opts.kycStatus ? { kycStatus: opts.kycStatus } : {}),
  });

const adminId = new mongoose.Types.ObjectId().toString();
const docs = [{ type: "national_id" as const, publicId: "secret/a", hash: "abc" }];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("kycReviewSchema validation", () => {
  it("(a) rejects a reject decision without a note", () => {
    const { error } = kycReviewSchema.validate({ decision: "reject" });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/rejection reason/i);
  });

  it("(a) accepts a reject decision with a note", () => {
    const { error } = kycReviewSchema.validate({
      decision: "reject",
      note: "Documents were blurry",
    });
    expect(error).toBeUndefined();
  });

  it("(a) accepts an approve decision without a note", () => {
    const { error } = kycReviewSchema.validate({ decision: "approve" });
    expect(error).toBeUndefined();
  });
});

describe("startKycReview", () => {
  it("(b) moves a pending user to under_review", async () => {
    const user = await makeOwner("sr1@example.com");
    await kyc.submitKyc(user.id, docs); // → pending

    const summary = await kyc.startKycReview(user.id, adminId, "admin");
    expect(summary.kycStatus).toBe("under_review");

    const fresh = await User.findById(user.id);
    expect(fresh?.kycStatus).toBe("under_review");

    const log = await AuditLog.findOne({
      targetId: user.id,
      action: "user.kyc_review_started",
    });
    expect(log).not.toBeNull();
  });

  it("(b) rejects when user is not in pending status", async () => {
    const user = await makeOwner("sr2@example.com");
    // kycStatus defaults to not_started
    await expect(
      kyc.startKycReview(user.id, adminId, "admin"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("(b) forbids non-admins", async () => {
    const user = await makeOwner("sr3@example.com");
    await kyc.submitKyc(user.id, docs);
    await expect(
      kyc.startKycReview(user.id, user.id, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("(b) approve/reject work from under_review status", async () => {
    const user = await makeOwner("sr4@example.com");
    await kyc.submitKyc(user.id, docs);
    await kyc.startKycReview(user.id, adminId, "admin");

    const summary = await kyc.reviewKyc(
      user.id,
      "approve",
      undefined,
      adminId,
      "admin",
    );
    expect(summary.kycStatus).toBe("verified");
  });
});

describe("submitKyc resubmission audit", () => {
  it("(c) writes user.kyc_resubmitted when resubmitting after rejection", async () => {
    const user = await makeOwner("rs1@example.com");

    // First submission → pending
    await kyc.submitKyc(user.id, docs);
    // Admin rejects
    await kyc.reviewKyc(user.id, "reject", "Blurry", adminId, "admin");
    // User resubmits
    await kyc.submitKyc(user.id, docs);

    const resubLog = await AuditLog.findOne({
      targetId: user.id,
      action: "user.kyc_resubmitted",
    });
    expect(resubLog).not.toBeNull();
  });

  it("(c) writes user.kyc_submitted on first submission (not resubmitted)", async () => {
    const user = await makeOwner("rs2@example.com");
    await kyc.submitKyc(user.id, docs);

    const firstLog = await AuditLog.findOne({
      targetId: user.id,
      action: "user.kyc_submitted",
    });
    expect(firstLog).not.toBeNull();

    const resubLog = await AuditLog.findOne({
      targetId: user.id,
      action: "user.kyc_resubmitted",
    });
    expect(resubLog).toBeNull();
  });
});
