// Discovery paths: public listing search, geo endpoints, map clusters,
// owner dashboard, analytics, and yield summary.
// Aligned with listing.routes.ts, listing.service.ts, geo.routes.ts, geo.service.ts.

import { bearer, idParam, page, limit } from "../_helpers";

// ─── Reusable response schemas ──────────────────────────────────────────────────

const geocodeResultSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    location: {
      type: "object",
      properties: {
        type: { type: "string", example: "Point" },
        coordinates: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
          description: "[lng, lat]",
        },
      },
    },
    address: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Structured address fields (city, country, etc.)",
    },
    provider: { type: "string", enum: ["mock", "nominatim"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

const clusterSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "Grid cell key (e.g. '3:5')" },
    count: {
      type: "integer",
      description: "Number of listings in this cluster",
    },
    center: {
      type: "object",
      properties: {
        type: { type: "string", example: "Point" },
        coordinates: {
          type: "array",
          items: { type: "number" },
          description: "[lng, lat] — centroid of clustered listings",
        },
      },
    },
    listingIds: {
      type: "array",
      items: { type: "string" },
      description: "ObjectIds of listings in this cluster",
    },
    minPrice: { type: "number", description: "Lowest price in the cluster" },
    maxPrice: { type: "number", description: "Highest price in the cluster" },
  },
};

const neighborhoodSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    city: { type: "string" },
    country: { type: "string" },
    boundary: { type: "object", description: "GeoJSON Polygon" },
    centroid: { type: "object", description: "GeoJSON Point" },
  },
};

const neighborhoodStatSchema = {
  type: "object",
  properties: {
    city: { type: "string" },
    region: { type: "string" },
    count: { type: "integer" },
    avgPrice: { type: "number", nullable: true },
    minPrice: { type: "number", nullable: true },
    maxPrice: { type: "number", nullable: true },
    avgMonthlyRent: { type: "number", nullable: true },
    availability: {
      type: "object",
      additionalProperties: { type: "integer" },
      description:
        "Breakdown by availabilityStatus (available, rented, sold, under_offer)",
    },
  },
};

// ─── Shared parameters ──────────────────────────────────────────────────────────

const viewportParams = [
  {
    name: "swLng",
    in: "query",
    required: true,
    schema: { type: "number", minimum: -180, maximum: 180 },
    description: "Southwest longitude",
  },
  {
    name: "swLat",
    in: "query",
    required: true,
    schema: { type: "number", minimum: -90, maximum: 90 },
    description: "Southwest latitude",
  },
  {
    name: "neLng",
    in: "query",
    required: true,
    schema: { type: "number", minimum: -180, maximum: 180 },
    description: "Northeast longitude",
  },
  {
    name: "neLat",
    in: "query",
    required: true,
    schema: { type: "number", minimum: -90, maximum: 90 },
    description: "Northeast latitude",
  },
];

const commonFilters = [
  {
    name: "listingType",
    in: "query",
    schema: { type: "string", enum: ["sale", "rent"] },
  },
  {
    name: "category",
    in: "query",
    schema: { type: "string", enum: ["residential", "commercial"] },
  },
  {
    name: "propertyType",
    in: "query",
    schema: { $ref: "#/components/schemas/PropertyType" },
  },
  {
    name: "minPrice",
    in: "query",
    schema: { type: "number", minimum: 0 },
    description: "Filters both price (sale) and monthlyRent (rent)",
  },
  {
    name: "maxPrice",
    in: "query",
    schema: { type: "number", minimum: 0 },
    description: "Filters both price (sale) and monthlyRent (rent)",
  },
  { name: "verifiedOnly", in: "query", schema: { type: "boolean" } },
  {
    name: "availabilityStatus",
    in: "query",
    schema: {
      type: "string",
      enum: ["available", "under_offer", "rented", "sold"],
    },
  },
];

// ─── Path definitions ───────────────────────────────────────────────────────────

