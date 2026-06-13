import mongoose from "mongoose";
import * as service from "../src/modules/listings/listing.service";
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

const newListing = () => service.createListing(input, ownerId, "property_owner");

describe("photos", () => {
  it("adds photos to a listing", async () => {
    const doc = await newListing();
    const updated = await service.addPhotos(
      doc.id,
      [{ url: "https://cdn/a.jpg", publicId: "a" }],
      ownerId,
      "property_owner",
    );
    expect(updated.photos).toHaveLength(1);
  });

  it("removes a photo and returns its publicId for remote cleanup", async () => {
    const doc = await newListing();
    await service.addPhotos(
      doc.id,
      [{ url: "https://cdn/a.jpg", publicId: "a" }],
      ownerId,
      "property_owner",
    );
    const { listing, publicId } = await service.removePhoto(
      doc.id,
      "a",
      ownerId,
      "property_owner",
    );
    expect(publicId).toBe("a");
    expect(listing.photos).toHaveLength(0);
  });

  it("404s when removing a photo that isn't on the listing", async () => {
    const doc = await newListing();
    await expect(
      service.removePhoto(doc.id, "missing", ownerId, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("ownership documents", () => {
  it("adds private documents and marks verification pending", async () => {
    const doc = await newListing();
    const updated = await service.addDocuments(
      doc.id,
      [{ type: "title_deed", publicId: "secret/x", hash: "abc123" }],
      ownerId,
      "property_owner",
    );
    expect(updated.documents).toHaveLength(1);
    expect(updated.verificationStatus).toBe("pending");
  });

  it("lists documents without exposing the cloudinary publicId", async () => {
    const doc = await newListing();
    await service.addDocuments(
      doc.id,
      [{ type: "title_deed", publicId: "secret/x", hash: "abc123" }],
      ownerId,
      "property_owner",
    );
    const docs = await service.listDocuments(doc.id, ownerId, "property_owner");
    expect(docs[0]).not.toHaveProperty("publicId");
    expect(docs[0].hash).toBe("abc123");
  });

  it("blocks a non-admin from reviewing a document", async () => {
    const doc = await newListing();
    const withDoc = await service.addDocuments(
      doc.id,
      [{ type: "title_deed", publicId: "secret/x", hash: "abc123" }],
      ownerId,
      "property_owner",
    );
    const docId = withDoc.documents[0]._id.toString();
    await expect(
      service.reviewDocument(doc.id, docId, "approve", undefined, ownerId, "property_owner"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("verifies the listing and captures the hash when admin approves the title deed", async () => {
    const doc = await newListing();
    const withDoc = await service.addDocuments(
      doc.id,
      [{ type: "title_deed", publicId: "secret/x", hash: "abc123" }],
      ownerId,
      "property_owner",
    );
    const docId = withDoc.documents[0]._id.toString();
    const reviewed = await service.reviewDocument(
      doc.id,
      docId,
      "approve",
      "Looks good",
      adminId,
      "admin",
    );
    expect(reviewed.verificationStatus).toBe("verified");
    expect(reviewed.ownershipDocumentHash).toBe("abc123");
    expect(reviewed.documents[0].status).toBe("approved");
  });
});
