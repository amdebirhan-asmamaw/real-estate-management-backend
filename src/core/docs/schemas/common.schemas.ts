// Common/shared schemas: ErrorResponse, TitleInfo, SavedSearchQuery.

export const commonSchemas: Record<string, unknown> = {
  ErrorResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: false },
      message: { type: "string", example: "Listing not found" },
      errors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string", example: "email" },
            message: { type: "string", example: "Invalid email address" },
          },
        },
      },
    },
  },
  TitleInfo: {
    type: "object",
    properties: {
      tokenId: { type: "string" },
      contractAddress: { type: "string" },
      owner: { type: "string", description: "On-chain owner address" },
      onChainHash: { type: "string" },
      offChainHash: { type: "string" },
      verified: {
        type: "boolean",
        description: "true when on-chain and off-chain hashes match",
      },
    },
  },
  SavedSearchQuery: {
    type: "object",
    minProperties: 1,
    description:
      "Persisted discovery filter. Spatial modes (viewport / radius / polygon) are " +
      "mutually exclusive; supply all keys of a mode together.",
    properties: {
      swLng: { type: "number", minimum: -180, maximum: 180 },
      swLat: { type: "number", minimum: -90, maximum: 90 },
      neLng: { type: "number", minimum: -180, maximum: 180 },
      neLat: { type: "number", minimum: -90, maximum: 90 },
      lng: { type: "number", minimum: -180, maximum: 180 },
      lat: { type: "number", minimum: -90, maximum: 90 },
      radius: { type: "number", exclusiveMinimum: 0, description: "Meters" },
      polygon: {
        type: "array",
        minItems: 4,
        items: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: { type: "number" },
          description: "[longitude, latitude]",
        },
      },
      listingType: { type: "string", enum: ["sale", "rent"] },
      category: { type: "string", enum: ["residential", "commercial"] },
      minPrice: { type: "number", minimum: 0 },
      maxPrice: { type: "number", minimum: 0 },
      minBedrooms: { type: "number", minimum: 0 },
      minBathrooms: { type: "number", minimum: 0 },
    },
  },
};