export const discoveryPaths: Record<string, unknown> = {
  // ─── Public Discovery ─────────────────────────────────────────────────────────
  "/listings": {
    get: {
      tags: ["Discovery"],
      summary: "Discover published listings",
      description:
        "Public. Choose **one** spatial mode: a viewport (swLng+swLat+neLng+neLat, all four " +
        "together), a radius (lng+lat+radius, all three together), or a drawn polygon — they " +
        "are mutually exclusive. All other filters are optional. Returns paginated results " +
        "wrapped in { items, total, page, limit }.",
      parameters: [
        {
          name: "q",
          in: "query",
          schema: { type: "string", maxLength: 200 },
          description: "Free-text search over title/description ($text index)",
        },
        // Viewport (optional group — all four together)
        {
          name: "swLng",
          in: "query",
          schema: { type: "number", minimum: -180, maximum: 180 },
          description: "Viewport SW lng (requires swLat, neLng, neLat)",
        },
        {
          name: "swLat",
          in: "query",
          schema: { type: "number", minimum: -90, maximum: 90 },
        },
        {
          name: "neLng",
          in: "query",
          schema: { type: "number", minimum: -180, maximum: 180 },
        },
        {
          name: "neLat",
          in: "query",
          schema: { type: "number", minimum: -90, maximum: 90 },
        },
        // Radius (optional group — all three together)
        {
          name: "lng",
          in: "query",
          schema: { type: "number", minimum: -180, maximum: 180 },
          description: "Center point lng (requires lat, radius)",
        },
        {
          name: "lat",
          in: "query",
          schema: { type: "number", minimum: -90, maximum: 90 },
        },
        {
          name: "radius",
          in: "query",
          schema: { type: "number", exclusiveMinimum: 0 },
          description: "Meters from the center point (requires lng, lat)",
        },
        // Polygon
        {
          name: "polygon",
          in: "query",
          schema: { type: "string" },
          description:
            "JSON-encoded ring of ≥4 [lng,lat] points, e.g. `[[13.4,52.5],[13.5,52.5],[13.5,52.6],[13.4,52.5]]`. " +
            "Mutually exclusive with viewport and radius modes.",
        },
        // Standard filters
        ...commonFilters,
        {
          name: "minBedrooms",
          in: "query",
          schema: { type: "number", minimum: 0 },
        },
        {
          name: "minBathrooms",
          in: "query",
          schema: { type: "number", minimum: 0 },
        },
        {
          name: "minArea",
          in: "query",
          schema: { type: "number", minimum: 0 },
          description: "Minimum area.value in sqm",
        },
        {
          name: "maxArea",
          in: "query",
          schema: { type: "number", minimum: 0 },
          description: "Maximum area.value in sqm",
        },
        {
          name: "amenities",
          in: "query",
          schema: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
          description:
            "Listing must include ALL specified amenities. Repeat the param or pass a single value.",
        },
        {
          name: "sort",
          in: "query",
          schema: {
            type: "string",
            enum: ["newest", "oldest", "price_asc", "price_desc"],
            default: "newest",
          },
        },
        page,
        limit,
      ],
      responses: {
        "200": {
          description: "Paginated published listings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Discovery results" },
                  data: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Listing" },
                      },
                      total: { type: "integer" },
                      page: { type: "integer" },
                      limit: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        "400": {
          description:
            "Invalid spatial mode (mixed viewport+radius+polygon) or validation error",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Map Clusters ─────────────────────────────────────────────────────────────
  "/listings/clusters": {
    get: {
      tags: ["Discovery"],
      summary: "Cluster published listings for map viewports",
      description:
        "Public. Returns geohash-based clusters within a viewport bounding box. " +
        "Cluster grid resolution adapts to the zoom level. Capped at 5,000 listings per query. " +
        "Each cluster contains a centroid, count, listing IDs, and price range.",
      parameters: [
        ...viewportParams,
        {
          name: "zoom",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 22, default: 12 },
          description: "Map zoom level — controls cluster granularity",
        },
        ...commonFilters,
      ],
      responses: {
        "200": {
          description: "Array of listing clusters",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Listing clusters",
                  },
                  data: { type: "array", items: clusterSchema },
                },
              },
            },
          },
        },
        "400": {
          description: "Missing required viewport parameters",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Neighborhood Analytics (listing-level aggregation) ───────────────────────
  "/listings/analytics/neighborhood": {
    get: {
      tags: ["Discovery"],
      summary: "Neighborhood-level listing analytics",
      description:
        "Public. Aggregates published listings grouped by city/region. Returns count, " +
        "average/min/max price, average monthly rent, and availability breakdown per city.",
      security: [{ bearerAuth: [] }, {}],
      parameters: [
        {
          name: "region",
          in: "query",
          schema: { type: "string", maxLength: 200 },
          description: "Optional region filter (matches address.region)",
        },
      ],
      responses: {
        "200": {
          description: "Array of neighborhood stats",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Neighborhood analytics",
                  },
                  data: {
                    type: "array",
                    items: neighborhoodStatSchema,
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  // ─── Owner Dashboard ──────────────────────────────────────────────────────────
  "/listings/mine": {
    get: {
      tags: ["Discovery"],
      summary: "List my listings (owner)",
      description:
        "Returns all listings created by the authenticated user, sorted by createdAt descending.",
      security: bearer,
      responses: {
        "200": {
          description: "Array of owned listings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Your listings" },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Listing" },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/dashboard": {
    get: {
      tags: ["Discovery"],
      summary: "Owner dashboard stats",
      description:
        "Aggregated stats for the authenticated property owner: total listings by status, " +
        "pending inquiry count, and per-listing analytics (views, inquiries, offers).",
      security: bearer,
      responses: {
        "200": {
          description: "Dashboard statistics",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Owner dashboard stats",
                  },
                  data: {
                    type: "object",
                    properties: {
                      total: {
                        type: "integer",
                        description: "Total owned listings",
                      },
                      byStatus: {
                        type: "object",
                        additionalProperties: { type: "integer" },
                        description:
                          "Count per status (draft, published, rented, etc.)",
                      },
                      pendingInquiries: {
                        type: "integer",
                        description: "Open inquiries awaiting response",
                      },
                      analytics: {
                        type: "object",
                        description:
                          "Per-listing event aggregates (views, inquiries, offers)",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/dashboard/yield": {
    get: {
      tags: ["Discovery"],
      summary: "Yield dashboard (owner)",
      description:
        "Portfolio-level yield rollup: active lease count, gross monthly rent, " +
        "realized revenue from completed/terminated leases, and occupancy rate.",
      security: bearer,
      responses: {
        "200": {
          description: "Yield dashboard stats",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Yield dashboard" },
                  data: {
                    type: "object",
                    properties: {
                      totalListings: { type: "integer" },
                      activeLeaseCount: { type: "integer" },
                      grossMonthlyRent: {
                        type: "number",
                        description:
                          "Sum of monthlyRent across all active leases",
                      },
                      realizedRevenue: {
                        type: "number",
                        description:
                          "Sum of monthlyRent across completed/terminated leases",
                      },
                      occupancyRate: {
                        type: "number",
                        minimum: 0,
                        maximum: 1,
                        description:
                          "rented / (published + rented). 0 if no rentable listings.",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Per-listing Analytics ────────────────────────────────────────────────────
  "/listings/{id}/analytics": {
    get: {
      tags: ["Discovery"],
      summary: "Listing-level analytics (owner)",
      description:
        "Event counts (views, inquiries, offers, rental applications) for a single listing. " +
        "Only the listing owner or admin can access.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Listing analytics",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Listing analytics" },
                  data: { type: "object" },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Geocoding ────────────────────────────────────────────────────────────────
  "/geo/geocode": {
    get: {
      tags: ["Discovery"],
      summary: "Geocode an address or place name",
      description:
        "Public. Forward geocode a text query into coordinates. Results are cached " +
        "with configurable TTL. Uses Nominatim in production, mock data in development.",
      parameters: [
        {
          name: "q",
          in: "query",
          required: true,
          schema: { type: "string", minLength: 2, maxLength: 300 },
          description: "Address or place name to geocode",
        },
      ],
      responses: {
        "200": {
          description: "Array of geocode results (up to 5)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Geocode results",
                  },
                  data: { type: "array", items: geocodeResultSchema },
                },
              },
            },
          },
        },
        "400": {
          description: "Query too short (min 2 chars)",
          $ref: "#/components/responses/Error",
        },
        "502": {
          description: "Upstream geocoder request failed",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/geo/reverse": {
    get: {
      tags: ["Discovery"],
      summary: "Reverse geocode coordinates",
      description:
        "Public. Reverse geocode a lat/lng pair into an address. Results are cached.",
      parameters: [
        {
          name: "lat",
          in: "query",
          required: true,
          schema: { type: "number", minimum: -90, maximum: 90 },
        },
        {
          name: "lng",
          in: "query",
          required: true,
          schema: { type: "number", minimum: -180, maximum: 180 },
        },
      ],
      responses: {
        "200": {
          description: "Single geocode result",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Reverse geocode result",
                  },
                  data: geocodeResultSchema,
                },
              },
            },
          },
        },
        "400": {
          description: "Missing lat or lng",
          $ref: "#/components/responses/Error",
        },
        "502": {
          description: "Upstream geocoder request failed",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Neighborhoods (geo module) ───────────────────────────────────────────────
  "/geo/neighborhoods": {
    get: {
      tags: ["Discovery"],
      summary: "List neighborhoods",
      description:
        "Public. Paginated list of seeded neighborhoods. Filterable by city, country, " +
        "or free-text search on name. Sorted by name ascending.",
      parameters: [
        {
          name: "city",
          in: "query",
          schema: { type: "string", maxLength: 120 },
          description: "Case-insensitive city filter (regex match)",
        },
        {
          name: "country",
          in: "query",
          schema: { type: "string", maxLength: 120 },
          description: "Case-insensitive country filter (regex match)",
        },
        {
          name: "q",
          in: "query",
          schema: { type: "string", maxLength: 120 },
          description: "Free-text search on neighborhood name",
        },
        page,
        {
          ...limit,
          schema: { type: "integer", default: 50, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        "200": {
          description: "Paginated neighborhoods",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Neighborhoods" },
                  data: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: neighborhoodSchema,
                      },
                      total: { type: "integer" },
                      page: { type: "integer" },
                      limit: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/geo/neighborhoods/{id}/analytics": {
    get: {
      tags: ["Discovery"],
      summary: "Neighborhood listing and lead analytics",
      description:
        "Public. Returns aggregated listing stats within a neighborhood's boundary: " +
        "listing counts by type, average prices, availability breakdown, lead event counts " +
        "(inquiries, offers, rental applications), and nearby POIs (max 25, within 3km).",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Neighborhood analytics",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Neighborhood analytics",
                  },
                  data: {
                    type: "object",
                    properties: {
                      neighborhood: neighborhoodSchema,
                      listings: {
                        type: "array",
                        description:
                          "Aggregation by listingType: [{ _id: 'sale'|'rent', count, avgPrice, avgRent }]",
                        items: {
                          type: "object",
                          properties: {
                            _id: { type: "string" },
                            count: { type: "integer" },
                            avgPrice: { type: "number" },
                            avgRent: { type: "number" },
                          },
                        },
                      },
                      availability: {
                        type: "array",
                        description:
                          "Aggregation by availabilityStatus: [{ _id: 'available'|'rented', count }]",
                        items: {
                          type: "object",
                          properties: {
                            _id: { type: "string" },
                            count: { type: "integer" },
                          },
                        },
                      },
                      leads: {
                        type: "array",
                        description:
                          "Lead events: [{ _id: 'inquiry'|'offer'|'rental_application', count }]",
                        items: {
                          type: "object",
                          properties: {
                            _id: { type: "string" },
                            count: { type: "integer" },
                          },
                        },
                      },
                      poiCount: { type: "integer" },
                      pois: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            category: { type: "string" },
                            location: {
                              type: "object",
                              properties: {
                                type: { type: "string" },
                                coordinates: {
                                  type: "array",
                                  items: { type: "number" },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "404": {
          description: "Neighborhood not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
};
