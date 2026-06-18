// Mock chain service BEFORE any app imports.
jest.mock("../src/core/blockchain/propertyTitle.service", () => ({
  isConfigured: () => true,
  mintTitle: jest.fn().mockResolvedValue({
    tokenId: "42",
    txHash: "0xtxhash",
    contractAddress: "0xContract",
    owner: "0xMinter",
  }),
  getTitle: jest.fn(),
  disputeTitle: jest.fn().mockResolvedValue({ txHash: "0xdisputetx" }),
  clearTitleDispute: jest.fn().mockResolvedValue({ txHash: "0xcleartx" }),
}));

import mongoose from "mongoose";
import * as service from "../src/modules/listings/listing.service";
import * as chain from "../src/core/blockchain/propertyTitle.service";
import { Listing } from "../src/modules/listings/listing.model";
import { ChainTransaction } from "../src/modules/chainTransactions/chainTransaction.model";
import { AuditLog } from "../src/modules/audit/audit.model";
import { Notification } from "../src/modules/notifications/notification.model";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const adminId = new mongoose.Types.ObjectId().toString();

const baseInput: CreateListingInput = {
  title: "Test Flat",
  listingType: "rent",
  category: "residential",
  propertyType: "apartment",
  monthlyRent: 1500,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

/** Create a verified published listing and mint its title. */
const mintedListing = async () => {
  const doc = await service.createListing(baseInput, ownerId, "property_owner");
  await Listing.findByIdAndUpdate(doc.id, {
    status: "published",
    verificationStatus: "verified",
    ownershipDocumentHash: "deadbeef",
    verifiedAt: new Date("2025-01-01"),
  });
  const minted = await service.mintTitle(doc.id, adminId, "admin");
  return minted;
};

// ─── A4: Certificate view ────────────────────────────────────────────────────

describe("getCertificate", () => {
  const DISCLAIMER =
    "Blockchain-backed verification record; not a government-recognized legal title.";

  it("returns not_issued with nulls when listing has no tokenId", async () => {
    const doc = await service.createListing(baseInput, ownerId, "property_owner");
    // Make it published so optional-auth visibility check passes.
    await Listing.findByIdAndUpdate(doc.id, { status: "published" });

    const cert = await service.getCertificate(doc.id, null, null);

    expect(cert.status).toBe("not_issued");
    expect(cert.tokenId).toBeNull();
    expect(cert.certificateId).toBeNull();
    expect(cert.ownerWallet).toBeNull();
    expect(cert.txHash).toBeNull();
    expect(cert.contractAddress).toBeNull();
    expect(cert.documentHash).toBeNull();
    expect(cert.propertyId).toBe(doc.id);
    expect(cert.disclaimer).toBe(DISCLAIMER);
  });

  it("disclaimer is always present even when not_issued", async () => {
    const doc = await service.createListing(baseInput, ownerId, "property_owner");
    await Listing.findByIdAndUpdate(doc.id, { status: "published" });
    const cert = await service.getCertificate(doc.id, null, null);
    expect(cert.disclaimer).toBe(DISCLAIMER);
  });

  it("returns issued status when on-chain status is active", async () => {
    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "active",
    });

    const listing = await mintedListing();
    const cert = await service.getCertificate(listing.id, null, null);

    expect(cert.status).toBe("issued");
    expect(cert.tokenId).toBe("42");
    expect(cert.certificateId).toBe("PTITLE-42");
    expect(cert.ownerWallet).toBe("0xOwner");
    expect(cert.txHash).toBe("0xtxhash");
    expect(cert.contractAddress).toBe("0xContract");
    expect(cert.documentHash).toBe("deadbeef");
    expect(cert.disclaimer).toBe(DISCLAIMER);
  });

  it("maps disputed → suspended", async () => {
    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "disputed",
    });
    const listing = await mintedListing();
    const cert = await service.getCertificate(listing.id, null, null);
    expect(cert.status).toBe("suspended");
    expect(cert.disclaimer).toBe(DISCLAIMER);
  });

  it("maps revoked → revoked", async () => {
    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "revoked",
    });
    const listing = await mintedListing();
    const cert = await service.getCertificate(listing.id, null, null);
    expect(cert.status).toBe("revoked");
    expect(cert.disclaimer).toBe(DISCLAIMER);
  });
});

// ─── A5: Admin certificate suspend / restore ─────────────────────────────────

