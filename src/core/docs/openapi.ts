import { env } from "../config/env";

// Hand-curated OpenAPI 3.0 description of the API. Served as interactive docs at
// GET /api/v1/docs and as raw JSON at GET /api/v1/docs.json. Keep this in sync with the
// route definitions; it is the contract the frontend builds against.

const bearer = [{ bearerAuth: [] }];

const envelope = (dataRef?: string) => ({
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    message: { type: "string" },
    ...(dataRef ? { data: { $ref: dataRef } } : { data: {} }),
  },
});

export const openapiSpec: Record<string, unknown> = {
  openapi: "3.0.3",
  info: {
    title: "Real Estate Marketplace API",
    version: "1.0.0",
    description:
      "Backend for a verified, decentralized real-estate marketplace. " +
      "All responses use the envelope `{ success, message, data? }` (errors: " +
      "`{ success:false, message, errors? }`). Authenticate with a Bearer access token.",
  },
  servers: [
    { url: "/api/v1", description: "Current server (v1)" },
    {
      url: `http://localhost:${env.PORT}/api/v1`,
      description: "Local dev",
    },
  ],
  tags: [
    { name: "Auth", description: "Registration, login, tokens, profile, wallet" },
    { name: "KYC", description: "Identity verification (self-service)" },
    { name: "Listings", description: "Property listings & review workflow" },
    { name: "Discovery", description: "Public geospatial search" },
    { name: "Media", description: "Photos (public) & ownership documents (private)" },
    { name: "Titles", description: "On-chain property titles & dispute management" },
    { name: "Favorites", description: "Saved listings" },
    { name: "Inquiries", description: "Tenant → owner inquiries" },
    { name: "Offers", description: "Purchase offers from tenants to property owners" },
    { name: "Notifications", description: "User notifications" },
    { name: "Saved Searches", description: "Persisted discovery queries with optional alerts" },
    { name: "Leases", description: "Lease agreements & on-chain escrow" },
    { name: "Rental Applications", description: "Tenant rental application workflow" },
    { name: "Purchase Transactions", description: "Property purchase transaction lifecycle" },
    { name: "Compliance", description: "Compliance cases, screenings & broker licenses" },
    { name: "Chain Transactions", description: "Blockchain transaction audit trail" },
    { name: "Admin", description: "Admin-only review & user management" },
    { name: "Health", description: "Liveness / readiness" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
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
      Tokens: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },
      AuthUser: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: ["super_admin", "admin", "property_owner", "tenant"],
          },
          accountStatus: {
            type: "string",
            enum: ["pending", "active", "suspended", "blocked", "rejected"],
          },
          kycStatus: {
            type: "string",
            enum: ["not_started", "pending", "verified", "rejected"],
          },
          emailVerified: { type: "boolean" },
        },
      },
      AuthResult: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/AuthUser" },
          tokens: { $ref: "#/components/schemas/Tokens" },
        },
      },
      RegisterInput: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100 },
          email: { type: "string", format: "email" },
          password: {
            type: "string",
            minLength: 8,
            description: "≥ 8 chars, at least one uppercase letter and one number",
          },
          role: {
            type: "string",
            enum: ["property_owner", "tenant"],
            default: "tenant",
            description: "Self-registration is limited to these roles",
          },
        },
      },
      LoginInput: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      RefreshInput: {
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string" } },
      },
      GeoPoint: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["Point"], default: "Point" },
          coordinates: {
            type: "array",
            items: { type: "number" },
            minItems: 2,
            maxItems: 2,
            example: [13.405, 52.52],
            description: "[longitude, latitude]",
          },
        },
      },
      PropertyType: {
        type: "string",
        enum: [
          "apartment",
          "house",
          "villa",
          "condominium",
          "land",
          "commercial_space",
          "office",
          "warehouse",
          "shop",
          "mixed_use",
        ],
      },
      Listing: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          listingType: { type: "string", enum: ["sale", "rent"] },
          category: { type: "string", enum: ["residential", "commercial"] },
          propertyType: { $ref: "#/components/schemas/PropertyType" },
          status: {
            type: "string",
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
          },
          availabilityStatus: {
            type: "string",
            enum: ["available", "under_offer", "rented", "sold"],
          },
          price: { type: "number" },
          monthlyRent: { type: "number" },
          currency: { type: "string", example: "USD" },
          bedrooms: { type: "integer" },
          bathrooms: { type: "integer" },
          area: {
            type: "object",
            properties: {
              value: { type: "number" },
              unit: { type: "string", enum: ["sqm", "sqft"], default: "sqm" },
            },
          },
          yearBuilt: { type: "integer" },
          floorNumber: { type: "integer" },
          parkingSpaces: { type: "integer" },
          totalFloors: { type: "integer" },
          maintenanceFee: { type: "number" },
          serviceCharge: { type: "number" },
          furnishingStatus: {
            type: "string",
            enum: ["furnished", "semi_furnished", "unfurnished"],
          },
          utilityDetails: { type: "string" },
          neighborhoodInfo: { type: "string" },
          nearbyLandmarks: { type: "array", items: { type: "string" } },
          rentalTerms: { type: "string" },
          saleTerms: { type: "string" },
          legalNotes: { type: "string" },
          address: {
            type: "object",
            properties: {
              street: { type: "string" },
              city: { type: "string" },
              region: { type: "string" },
              country: { type: "string" },
              postalCode: { type: "string" },
            },
          },
          location: { $ref: "#/components/schemas/GeoPoint" },
          amenities: { type: "array", items: { type: "string" } },
          photos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                publicId: { type: "string" },
                isCover: { type: "boolean" },
              },
            },
          },
          verificationStatus: {
            type: "string",
            enum: [
              "unverified",
              "pending",
              "requires_more_info",
              "verified",
              "rejected",
              "suspended",
            ],
          },
          tokenId: { type: "string", nullable: true },
          createdBy: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateListingInput: {
        type: "object",
        required: ["title", "listingType", "category", "propertyType", "location"],
        properties: {
          title: { type: "string", maxLength: 200 },
          description: { type: "string", maxLength: 5000 },
          listingType: { type: "string", enum: ["sale", "rent"] },
          category: { type: "string", enum: ["residential", "commercial"] },
          propertyType: { $ref: "#/components/schemas/PropertyType" },
          price: {
            type: "number",
            minimum: 0,
            description: "Required when listingType=sale; forbidden when listingType=rent",
          },
          monthlyRent: {
            type: "number",
            minimum: 0,
            description: "Required when listingType=rent; forbidden when listingType=sale",
          },
          currency: {
            type: "string",
            minLength: 3,
            maxLength: 3,
            default: "USD",
            description: "ISO 4217 code, uppercased",
          },
          bedrooms: { type: "number", minimum: 0 },
          bathrooms: { type: "number", minimum: 0 },
          area: {
            type: "object",
            required: ["value"],
            properties: {
              value: { type: "number", minimum: 0 },
              unit: { type: "string", enum: ["sqm", "sqft"], default: "sqm" },
            },
          },
          yearBuilt: { type: "integer", minimum: 1800, maximum: 2100 },
          floorNumber: { type: "integer", minimum: 0 },
          parkingSpaces: { type: "integer", minimum: 0 },
          totalFloors: { type: "integer", minimum: 0 },
          maintenanceFee: { type: "number", minimum: 0 },
          serviceCharge: { type: "number", minimum: 0 },
          utilityDetails: { type: "string", maxLength: 2000 },
          neighborhoodInfo: { type: "string", maxLength: 2000 },
          furnishingStatus: {
            type: "string",
            enum: ["furnished", "semi_furnished", "unfurnished"],
          },
          nearbyLandmarks: {
            type: "array",
            items: { type: "string", maxLength: 200 },
          },
          rentalTerms: { type: "string", maxLength: 5000 },
          saleTerms: { type: "string", maxLength: 5000 },
          legalNotes: { type: "string", maxLength: 5000 },
          address: {
            type: "object",
            properties: {
              street: { type: "string" },
              city: { type: "string" },
              region: { type: "string" },
              country: { type: "string" },
              postalCode: { type: "string" },
            },
          },
          location: { $ref: "#/components/schemas/GeoPoint" },
          amenities: { type: "array", items: { type: "string" } },
        },
      },
      TransitionInput: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: [
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
            ],
          },
          reason: {
            type: "string",
            enum: [
              "missing_document",
              "invalid_ownership_proof",
              "wrong_location",
              "poor_quality",
              "suspicious",
              "duplicate",
              "other",
            ],
            description: "Required when action=reject",
          },
          note: {
            type: "string",
            description: "Required when action=request_info or suspend",
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
      KycSummary: {
        type: "object",
        properties: {
          kycStatus: {
            type: "string",
            enum: ["not_started", "pending", "verified", "rejected"],
          },
          accountStatus: { type: "string" },
          reviewNote: { type: "string" },
          documents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                type: {
                  type: "string",
                  enum: ["national_id", "passport", "drivers_license", "other"],
                },
                status: {
                  type: "string",
                  enum: ["pending", "approved", "rejected"],
                },
                hash: { type: "string" },
                uploadedAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      Inquiry: {
        type: "object",
        properties: {
          id: { type: "string" },
          listing: { type: "string" },
          listingOwner: { type: "string" },
          inquirer: { type: "string" },
          inquiryType: {
            type: "string",
            enum: ["rent", "buy", "general"],
          },
          message: { type: "string" },
          contactInfo: {
            type: "object",
            properties: {
              phone: { type: "string" },
              email: { type: "string", format: "email" },
            },
          },
          status: {
            type: "string",
            enum: ["open", "responded", "in_discussion", "closed", "spam"],
          },
          response: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateInquiryInput: {
        type: "object",
        required: ["listingId", "message"],
        properties: {
          listingId: {
            type: "string",
            description: "24-char hex Mongo ObjectId of a published listing",
          },
          inquiryType: {
            type: "string",
            enum: ["rent", "buy", "general"],
            default: "general",
          },
          message: { type: "string", minLength: 1, maxLength: 2000 },
          contactInfo: {
            type: "object",
            properties: {
              phone: { type: "string", maxLength: 20 },
              email: { type: "string", format: "email", maxLength: 254 },
            },
          },
        },
      },
      UpdateInquiryInput: {
        type: "object",
        minProperties: 1,
        properties: {
          status: {
            type: "string",
            enum: ["open", "responded", "in_discussion", "closed", "spam"],
          },
          response: { type: "string", maxLength: 2000 },
        },
      },
      Lease: {
        type: "object",
        properties: {
          id: { type: "string" },
          listing: { type: "string" },
          landlord: { type: "string" },
          tenant: { type: "string" },
          status: {
            type: "string",
            enum: [
              "draft",
              "proposed",
              "funded",
              "active",
              "completed",
              "terminated",
              "cancelled",
              "disputed",
            ],
          },
          monthlyRent: { type: "number" },
          depositAmount: { type: "number" },
          currency: { type: "string", example: "USDC" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          terms: { type: "string" },
          escrowTxHash: { type: "string", nullable: true },
          disputeNote: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateLeaseInput: {
        type: "object",
        required: [
          "listingId",
          "tenantId",
          "monthlyRent",
          "depositAmount",
          "startDate",
          "endDate",
        ],
        properties: {
          listingId: {
            type: "string",
            description: "24-char hex Mongo ObjectId of the listing",
          },
          tenantId: {
            type: "string",
            description: "24-char hex Mongo ObjectId of the tenant user",
          },
          monthlyRent: { type: "number", minimum: 0 },
          depositAmount: { type: "number", minimum: 0 },
          currency: {
            type: "string",
            default: "USD",
            description: "Uppercased; defaults to USD when omitted",
          },
          startDate: { type: "string", format: "date" },
          endDate: {
            type: "string",
            format: "date",
            description: "Must be after startDate",
          },
          terms: { type: "string", maxLength: 20000 },
        },
      },
      DisputeResolveInput: {
        type: "object",
        required: ["decision"],
        properties: {
          decision: {
            type: "string",
            enum: ["release_deposit", "refund_deposit", "cancel"],
          },
          note: { type: "string" },
        },
      },
      EscrowInfo: {
        type: "object",
        properties: {
          leaseId: { type: "string" },
          contractAddress: { type: "string" },
          balance: { type: "string", description: "On-chain token balance (wei string)" },
          status: { type: "string", description: "On-chain escrow state" },
          verified: {
            type: "boolean",
            description: "true when on-chain state matches DB record",
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
    },
  },
  security: [],
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account",
        description:
          "Tenants become active immediately; property owners start `pending` and must pass KYC.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/AuthResult"),
              },
            },
          },
          "409": { $ref: "#/components/responses/Error" },
          "422": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/AuthResult"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": {
            description: "Account suspended/blocked/rejected",
          },
        },
      },
    },
    "/auth/refresh-token": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a refresh token for new tokens",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshInput" },
            },
          },
        },
        responses: {
          "200": { description: "New tokens" },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user's profile",
        security: bearer,
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/AuthUser"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },

    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke a single refresh-token session",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshInput" },
            },
          },
        },
        responses: { "200": { description: "Logged out" } },
      },
    },
    "/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "Revoke all of the caller's sessions",
        security: bearer,
        responses: {
          "200": { description: "All sessions revoked" },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/auth/sessions": {
      get: {
        tags: ["Auth"],
        summary: "List the caller's active sessions",
        security: bearer,
        responses: { "200": { description: "Active sessions" } },
      },
    },
    "/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change password (revokes all sessions)",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword"],
                properties: {
                  currentPassword: { type: "string" },
                  newPassword: {
                    type: "string",
                    description: "≥ 8 chars, 1 uppercase, 1 number",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Password changed; sign in again" },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },

    "/kyc/documents": {
      post: {
        tags: ["KYC"],
        summary: "Submit private KYC documents",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["national_id", "passport", "drivers_license", "other"],
                  },
                  documents: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Submitted",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/KycSummary"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/kyc/me": {
      get: {
        tags: ["KYC"],
        summary: "Own KYC status and documents",
        security: bearer,
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/KycSummary"),
              },
            },
          },
        },
      },
    },
    "/kyc/documents/{docId}/url": {
      get: {
        tags: ["KYC"],
        summary: "Signed URL for one of your KYC documents",
        security: bearer,
        parameters: [
          {
            name: "docId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Signed URL" } },
      },
    },

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
          { name: "swLng", in: "query", schema: { type: "number", minimum: -180, maximum: 180 } },
          { name: "swLat", in: "query", schema: { type: "number", minimum: -90, maximum: 90 } },
          { name: "neLng", in: "query", schema: { type: "number", minimum: -180, maximum: 180 } },
          { name: "neLat", in: "query", schema: { type: "number", minimum: -90, maximum: 90 } },
          { name: "lng", in: "query", schema: { type: "number", minimum: -180, maximum: 180 } },
          { name: "lat", in: "query", schema: { type: "number", minimum: -90, maximum: 90 } },
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
              'JSON-encoded ring of ≥4 [lng,lat] points, e.g. `[[13.4,52.5],[13.5,52.5],[13.5,52.6],[13.4,52.5]]`',
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
          { name: "minPrice", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "maxPrice", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "minBedrooms", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "minBathrooms", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "minArea", in: "query", schema: { type: "number", minimum: 0 } },
          { name: "maxArea", in: "query", schema: { type: "number", minimum: 0 } },
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
          { name: "page", in: "query", schema: { type: "integer", default: 1, minimum: 1 } },
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
      post: {
        tags: ["Listings"],
        summary: "Create a draft listing",
        security: bearer,
        description: "Roles: property_owner, admin, super_admin.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateListingInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created (draft)",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Listing"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "422": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/listings/mine": {
      get: {
        tags: ["Listings"],
        summary: "The caller's own listings (any status)",
        security: bearer,
        responses: { "200": { description: "OK" } },
      },
    },
    "/listings/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        tags: ["Listings"],
        summary: "Get a listing",
        description:
          "Published listings are public; unpublished ones are visible only to the owner/admin.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Listing"),
              },
            },
          },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
      patch: {
        tags: ["Listings"],
        summary: "Edit a listing (owner: only while draft/rejected)",
        security: bearer,
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateListingInput" },
            },
          },
        },
        responses: {
          "200": { description: "Updated" },
          "403": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
      delete: {
        tags: ["Listings"],
        summary: "Delete a listing",
        security: bearer,
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/listings/{id}/transition": {
      post: {
        tags: ["Listings"],
        summary: "Drive the review state machine",
        description:
          "Owners: submit, archive. Admins: start_review, request_info, approve, " +
          "reject, publish, suspend, unsuspend, archive. Publish requires verified ownership.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TransitionInput" },
            },
          },
        },
        responses: {
          "200": { description: "Transitioned" },
          "403": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/listings/{id}/photos": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      post: {
        tags: ["Media"],
        summary: "Upload public photos",
        security: bearer,
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  photos: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Photos added" } },
      },
      delete: {
        tags: ["Media"],
        summary: "Remove a photo by publicId",
        security: bearer,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["publicId"],
                properties: { publicId: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Removed" } },
      },
    },
    "/listings/{id}/documents": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      post: {
        tags: ["Media"],
        summary: "Upload private ownership documents",
        security: bearer,
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: [
                      "title_deed",
                      "tax_record",
                      "utility_bill",
                      "ownership_certificate",
                      "other",
                    ],
                  },
                  documents: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Documents uploaded" } },
      },
      get: {
        tags: ["Media"],
        summary: "List ownership document metadata (owner/admin)",
        security: bearer,
        responses: { "200": { description: "OK" } },
      },
    },
    "/listings/{id}/documents/{docId}/url": {
      get: {
        tags: ["Media"],
        summary: "Signed URL for a private ownership document",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "docId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Signed URL" } },
      },
    },
    "/listings/{id}/documents/{docId}/review": {
      post: {
        tags: ["Admin"],
        summary: "Approve/reject an ownership document",
        description: "Approving a title_deed verifies the listing.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "docId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["decision"],
                properties: {
                  decision: { type: "string", enum: ["approve", "reject"] },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Reviewed" } },
      },
    },
    "/listings/{id}/duplicates": {
      get: {
        tags: ["Admin"],
        summary: "Potential duplicate listings (warning only)",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/listings/{id}/mint-title": {
      post: {
        tags: ["Titles"],
        summary: "Mint the on-chain digital title (admin, verified listing)",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Minted",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Listing"),
              },
            },
          },
          "403": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/listings/{id}/title": {
      get: {
        tags: ["Titles"],
        summary: "On-chain ownership verification",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/TitleInfo"),
              },
            },
          },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/listings/{id}/analytics": {
      get: {
        tags: ["Listings"],
        summary: "Listing lead & view metrics (owner/admin)",
        description:
          "Aggregated views, inquiries, offers and other lead metrics for a single listing. " +
          "Accessible only by the listing owner or an admin.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: envelope() } },
          },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },

    "/favorites": {
      get: {
        tags: ["Favorites"],
        summary: "List the caller's saved listings",
        security: bearer,
        responses: { "200": { description: "OK" } },
      },
      post: {
        tags: ["Favorites"],
        summary: "Save a listing",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["listingId"],
                properties: { listingId: { type: "string" } },
              },
            },
          },
        },
        responses: { "201": { description: "Saved" } },
      },
    },
    "/favorites/{listingId}": {
      delete: {
        tags: ["Favorites"],
        summary: "Unsave a listing",
        security: bearer,
        parameters: [
          {
            name: "listingId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Removed" } },
      },
    },

    "/inquiries": {
      post: {
        tags: ["Inquiries"],
        summary: "Send an inquiry about a published listing",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateInquiryInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Sent",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Inquiry"),
              },
            },
          },
        },
      },
    },
    "/inquiries/mine": {
      get: {
        tags: ["Inquiries"],
        summary: "Inquiries the caller sent",
        security: bearer,
        responses: { "200": { description: "OK" } },
      },
    },
    "/inquiries/received": {
      get: {
        tags: ["Inquiries"],
        summary: "Inquiries on the caller's listings",
        security: bearer,
        responses: { "200": { description: "OK" } },
      },
    },
    "/inquiries/{id}": {
      patch: {
        tags: ["Inquiries"],
        summary: "Respond to / update an inquiry (owner or admin)",
        description: "At least one field must be provided.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateInquiryInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Inquiry"),
              },
            },
          },
          "403": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/inquiries/admin": {
      get: {
        tags: ["Inquiries"],
        summary: "List all inquiries (admin)",
        security: bearer,
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["open", "responded", "in_discussion", "closed", "spam"],
            },
          },
          { name: "listingId", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20, maximum: 100 },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "403": { $ref: "#/components/responses/Error" },
        },
      },
    },

    "/leases": {
      post: {
        tags: ["Leases"],
        summary: "Create a lease draft",
        description: "Roles: property_owner, admin. Creates the lease in `draft` status.",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateLeaseInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Lease draft created",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "422": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/mine": {
      get: {
        tags: ["Leases"],
        summary: "Leases where the caller is landlord or tenant",
        security: bearer,
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope(),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        tags: ["Leases"],
        summary: "Get a single lease",
        description: "Accessible by the landlord, the tenant, or an admin.",
        security: bearer,
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/propose": {
      post: {
        tags: ["Leases"],
        summary: "Advance lease from draft → proposed",
        description: "Roles: property_owner, admin.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lease proposed",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/fund": {
      post: {
        tags: ["Leases"],
        summary: "Fund the on-chain escrow (admin)",
        description:
          "Admin only. Transfers deposit + first month rent into the escrow contract. " +
          "Both parties must have a linked `walletAddress` before this call.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Escrow funded; lease status → funded",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/activate": {
      post: {
        tags: ["Leases"],
        summary: "Release first month rent and activate lease (admin)",
        description: "Admin only. Releases first month to landlord; lease status → active.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lease activated",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/cancel": {
      post: {
        tags: ["Leases"],
        summary: "Cancel lease before activation (parties/admin)",
        description:
          "Accessible by either party or an admin. Must be called before `/activate`. " +
          "Triggers a full escrow refund if funds are held.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lease cancelled; escrow refunded",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/complete": {
      post: {
        tags: ["Leases"],
        summary: "Mark lease completed and refund deposit to tenant (admin)",
        description: "Admin only. Releases deposit back to tenant; lease status → completed.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lease completed; deposit refunded to tenant",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/terminate": {
      post: {
        tags: ["Leases"],
        summary: "Terminate lease and release deposit to landlord (admin)",
        description:
          "Admin only. Releases deposit to landlord as penalty; lease status → terminated.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lease terminated; deposit released to landlord",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/dispute": {
      post: {
        tags: ["Leases"],
        summary: "Flag a dispute on an active lease (parties/admin)",
        description: "Accessible by either party or an admin. Sets lease status → disputed.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Dispute flagged",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/dispute/resolve": {
      post: {
        tags: ["Leases"],
        summary: "Resolve a disputed lease (admin)",
        description:
          "Admin only. `release_deposit` sends deposit to landlord; " +
          "`refund_deposit` returns it to tenant; `cancel` voids the lease.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DisputeResolveInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Dispute resolved",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/Lease"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "409": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/leases/{id}/escrow": {
      get: {
        tags: ["Leases"],
        summary: "On-chain escrow verification",
        description: "Reads escrow state from the chain and compares it to the DB record.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: envelope("#/components/schemas/EscrowInfo"),
              },
            },
          },
          "401": { $ref: "#/components/responses/Error" },
          "403": { $ref: "#/components/responses/Error" },
          "404": { $ref: "#/components/responses/Error" },
          "503": { $ref: "#/components/responses/Error" },
        },
      },
    },

    "/admin/listings": {
      get: {
        tags: ["Admin"],
        summary: "Review queue (filter by status)",
        security: bearer,
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "draft",
                "submitted",
                "under_review",
                "approved",
                "rejected",
                "published",
                "suspended",
                "archived",
              ],
            },
          },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/admin/users/{id}/status": {
      patch: {
        tags: ["Admin"],
        summary: "Set a user's account status",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["accountStatus"],
                properties: {
                  accountStatus: {
                    type: "string",
                    enum: [
                      "pending",
                      "active",
                      "suspended",
                      "blocked",
                      "rejected",
                    ],
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
    },
    "/admin/users/{id}/kyc": {
      get: {
        tags: ["Admin"],
        summary: "A user's KYC status and documents",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/admin/users/{id}/kyc/review": {
      post: {
        tags: ["Admin"],
        summary: "Approve/reject a user's KYC",
        description: "Approval verifies the user and activates the account.",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["decision"],
                properties: {
                  decision: { type: "string", enum: ["approve", "reject"] },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Reviewed" } },
      },
    },
    "/admin/users/{id}/kyc/documents/{docId}/url": {
      get: {
        tags: ["Admin"],
        summary: "Signed URL for a user's KYC document",
        security: bearer,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "docId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Signed URL" } },
      },
    },
    "/audit-logs": {
      get: {
        tags: ["Admin"],
        summary: "Query the lifecycle audit trail",
        security: bearer,
        parameters: [
          { name: "targetId", in: "query", schema: { type: "string" } },
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

// Shared response refs (declared after the object to keep paths readable).
(openapiSpec.components as Record<string, unknown>).responses = {
  Error: {
    description: "Error",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  },
};

// Merge additional endpoint docs from the extra paths module.
import { extraPaths } from "./openapi.paths.extra";
Object.assign(openapiSpec.paths as Record<string, unknown>, extraPaths);
