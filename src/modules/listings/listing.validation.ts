import Joi from "joi";

const REJECTION_CODES = [
  "missing_document",
  "invalid_ownership_proof",
  "wrong_location",
  "poor_quality",
  "suspicious",
  "duplicate",
  "other",
] as const;

const TRANSITION_ACTIONS = [
  "submit",
  "start_review",
  "request_info",
  "approve",
  "reject",
  "publish",
  "suspend",
  "unsuspend",
  "archive",
] as const;

const coordinates = Joi.array()
  .ordered(
    Joi.number().min(-180).max(180).required(), // longitude
    Joi.number().min(-90).max(90).required(), // latitude
  )
  .length(2);

const location = Joi.object({
  type: Joi.string().valid("Point").default("Point"),
  coordinates: coordinates.required(),
});

export const createListingSchema = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(5000).allow(""),
  listingType: Joi.string().valid("sale", "rent").required(),
  category: Joi.string().valid("residential", "commercial").required(),
  price: Joi.number()
    .min(0)
    .when("listingType", {
      is: "sale",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
  monthlyRent: Joi.number()
    .min(0)
    .when("listingType", {
      is: "rent",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
  currency: Joi.string().length(3).uppercase().default("USD"),
  bedrooms: Joi.number().min(0),
  bathrooms: Joi.number().min(0),
  area: Joi.object({
    value: Joi.number().min(0).required(),
    unit: Joi.string().valid("sqm", "sqft").default("sqm"),
  }),
  address: Joi.object({
    street: Joi.string().allow(""),
    city: Joi.string().allow(""),
    region: Joi.string().allow(""),
    country: Joi.string().allow(""),
    postalCode: Joi.string().allow(""),
  }),
  location: location.required(),
  amenities: Joi.array().items(Joi.string()),
});

// PATCH: all fields optional; type-specific and location rules still apply if present.
export const updateListingSchema = createListingSchema
  .fork(["title", "listingType", "category", "location"], (s) => s.optional())
  .min(1);

export const transitionSchema = Joi.object({
  action: Joi.string()
    .valid(...TRANSITION_ACTIONS)
    .required(),
  // Required rejection code when rejecting.
  reason: Joi.string()
    .valid(...REJECTION_CODES)
    .when("action", { is: "reject", then: Joi.required() }),
  // Required free-text note when requesting info or suspending.
  note: Joi.string()
    .max(2000)
    .when("action", {
      is: Joi.valid("request_info", "suspend"),
      then: Joi.required(),
    }),
});

export const documentUploadSchema = Joi.object({
  // Property-related documents only. Identity (id/passport) belongs to KYC.
  type: Joi.string()
    .valid(
      "title_deed",
      "tax_record",
      "utility_bill",
      "ownership_certificate",
      "other",
    )
    .default("other"),
});

export const documentReviewSchema = Joi.object({
  decision: Joi.string().valid("approve", "reject").required(),
  note: Joi.string().max(2000),
});

export const discoverySchema = Joi.object({
  // Viewport (bounding box) — all four together.
  swLng: Joi.number().min(-180).max(180),
  swLat: Joi.number().min(-90).max(90),
  neLng: Joi.number().min(-180).max(180),
  neLat: Joi.number().min(-90).max(90),
  // Radius — point + distance (meters) together.
  lng: Joi.number().min(-180).max(180),
  lat: Joi.number().min(-90).max(90),
  radius: Joi.number().positive(),
  // Filters
  listingType: Joi.string().valid("sale", "rent"),
  category: Joi.string().valid("residential", "commercial"),
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  minBedrooms: Joi.number().min(0),
  minBathrooms: Joi.number().min(0),
  // Pagination
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
})
  .and("swLng", "swLat", "neLng", "neLat")
  .and("lng", "lat", "radius")
  .nand("swLng", "lng"); // cannot use both spatial modes at once

export const adminListSchema = Joi.object({
  status: Joi.string().valid(
    "draft",
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "published",
    "suspended",
    "archived",
  ),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type CreateListingInput = {
  title: string;
  description?: string;
  listingType: "sale" | "rent";
  category: "residential" | "commercial";
  price?: number;
  monthlyRent?: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: { value: number; unit: "sqm" | "sqft" };
  address?: Record<string, string>;
  location: { type: "Point"; coordinates: [number, number] };
  amenities?: string[];
};

export type TransitionAction = (typeof TRANSITION_ACTIONS)[number];
export type RejectionCode = (typeof REJECTION_CODES)[number];

export type TransitionInput = {
  action: TransitionAction;
  reason?: RejectionCode;
  note?: string;
};

export type DocumentReviewInput = {
  decision: "approve" | "reject";
  note?: string;
};

export type DiscoveryQuery = {
  swLng?: number;
  swLat?: number;
  neLng?: number;
  neLat?: number;
  lng?: number;
  lat?: number;
  radius?: number;
  listingType?: "sale" | "rent";
  category?: "residential" | "commercial";
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  page: number;
  limit: number;
};

export type AdminListQuery = {
  status?: string;
  page: number;
  limit: number;
};