describe("disputeOnChainTitle (certificate suspend)", () => {
  it("requires admin role", async () => {
    const doc = await service.createListing(baseInput, ownerId, "property_owner");
    await Listing.findByIdAndUpdate(doc.id, {
      status: "published",
      verificationStatus: "verified",
      ownershipDocumentHash: "deadbeef",
      tokenId: "99",
    });
    await expect(
      service.disputeOnChainTitle(doc.id, "fraud", ownerId, "property_owner"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("disputes the title, suspends the listing, audits and notifies", async () => {
    (chain.getTitle as jest.Mock).mockResolvedValue({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "active",
    });

    const listing = await mintedListing();

    const updated = await service.disputeOnChainTitle(
      listing.id,
      "suspected_fraud",
      adminId,
      "admin",
    );

    expect(updated.status).toBe("suspended");

    const log = await AuditLog.findOne({
      targetId: listing.id,
      action: "listing.title_disputed",
    });
    expect(log).not.toBeNull();
    expect(log!.metadata?.txHash).toBe("0xdisputetx");

    const notif = await Notification.findOne({ recipient: ownerId, title: "Title disputed" });
    expect(notif).not.toBeNull();
    expect(notif!.title).toBe("Title disputed");
  });
});

describe("clearOnChainTitleDispute (certificate restore)", () => {
  it("requires admin role", async () => {
    const doc = await service.createListing(baseInput, ownerId, "property_owner");
    await Listing.findByIdAndUpdate(doc.id, {
      status: "suspended",
      tokenId: "88",
    });
    await expect(
      service.clearOnChainTitleDispute(doc.id, "resolved", ownerId, "property_owner"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("clears dispute, restores listing to published, audits and notifies", async () => {
    (chain.getTitle as jest.Mock).mockResolvedValue({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "disputed",
    });

    const listing = await mintedListing();
    // First suspend it.
    await service.disputeOnChainTitle(listing.id, "suspected_fraud", adminId, "admin");

    // Now clear the dispute.
    const restored = await service.clearOnChainTitleDispute(
      listing.id,
      "case_dismissed",
      adminId,
      "admin",
    );

    expect(restored.status).toBe("published");

    const log = await AuditLog.findOne({
      targetId: listing.id,
      action: "listing.title_dispute_cleared",
    });
    expect(log).not.toBeNull();
    expect(log!.metadata?.txHash).toBe("0xcleartx");

    const notif = await Notification.findOne({
      recipient: ownerId,
      "metadata.listingId": listing.id,
      title: "Title dispute cleared",
    });
    expect(notif).not.toBeNull();
  });

  it("suspend then restore changes certificate view status", async () => {
    // First mint fresh listing
    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "active",
    });
    const listing = await mintedListing();

    // Verify issued (admin view so visibility is always granted)
    let cert = await service.getCertificate(listing.id, adminId, "admin");
    expect(cert.status).toBe("issued");

    // Suspend it
    await service.disputeOnChainTitle(listing.id, "fraud", adminId, "admin");

    // Verify suspended in cert view (mock disputed; listing is now suspended — use admin)
    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "disputed",
    });
    cert = await service.getCertificate(listing.id, adminId, "admin");
    expect(cert.status).toBe("suspended");

    // Restore
    await service.clearOnChainTitleDispute(listing.id, "resolved", adminId, "admin");

    // Verify issued again (listing is published again)
    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xOwner",
      documentHash: "deadbeef",
      status: "active",
    });
    cert = await service.getCertificate(listing.id, null, null);
    expect(cert.status).toBe("issued");
  });
});

// ─── A6: Additional edge-case tests ──────────────────────────────────────────

describe("getCertificate — visibility guard", () => {
  it("throws 404 for an unpublished listing accessed anonymously", async () => {
    const doc = await service.createListing(baseInput, ownerId, "property_owner");
    // Status is 'draft' by default — not visible to anonymous users.
    await expect(service.getCertificate(doc.id, null, null)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("disputeOnChainTitle — suspend with no tokenId", () => {
  it("throws 409 when listing has no minted tokenId", async () => {
    const doc = await service.createListing(baseInput, ownerId, "property_owner");
    await Listing.findByIdAndUpdate(doc.id, {
      status: "published",
      verificationStatus: "verified",
      ownershipDocumentHash: "deadbeef",
    });
    await expect(
      service.disputeOnChainTitle(doc.id, "fraud", adminId, "admin"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("clearOnChainTitleDispute — restore with no tokenId", () => {
  it("throws 409 when listing has no minted tokenId", async () => {
    const doc = await service.createListing(baseInput, ownerId, "property_owner");
    await Listing.findByIdAndUpdate(doc.id, {
      status: "suspended",
    });
    await expect(
      service.clearOnChainTitleDispute(doc.id, "resolved", adminId, "admin"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("chainTransaction records for dispute / clear_dispute", () => {
  it("suspend writes a chainTransaction record with operation title.dispute and status mined", async () => {
    const listing = await mintedListing();

    await service.disputeOnChainTitle(listing.id, "suspected_fraud", adminId, "admin");

    const tx = await ChainTransaction.findOne({
      targetId: listing._id,
      operation: "title.dispute",
    });
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("mined");
    expect(tx!.txHash).toBe("0xdisputetx");
  });

  it("restore writes a chainTransaction record with operation title.clear_dispute and status mined", async () => {
    const listing = await mintedListing();
    await service.disputeOnChainTitle(listing.id, "suspected_fraud", adminId, "admin");

    await service.clearOnChainTitleDispute(listing.id, "case_dismissed", adminId, "admin");

    const tx = await ChainTransaction.findOne({
      targetId: listing._id,
      operation: "title.clear_dispute",
    });
    expect(tx).not.toBeNull();
    expect(tx!.status).toBe("mined");
    expect(tx!.txHash).toBe("0xcleartx");
  });
});
