import Joi from "joi";

const PROPERTY_TYPES = [
  "apartment", "house", "villa", "condominium", "land",
  "commercial_space", "office", "warehouse", "shop", "mixed_use",
] as const;

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
  "mark_rented",
  "mark_sold",
  "unmark_rented",
  "unmark_sold",
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

const polygon = Joi.string().custom((value, helpers) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length < 4 ||
      !parsed.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          typeof point[0] === "number" &&
          typeof point[1] === "number" &&
          point[0] >= -180 &&
          point[0] <= 180 &&
          point[1] >= -90 &&
          point[1] <= 90,
      )
    ) {
      return helpers.error("any.invalid");
    }
    return parsed;
  } catch {
    return helpers.error("any.invalid");
  }
}, "polygon parser");

export const createListingSchema = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(5000).allow(""),
  listingType: Joi.string().valid("sale", "rent").required(),
  category: Joi.string().valid("residential", "commercial").required(),
  propertyType: Joi.string().valid(...PROPERTY_TYPES).required(),
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
  yearBuilt: Joi.number().integer().min(1800).max(2100),
  floorNumber: Joi.number().integer().min(0),
  parkingSpaces: Joi.number().integer().min(0),
  totalFloors: Joi.number().integer().min(0),
  maintenanceFee: Joi.number().min(0),
  serviceCharge: Joi.number().min(0),
  utilityDetails: Joi.string().max(2000).allow(""),
  neighborhoodInfo: Joi.string().max(2000).allow(""),
  furnishingStatus: Joi.string().valid("furnished", "semi_furnished", "unfurnished"),
  nearbyLandmarks: Joi.array().items(Joi.string().max(200)),
  rentalTerms: Joi.string().max(5000).allow(""),
  saleTerms: Joi.string().max(5000).allow(""),
  legalNotes: Joi.string().max(5000).allow(""),
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
  .fork(["title", "listingType", "category", "propertyType", "location"], (s) => s.optional())
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
      "lease_authority",
      "government_document",
      "other",
    )
    .default("other"),
});

export const documentReviewSchema = Joi.object({
  decision: Joi.string().valid("approve", "reject").required(),
  note: Joi.string().max(2000),
});

export const photoReorderSchema = Joi.object({
  order: Joi.array().items(Joi.string().required()).min(1).required(),
});

export const setCoverSchema = Joi.object({
  publicId: Joi.string().required(),
});

export const titleActionSchema = Joi.object({
  reason: Joi.string().max(2000).required(),
});

export const discoverySchema = Joi.object({
  // Text search
  q: Joi.string().max(200).allow(""),
  // Viewport (bounding box) — all four together.
  swLng: Joi.number().min(-180).max(180),
  swLat: Joi.number().min(-90).max(90),
  neLng: Joi.number().min(-180).max(180),
  neLat: Joi.number().min(-90).max(90),
  // Radius — point + distance (meters) together.
  lng: Joi.number().min(-180).max(180),
  lat: Joi.number().min(-90).max(90),
  radius: Joi.number().positive(),
  // Custom drawn boundary as JSON: [[lng,lat],[lng,lat],...].
  polygon,
  // Filters
  listingType: Joi.string().valid("sale", "rent"),
  category: Joi.string().valid("residential", "commercial"),
  propertyType: Joi.string().valid(...PROPERTY_TYPES),
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  minBedrooms: Joi.number().min(0),
  minBathrooms: Joi.number().min(0),
  minArea: Joi.number().min(0),
  maxArea: Joi.number().min(0),
  verifiedOnly: Joi.boolean(),
  availabilityStatus: Joi.string().valid("available", "under_offer", "rented", "sold"),
  amenities: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.string(), // single value from query string
  ),
  // Sorting
  sort: Joi.string().valid("newest", "oldest", "price_asc", "price_desc"),
  // Pagination
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
})
  .and("swLng", "swLat", "neLng", "neLat")
  .and("lng", "lat", "radius")
  .oxor("swLng", "lng", "polygon"); // cannot use multiple spatial modes

export const adminListSchema = Joi.object({
  status: Joi.string().valid(
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
  ),
  verificationStatus: Joi.string().valid(
    "unverified", "pending", "requires_more_info", "verified", "rejected", "suspended",
  ),
  propertyType: Joi.string().valid(...PROPERTY_TYPES),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type CreateListingInput = {
  title: string;
  description?: string;
  listingType: "sale" | "rent";
  category: "residential" | "commercial";
  propertyType: string;
  price?: number;
  monthlyRent?: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: { value: number; unit: "sqm" | "sqft" };
  yearBuilt?: number;
  floorNumber?: number;
  parkingSpaces?: number;
  totalFloors?: number;
  maintenanceFee?: number;
  serviceCharge?: number;
  utilityDetails?: string;
  neighborhoodInfo?: string;
  furnishingStatus?: "furnished" | "semi_furnished" | "unfurnished";
  nearbyLandmarks?: string[];
  rentalTerms?: string;
  saleTerms?: string;
  legalNotes?: string;
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
  q?: string;
  swLng?: number;
  swLat?: number;
  neLng?: number;
  neLat?: number;
  lng?: number;
  lat?: number;
  radius?: number;
  polygon?: [number, number][];
  listingType?: "sale" | "rent";
  category?: "residential" | "commercial";
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minArea?: number;
  maxArea?: number;
  verifiedOnly?: boolean;
  availabilityStatus?: "available" | "under_offer" | "rented" | "sold";
  amenities?: string | string[];
  sort?: "newest" | "oldest" | "price_asc" | "price_desc";
  page: number;
  limit: number;
};

export type AdminListQuery = {
  status?: string;
  verificationStatus?: string;
  propertyType?: string;
  page: number;
  limit: number;
};
