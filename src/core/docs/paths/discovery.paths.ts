// Discovery paths: public listing search, geo endpoints, map clusters.

import { envelope, ok, idParam } from "../_helpers";

export const discoveryPaths: Record<string, unknown> = {
  "/listings": {
    get: {
      tags: ["Discovery"],
      summary: "Discover published listings",
      description:
        "Public. Choose **one** spatial mode: a viewport (swLng+swLat+neLng+neLat, all four " +
        "together), a radius (lng+lat+radius, all three together), or a drawn polygon — they " +
        "are mutually exclusive. All other filters are optional. Returns paginated results.",
      parameters: [
        {
          name: "q",
          in: "query",
          schema: { type: "string", maxLength: 200 },
          description: "Free-text search over title/description",
        },
        {
          name: "swLng",
          in: "query",
          schema: { type: "number", minimum: -180, maximum: 180 },
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
        {
          name: "lng",
          in: "query",
          schema: { type: "number", minimum: -180, maximum: 180 },
        },
        {
          name: "lat",
          in: "query",
          schema: { type: "number", minimum: -90, maximum: 90 },
        },
        {
          name: "radius",
          in: "query",
          schema: { type: "number" },
          description: "Meters from the point (use with lng+lat)",
        },
        {
          name: "polygon",
          in: "query",
          schema: { type: "string" },
          description:
            "JSON-encoded ring of ≥4 [lng,lat] points, e.g. `[[13.4,52.5],[13.5,52.5],[13.5,52.6],[13.4,52.5]]`",
        },
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
        },
        {
          name: "maxPrice",
          in: "query",
          schema: { type: "number", minimum: 0 },
        },
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
        },
        {
          name: "maxArea",
          in: "query",
          schema: { type: "number", minimum: 0 },
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
        {
          name: "amenities",
          in: "query",
          schema: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
          description: "Repeat the param or pass a single value",
        },
        {
          name: "sort",
          in: "query",
          schema: {
            type: "string",
            enum: ["newest", "oldest", "price_asc", "price_desc"],
          },
        },
        {
          name: "page",
          in: "query",
          schema: { type: "integer", default: 1, minimum: 1 },
        },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        "200": {
          description: "Paginated published listings",
          content: {
            "application/json": {
              schema: envelope(),
            },
          },
        },
      },
    },
  },
  "/geo/geocode": {
    get: {
      tags: ["Discovery"],
      summary: "Geocode an address or place name",
      parameters: [
        {
          name: "q",
          in: "query",
          required: true,
          schema: { type: "string", minLength: 2 },
        },
      ],
      responses: ok("Geocode results"),
    },
  },
  "/geo/reverse": {
    get: {
      tags: ["Discovery"],
      summary: "Reverse geocode coordinates",
      parameters: [
        {
          name: "lat",
          in: "query",
          required: true,
          schema: { type: "number" },
        },
        {
          name: "lng",
          in: "query",
          required: true,
          schema: { type: "number" },
        },
      ],
      responses: ok("Reverse geocode result"),
    },
  },
  "/geo/neighborhoods": {
    get: {
      tags: ["Discovery"],
      summary: "List seedable neighborhoods",
      parameters: [
        { name: "city", in: "query", schema: { type: "string" } },
        { name: "country", in: "query", schema: { type: "string" } },
      ],
      responses: ok("Neighborhoods"),
    },
  },
  "/geo/neighborhoods/{id}/analytics": {
    get: {
      tags: ["Discovery"],
      summary: "Neighborhood listing and lead analytics",
      parameters: [idParam],
      responses: ok("Neighborhood analytics"),
    },
  },
  "/listings/clusters": {
    get: {
      tags: ["Discovery"],
      summary: "Cluster published listings for map viewports",
      description:
        "Returns geohash-based clusters within the viewport. Optional filters narrow the result set.",
      parameters: [
        {
          name: "swLng",
          in: "query",
          required: true,
          schema: { type: "number", minimum: -180, maximum: 180 },
        },
        {
          name: "swLat",
          in: "query",
          required: true,
          schema: { type: "number", minimum: -90, maximum: 90 },
        },
        {
          name: "neLng",
          in: "query",
          required: true,
          schema: { type: "number", minimum: -180, maximum: 180 },
        },
        {
          name: "neLat",
          in: "query",
          required: true,
          schema: { type: "number", minimum: -90, maximum: 90 },
        },
        {
          name: "zoom",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 22, default: 12 },
        },
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
        },
        {
          name: "maxPrice",
          in: "query",
          schema: { type: "number", minimum: 0 },
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
      ],
      responses: ok("Map clusters"),
    },
  },
};
