jest.mock("../src/core/blockchain/leaseEscrow.service", () => ({
  openAndFundEscrow: jest.fn(async () => ({ escrowId: "1", txHash: "0xfund" })),
  activateEscrow: jest.fn(async () => ({ txHash: "0xact" })),
  cancelEscrow: jest.fn(async () => ({ txHash: "0xcancel" })),
  releaseDeposit: jest.fn(async () => ({ txHash: "0xrelease" })),
  refundDeposit: jest.fn(async () => ({ txHash: "0xrefund" })),
  getEscrow: jest.fn(async () => ({ state: "funded" })),
  isConfigured: () => true,
}));

import mongoose from "mongoose";
import { User } from "../src/modules/auth/auth.model";
import { Listing } from "../src/modules/listings/listing.model";
import { ComplianceCase, RiskScore } from "../src/modules/compliance/compliance.model";
import * as kyc from "../src/modules/kyc/kyc.service";
import * as listings from "../src/modules/listings/listing.service";
import * as offers from "../src/modules/offers/offer.service";
import * as leases from "../src/modules/leases/lease.service";

const adminId = new mongoose.Types.ObjectId().toString();

const makeUser = (role: "tenant" | "property_owner" | "admin", extra = {}) =>
  User.create({
    name: "Risk User",
    email: `risk-${Math.random().toString(36).slice(2)}@test.com`,
    password: "Password123",
    role,
    accountStatus: "active",
    kycStatus: "verified",
    ...extra,
  });

const listingInput = {
  title: "Risk Listing",
  listingType: "sale" as const,
  category: "residential" as const,
  propertyType: "apartment" as const,
  price: 2_000_000,
  currency: "USD",
  location: { type: "Point" as const, coordinates: [38.7, 9.0] as [number, number] },
};

describe("compliance automation", () => {
  it("opens a KYC compliance case on KYC rejection", async () => {
    const user = await makeUser("tenant", { kycStatus: "pending" });
    await kyc.reviewKyc(user.id, "reject", "Document mismatch", adminId, "admin");

    const item = await ComplianceCase.findOne({ type: "kyc", subjectUser: user.id });
    expect(item?.status).toBe("open");
    expect(item?.description).toBe("Document mismatch");
  });

  it("opens a listing compliance case on suspicious rejection", async () => {
    const owner = await makeUser("property_owner");
    const listing = await listings.createListing(listingInput, owner.id, "property_owner");
    await Listing.findByIdAndUpdate(listing.id, {
      status: "under_review",
      verificationStatus: "verified",
      ownershipDocumentHash: "abc",
      documents: [{ type: "title_deed", publicId: "doc", hash: "abc", status: "approved" }],
    });

    await listings.transition(
      listing.id,
      { action: "reject", reason: "suspicious", note: "Conflicting docs" },
      adminId,
      "admin",
    );

    const item = await ComplianceCase.findOne({ type: "listing", targetId: listing.id });
    expect(item?.severity).toBe("high");
  });

  it("scores and opens a case for high-value offers", async () => {
    const owner = await makeUser("property_owner");
    const buyer = await makeUser("tenant");
    const listing = await Listing.create({
      ...listingInput,
      status: "published",
      createdBy: owner.id,
    });

    const offer = await offers.createOffer(buyer.id, "tenant", {
      listingId: listing.id,
      amount: 1_500_000,
      currency: "USD",
    });

    expect(await RiskScore.countDocuments({ subjectId: offer.id })).toBe(1);
    expect(await ComplianceCase.countDocuments({ type: "offer", targetId: offer.id })).toBe(1);
  });

  it("opens a lease compliance case on dispute", async () => {
    const landlord = await makeUser("property_owner", {
      walletAddress: "0x" + "a".repeat(40),
    });
    const tenant = await makeUser("tenant", {
      walletAddress: "0x" + "b".repeat(40),
    });
    const listing = await Listing.create({
      title: "Lease Risk",
      listingType: "rent",
      category: "residential",
      propertyType: "apartment",
      monthlyRent: 1000,
      currency: "USD",
      status: "published",
      location: { type: "Point", coordinates: [38.7, 9.0] },
      createdBy: landlord.id,
    });
    const lease = await leases.createLease(
      {
        listingId: listing.id,
        tenantId: tenant.id,
        monthlyRent: 1000,
        depositAmount: 1000,
        currency: "USD",
        startDate: "2026-07-01",
        endDate: "2027-07-01",
      },
      landlord.id,
      "property_owner",
    );
    await leases.propose(lease.id, landlord.id, "property_owner");
    await leases.dispute(lease.id, tenant.id, "tenant");

    expect(await ComplianceCase.countDocuments({ type: "lease", targetId: lease.id })).toBe(1);
  });
});
