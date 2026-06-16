import mongoose from "mongoose";
import * as inquiries from "../src/modules/inquiries/inquiry.service";
import * as listings from "../src/modules/listings/listing.service";
import { Listing } from "../src/modules/listings/listing.model";
import { AppError } from "../src/core/utils/AppError";
import type { CreateListingInput } from "../src/modules/listings/listing.validation";

const ownerId = new mongoose.Types.ObjectId().toString();
const tenantId = new mongoose.Types.ObjectId().toString();
const strangerId = new mongoose.Types.ObjectId().toString();

const input: CreateListingInput = {
  title: "Flat",
  listingType: "rent",
  category: "residential",
  propertyType: "apartment",
  monthlyRent: 1000,
  currency: "USD",
  location: { type: "Point", coordinates: [13.4, 52.5] },
};

const publishedListing = async () => {
  const doc = await listings.createListing(input, ownerId, "property_owner");
  await Listing.findByIdAndUpdate(doc.id, { status: "published" });
  return doc;
};

describe("inquiries.service", () => {
  it("creates an inquiry against a published listing, denormalizing the owner", async () => {
    const doc = await publishedListing();
    const inq = await inquiries.createInquiry(tenantId, "tenant", {
      listingId: doc.id,
      message: "Is this still available?",
    });
    expect(inq.inquirer.toString()).toBe(tenantId);
    expect(inq.listingOwner.toString()).toBe(ownerId);
    expect(inq.status).toBe("open");
  });

  it("refuses an inquiry on a non-published listing", async () => {
    const draft = await listings.createListing(input, ownerId, "property_owner");
    await expect(
      inquiries.createInquiry(tenantId, "tenant", {
        listingId: draft.id,
        message: "hi",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("separates sent and received inquiries", async () => {
    const doc = await publishedListing();
    await inquiries.createInquiry(tenantId, "tenant", {
      listingId: doc.id,
      message: "interested",
    });
    expect(await inquiries.listSent(tenantId)).toHaveLength(1);
    expect(await inquiries.listReceived(ownerId)).toHaveLength(1);
    expect(await inquiries.listReceived(tenantId)).toHaveLength(0);
  });

  it("lets the listing owner respond and marks it responded", async () => {
    const doc = await publishedListing();
    const inq = await inquiries.createInquiry(tenantId, "tenant", {
      listingId: doc.id,
      message: "interested",
    });
    const updated = await inquiries.updateInquiry(inq.id, ownerId, "property_owner", {
      response: "Yes, still available!",
    });
    expect(updated.status).toBe("responded");
    expect(updated.response).toBe("Yes, still available!");
  });

  it("forbids a stranger from managing an inquiry", async () => {
    const doc = await publishedListing();
    const inq = await inquiries.createInquiry(tenantId, "tenant", {
      listingId: doc.id,
      message: "interested",
    });
    await expect(
      inquiries.updateInquiry(inq.id, strangerId, "property_owner", {
        status: "closed",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
