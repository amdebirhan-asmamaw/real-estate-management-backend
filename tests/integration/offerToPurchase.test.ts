// ── Mock the chain layer BEFORE any application imports ──────────────────────
jest.mock("../../src/core/blockchain/saleEscrow.service", () => ({
  openAndFundEscrow: jest.fn(async () => ({ escrowId: "1", txHash: "0xfund" })),
  releaseEscrow: jest.fn(async () => ({ txHash: "0xrelease" })),
  refundEscrow: jest.fn(async () => ({ txHash: "0xrefund" })),
  getEscrow: jest.fn(async () => ({ state: "funded" })),
  isConfigured: () => true,
  toBaseUnits: jest.fn(async (amount: number) => BigInt(amount) * BigInt(10 ** 18)),
}));

// Title transfer on sale completion is orchestrated by the backend on release.
jest.mock("../../src/core/blockchain/propertyTitle.service", () => ({
  transferTitle: jest.fn(async () => ({ txHash: "0xtitle" })),
  isConfigured: () => true,
}));

import {
  seedVerifiedUserWithWallet,
  seedUser,
  seedPublishedSaleListing,
} from "./_helpers";
import { Listing } from "../../src/modules/listings/listing.model";
import { PurchaseTransaction } from "../../src/modules/purchaseTransactions/purchaseTransaction.model";
import { AppError } from "../../src/core/utils/AppError";
import * as offerService from "../../src/modules/offers/offer.service";
import * as purchaseService from "../../src/modules/purchaseTransactions/purchaseTransaction.service";

// DB harness (connect / clear / disconnect) is provided by tests/setup.ts
// which is registered as setupFilesAfterEnv in jest.config.js.

describe("integration: offer → purchase transaction lifecycle", () => {
  it("happy path: buyer submits offer → seller accepts → admin funds → admin releases → completed", async () => {
    const chain = require("../../src/core/blockchain/saleEscrow.service");

    // ── seed actors ──────────────────────────────────────────────────────────
    const seller = await seedVerifiedUserWithWallet("property_owner");
    const buyer = await seedVerifiedUserWithWallet("tenant");
    const admin = await seedUser({ role: "admin" });
    const listing = await seedPublishedSaleListing(seller.id, "verified");

    // ── buyer submits offer ───────────────────────────────────────────────────
    const offer = await offerService.createOffer(buyer.id, "tenant", {
      listingId: listing.id,
      amount: 250000,
      currency: "USD",
    });
    expect(offer.status).toBe("submitted");

    // ── seller accepts offer → spawns purchase transaction ────────────────────
    const acceptedOffer = await offerService.respond(
      offer.id,
      seller.id,
      "property_owner",
      { action: "accept" },
    );
    expect(acceptedOffer.status).toBe("accepted");

    // purchase transaction was created automatically via accept
    const pt = await PurchaseTransaction.findOne({ offer: offer.id });
    expect(pt).toBeTruthy();
    expect(pt!.status).toBe("offer_accepted");

    // ── admin funds escrow (KYC + wallet + verified listing gates pass) ────────
    const funded = await purchaseService.fund(pt!.id, admin.id, "admin");
    expect(funded.escrow.state).toBe("funded");
    expect(funded.escrow.escrowId).toBe("1");
    expect(funded.status).toBe("deposit_received");
    expect(chain.openAndFundEscrow).toHaveBeenCalled();

    // ── a minted title must exist before a sale can complete + transfer ───────
    await Listing.findByIdAndUpdate(listing.id, {
      tokenId: "1",
      contractAddress: "0xtitlecontract",
    });

    // ── admin releases escrow → completed (funds to seller + title to buyer) ───
    const titleChain = require("../../src/core/blockchain/propertyTitle.service");
    const released = await purchaseService.release(pt!.id, admin.id, "admin");
    expect(released.status).toBe("completed");
    expect(released.escrow.state).toBe("released");
    expect(released.escrow.settleTxHash).toBe("0xrelease");
    expect(chain.releaseEscrow).toHaveBeenCalledWith("1");
    // title transferred to the buyer's wallet on completion
    expect(titleChain.transferTitle).toHaveBeenCalledWith("1", buyer.walletAddress);
    expect(released.titleTransferTxHash).toBe("0xtitle");
  });

  it("negative: fund fails when buyer has no wallet address", async () => {
    const seller = await seedVerifiedUserWithWallet("property_owner");
    // buyer has no wallet
    const buyerNoWallet = await seedUser({ role: "tenant", kycStatus: "verified" });
    const admin = await seedUser({ role: "admin" });
    const listing = await seedPublishedSaleListing(seller.id, "verified");

    const offer = await offerService.createOffer(buyerNoWallet.id, "tenant", {
      listingId: listing.id,
      amount: 250000,
      currency: "USD",
    });

    const acceptedOffer = await offerService.respond(
      offer.id,
      seller.id,
      "property_owner",
      { action: "accept" },
    );
    expect(acceptedOffer.status).toBe("accepted");

    const pt = await PurchaseTransaction.findOne({ offer: offer.id });
    expect(pt).toBeTruthy();

    await expect(
      purchaseService.fund(pt!.id, admin.id, "admin"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
