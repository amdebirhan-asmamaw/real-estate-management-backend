/**
 * Task 5a: partial unique index on offers.
 *
 * A buyer may have at most one active (submitted/countered) offer per listing.
 * Terminal offers (accepted/rejected/cancelled) do not block a new submission.
 */

import { Types } from "mongoose";
import { Offer } from "../src/modules/offers/offer.model";

// Force index creation on the in-memory database before any test runs.
// MongoMemoryServer starts empty; Mongoose only syncs indexes at startup
// (when `autoIndex: true`, the default) or when explicitly requested.
beforeAll(async () => {
  await Offer.syncIndexes();
});

const listingId = () => new Types.ObjectId();
const buyerId = () => new Types.ObjectId();
const ownerId = () => new Types.ObjectId();

const makeOffer = (
  listing: Types.ObjectId,
  buyer: Types.ObjectId,
  status: "submitted" | "countered" | "accepted" | "rejected" | "cancelled" = "submitted",
) =>
  Offer.create({
    listing,
    buyer,
    listingOwner: ownerId(),
    amount: 100_000,
    currency: "USD",
    status,
  });

describe("offer partial unique index (active offers per buyer per listing)", () => {
  it("allows a single submitted offer from a buyer on a listing", async () => {
    const listing = listingId();
    const buyer = buyerId();
    await expect(makeOffer(listing, buyer, "submitted")).resolves.toBeDefined();
  });

  it("rejects a second submitted offer from the same buyer on the same listing", async () => {
    const listing = listingId();
    const buyer = buyerId();

    await makeOffer(listing, buyer, "submitted");

    await expect(makeOffer(listing, buyer, "submitted")).rejects.toMatchObject({
      code: 11000, // MongoDB duplicate-key error
    });
  });

  it("rejects a submitted offer when a countered offer already exists", async () => {
    const listing = listingId();
    const buyer = buyerId();

    await makeOffer(listing, buyer, "countered");

    await expect(makeOffer(listing, buyer, "submitted")).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("allows a new submitted offer after previous one was cancelled (terminal status)", async () => {
    const listing = listingId();
    const buyer = buyerId();

    const first = await makeOffer(listing, buyer, "submitted");
    // Move first to cancelled (terminal) — no longer blocks a second offer.
    await Offer.findByIdAndUpdate(first._id, { status: "cancelled" });

    await expect(makeOffer(listing, buyer, "submitted")).resolves.toBeDefined();
  });

  it("allows a different buyer to submit an offer on the same listing", async () => {
    const listing = listingId();

    await makeOffer(listing, buyerId(), "submitted");
    await expect(makeOffer(listing, buyerId(), "submitted")).resolves.toBeDefined();
  });

  it("allows the same buyer to submit offers on different listings", async () => {
    const buyer = buyerId();

    await makeOffer(listingId(), buyer, "submitted");
    await expect(makeOffer(listingId(), buyer, "submitted")).resolves.toBeDefined();
  });
});
