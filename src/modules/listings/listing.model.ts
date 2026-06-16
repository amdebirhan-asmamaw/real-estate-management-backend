import { Schema, model, Document, Types } from "mongoose";

export type ListingType = "sale" | "rent";
export type ListingCategory = "residential" | "commercial";
export type PropertyType =
  | "apartment"
  | "house"
  | "villa"
  | "condominium"
  | "land"
  | "commercial_space"
  | "office"
  | "warehouse"
  | "shop"
  | "mixed_use";

export type AvailabilityStatus = "available" | "under_offer" | "rented" | "sold";
export type FurnishingStatus = "furnished" | "semi_furnished" | "unfurnished";

export type ListingStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "published"
  | "suspended"
  | "rented"
  | "sold"
  | "archived";

export type VerificationStatus =
  | "unverified"
  | "pending"
  | "requires_more_info"
  | "verified"
  | "rejected"
  | "suspended";

export type DocumentType =
  | "title_deed"
  | "tax_record"
  | "utility_bill"
  | "ownership_certificate"
  | "lease_authority"
  | "government_document"
  | "other";
export type DocumentStatus = "pending" | "approved" | "rejected";

export type RejectionCode =
  | "missing_document"
  | "invalid_ownership_proof"
  | "wrong_location"
  | "poor_quality"
  | "suspicious"
  | "duplicate"
  | "other";

export interface IPhoto {
  url: string;
  publicId: string;
  isCover?: boolean;
}

export interface IOwnershipDocument {
  _id: Types.ObjectId;
  type: DocumentType;
  publicId: string; // Cloudinary "authenticated" resource id — server-side only
  hash: string; // sha256 of the uploaded file (prepared for on-chain anchoring)
  status: DocumentStatus;
  reviewNote?: string;
  uploadedAt: Date;
}

export interface IListing extends Document {
  title: string;
  description?: string;
  listingType: ListingType;
  category: ListingCategory;
  propertyType: PropertyType;
  status: ListingStatus;
  price?: number;
  monthlyRent?: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: { value: number; unit: "sqm" | "sqft" };
  yearBuilt?: number;
  floorNumber?: number;
  parkingSpaces?: number;
  furnishingStatus?: FurnishingStatus;
  nearbyLandmarks?: string[];
  rentalTerms?: string;
  saleTerms?: string;
  legalNotes?: string;
  availabilityStatus: AvailabilityStatus;
  address: {
    street?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  location: { type: "Point"; coordinates: [number, number] };
  amenities: string[];
  photos: IPhoto[];
  documents: Types.DocumentArray<IOwnershipDocument>;
  review: {
    rejectionReason?: { code: RejectionCode; note?: string };
    reviewNote?: string;
    reviewedBy?: Types.ObjectId;
    reviewedAt?: Date;
  };
  // Blockchain-ready metadata (populated in Increment 2).
  verificationStatus: VerificationStatus;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  ownershipDocumentHash?: string;
  blockchainTxHash?: string;
  titleCertificateId?: string;
  contractAddress?: string;
  tokenId?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const photoSchema = new Schema<IPhoto>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    isCover: { type: Boolean, default: false },
  },
  { _id: false },
);

const documentSchema = new Schema<IOwnershipDocument>({
  type: {
    type: String,
    enum: [
      "title_deed",
      "tax_record",
      "utility_bill",
      "ownership_certificate",
      "lease_authority",
      "government_document",
      "other",
    ],
    required: true,
  },
  publicId: { type: String, required: true },
  hash: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  reviewNote: String,
  uploadedAt: { type: Date, default: () => new Date() },
});

const listingSchema = new Schema<IListing>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 5000 },
    listingType: { type: String, enum: ["sale", "rent"], required: true },
    category: {
      type: String,
      enum: ["residential", "commercial"],
      required: true,
    },
    propertyType: {
      type: String,
      enum: [
        "apartment", "house", "villa", "condominium", "land",
        "commercial_space", "office", "warehouse", "shop", "mixed_use",
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "published",
        "suspended",
        "rented",
        "sold",
        "archived",
      ],
      default: "draft",
      index: true,
    },
    price: { type: Number, min: 0 },
    monthlyRent: { type: Number, min: 0 },
    currency: { type: String, default: "USD", uppercase: true },
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    area: {
      value: { type: Number, min: 0 },
      unit: { type: String, enum: ["sqm", "sqft"], default: "sqm" },
    },
    yearBuilt: { type: Number, min: 1800, max: 2100 },
    floorNumber: { type: Number, min: 0 },
    parkingSpaces: { type: Number, min: 0 },
    furnishingStatus: {
      type: String,
      enum: ["furnished", "semi_furnished", "unfurnished"],
    },
    nearbyLandmarks: { type: [String], default: [] },
    rentalTerms: { type: String, maxlength: 5000 },
    saleTerms: { type: String, maxlength: 5000 },
    legalNotes: { type: String, maxlength: 5000 },
    availabilityStatus: {
      type: String,
      enum: ["available", "under_offer", "rented", "sold"],
      default: "available",
    },
    address: {
      street: String,
      city: String,
      region: String,
      country: String,
      postalCode: String,
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: (v: number[]) =>
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] >= -180 &&
            v[0] <= 180 &&
            v[1] >= -90 &&
            v[1] <= 90,
          message:
            "coordinates must be [longitude (-180..180), latitude (-90..90)]",
        },
      },
    },
    amenities: { type: [String], default: [] },
    photos: { type: [photoSchema], default: [] },
    documents: { type: [documentSchema], default: [] },
    review: {
      rejectionReason: {
        code: {
          type: String,
          enum: [
            "missing_document",
            "invalid_ownership_proof",
            "wrong_location",
            "poor_quality",
            "suspicious",
            "duplicate",
            "other",
          ],
        },
        note: String,
      },
      reviewNote: String,
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "pending", "requires_more_info", "verified", "rejected", "suspended"],
      default: "unverified",
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    verifiedAt: Date,
    ownershipDocumentHash: String,
    blockchainTxHash: String,
    titleCertificateId: String,
    contractAddress: String,
    tokenId: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        // Private ownership documents are never part of a listing's JSON.
        // They are served only through the dedicated, authz-gated endpoints.
        delete ret.documents;
        delete ret._id;
        return ret;
      },
    },
  },
);

listingSchema.index({ location: "2dsphere" });
listingSchema.index({ title: "text", description: "text" });

export const Listing = model<IListing>("Listing", listingSchema);
