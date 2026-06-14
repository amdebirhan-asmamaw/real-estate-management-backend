jest.mock("../src/core/utils/uploader", () => ({
  signedUrl: jest.fn(() => "https://cdn/signed?sig=1"),
}));

import mongoose from "mongoose";
import * as kyc from "../src/modules/kyc/kyc.service";
import { User } from "../src/modules/auth/auth.model";
import { AuditLog } from "../src/modules/audit/audit.model";
import { AppError } from "../src/core/utils/AppError";

const adminId = new mongoose.Types.ObjectId().toString();

const makeOwner = async (email: string) => {
  const user = await User.create({
    name: "Owner",
    email,
    password: "Password123",
    role: "property_owner",
  });
  return user.id as string;
};

const docs = [{ type: "national_id" as const, publicId: "secret/a", hash: "abc" }];

describe("kyc.service", () => {
  it("submits KYC docs and moves status to pending", async () => {
    const id = await makeOwner("k1@example.com");
    const summary = await kyc.submitKyc(id, docs);
    expect(summary.kycStatus).toBe("pending");
    expect(summary.documents).toHaveLength(1);
    expect(summary.documents[0]).not.toHaveProperty("publicId");

    const logs = await AuditLog.find({ targetId: id, action: "user.kyc_submitted" });
    expect(logs).toHaveLength(1);
    expect(logs[0].targetType).toBe("user");
  });

  it("approving KYC verifies and activates the property owner", async () => {
    const id = await makeOwner("k2@example.com");
    await kyc.submitKyc(id, docs);
    const summary = await kyc.reviewKyc(id, "approve", "ok", adminId, "admin");
    expect(summary.kycStatus).toBe("verified");
    expect(summary.accountStatus).toBe("active");

    const fresh = await User.findById(id);
    expect(fresh?.accountStatus).toBe("active");
  });

  it("rejecting KYC marks it rejected but leaves the account pending", async () => {
    const id = await makeOwner("k3@example.com");
    await kyc.submitKyc(id, docs);
    const summary = await kyc.reviewKyc(id, "reject", "blurry", adminId, "admin");
    expect(summary.kycStatus).toBe("rejected");
    expect(summary.accountStatus).toBe("pending");
  });

  it("forbids a non-admin from reviewing KYC", async () => {
    const id = await makeOwner("k4@example.com");
    await kyc.submitKyc(id, docs);
    await expect(
      kyc.reviewKyc(id, "approve", undefined, id, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("forbids one user from reading another's KYC docs", async () => {
    const a = await makeOwner("k5@example.com");
    const b = await makeOwner("k6@example.com");
    await kyc.submitKyc(a, docs);
    await expect(
      kyc.getKycSummary(a, b, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("mints a signed URL for the owner's KYC document", async () => {
    const id = await makeOwner("k7@example.com");
    const summary = await kyc.submitKyc(id, docs);
    const url = await kyc.getKycDocumentUrl(id, summary.documents[0].id, id, "property_owner");
    expect(url).toContain("sig=");
  });

  it("lets an admin change account status", async () => {
    const id = await makeOwner("k8@example.com");
    const user = await kyc.setAccountStatus(id, "suspended", adminId, "admin");
    expect(user.accountStatus).toBe("suspended");
    const logs = await AuditLog.find({ targetId: id, action: "user.status_changed" });
    expect(logs).toHaveLength(1);
  });
});
