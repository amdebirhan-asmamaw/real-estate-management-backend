jest.mock("../src/core/blockchain/propertyTitle.service", () => ({
  isConfigured: () => true,
  mintTitle: jest.fn().mockResolvedValue({
    tokenId: "7",
    txHash: "0xtx",
    contractAddress: "0xContract",
    owner: "0xMinter",
  }),
  getTitle: jest.fn(),
}));

import mongoose from "mongoose";
import * as service from "../src/modules/listings/listing.service";
import * as chain from "../src/core/blockchain/propertyTitle.service";
import { Listing } from "../src/modules/listings/listing.model";
import { AuditLog } from "../src/modules/audit/audit.model";
import { ChainTransaction } from "../src/modules/chainTransactions/chainTransaction.model";
import { AppError } from "../src/core/utils/AppError";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const adminId = new mongoose.Types.ObjectId().toString();

const input: CreateListingInput = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  monthlyRent: 1000,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

// A verified, published listing ready to mint.
const verifiedListing = async () => {
  const doc = await service.createListing(input, ownerId, "property_owner");
  await Listing.findByIdAndUpdate(doc.id, {
    status: "published",
    verificationStatus: "verified",
    ownershipDocumentHash: "deadbeef",
  });
  return doc;
};

describe("listing title minting", () => {
  it("refuses to mint when the listing is not verified", async () => {
    const doc = await service.createListing(input, ownerId, "property_owner");
    await expect(
      service.mintTitle(doc.id, adminId, "admin"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("forbids a non-admin from minting", async () => {
    const doc = await verifiedListing();
    await expect(
      service.mintTitle(doc.id, ownerId, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("mints, records the token metadata, and writes an audit entry", async () => {
    const doc = await verifiedListing();
    const minted = await service.mintTitle(doc.id, adminId, "admin");
    expect(minted.tokenId).toBe("7");
    expect(minted.blockchainTxHash).toBe("0xtx");
    expect(minted.contractAddress).toBe("0xContract");
    expect(minted.titleCertificateId).toBe("PTITLE-7");

    const logs = await AuditLog.find({
      targetId: doc.id,
      action: "listing.title_minted",
    });
    expect(logs).toHaveLength(1);

    const tx = await ChainTransaction.findOne({
      targetType: "listing",
      targetId: doc.id,
      operation: "title.mint",
    });
    expect(tx?.status).toBe("mined");
    expect(tx?.txHash).toBe("0xtx");
  });

  it("refuses to mint twice", async () => {
    const doc = await verifiedListing();
    await service.mintTitle(doc.id, adminId, "admin");
    await expect(
      service.mintTitle(doc.id, adminId, "admin"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("verifies on-chain vs off-chain hash through getTitleInfo", async () => {
    const doc = await verifiedListing();
    await service.mintTitle(doc.id, adminId, "admin");

    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xMinter",
      documentHash: "deadbeef",
      status: "active",
    });
    const info = await service.getTitleInfo(doc.id, null, null);
    expect(info.tokenId).toBe("7");
    expect(info.verified).toBe(true);
    expect(info.status).toBe("active");

    (chain.getTitle as jest.Mock).mockResolvedValueOnce({
      owner: "0xMinter",
      documentHash: "tampered",
      status: "disputed",
    });
    const tampered = await service.getTitleInfo(doc.id, null, null);
    expect(tampered.verified).toBe(false);
  });
});
