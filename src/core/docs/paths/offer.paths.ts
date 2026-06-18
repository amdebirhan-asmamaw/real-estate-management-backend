// Offer paths — aligned with offer.routes.ts, offer.validation.ts, offer.service.ts.

import { bearer, body, idParam } from "../_helpers";

const offerSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    listing: {
      type: "object",
      description: "Populated when listed via /mine or /received",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        status: { type: "string" },
        listingType: { type: "string", enum: ["sale", "rent"] },
      },
    },
    listingOwner: { type: "string", description: "ObjectId of listing owner" },
    buyer: { type: "string", description: "ObjectId of buyer" },
    amount: { type: "number", minimum: 0 },
    currency: { type: "string", example: "USD" },
    message: { type: "string", maxLength: 2000 },
    status: {
      type: "string",
      enum: ["submitted", "accepted", "rejected", "countered", "cancelled"],
    },
    counterAmount: {
      type: "number",
      minimum: 0,
      description: "Set when the owner counters",
    },
    responseNote: {
      type: "string",
      maxLength: 2000,
      description: "Owner's note when responding",
    },
    expiresAt: { type: "string", format: "date-time" },
    respondedAt: { type: "string", format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const offerPaths: Record<string, unknown> = {
  // ─── Create Offer ───────────────────────────────────────────────────────────
  "/offers": {
    post: {
      tags: ["Offers"],
      summary: "Submit a purchase offer",
      description:
        "Buyer submits an offer on a sale-type listing. " +
        "Only one active offer (submitted or countered) per buyer per listing is allowed. " +
        "The listing must be published and of type 'sale'. Cannot offer on own listing. " +
        "Triggers a notification to the listing owner and a compliance high-risk check.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId", "amount"],
        properties: {
          listingId: {
            type: "string",
            pattern: "^[a-f0-9]{24}$",
            description:
              "24-char hex Mongo ObjectId of a published sale listing",
          },
          amount: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Offer amount (must be positive)",
          },
          currency: {
            type: "string",
            minLength: 3,
            maxLength: 3,
            default: "USD",
            description: "3-letter ISO currency code (uppercase)",
          },
          message: {
            type: "string",
            maxLength: 2000,
            description: "Optional message to the listing owner",
          },
          expiresAt: {
            type: "string",
            format: "date-time",
            description: "Optional expiration date (must be in the future)",
          },
        },
      }),
      responses: {
        "201": {
          description: "Offer created successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Offer submitted" },
                  data: offerSchema,
                },
              },
            },
          },
        },
        "400": {
          description: "Validation error or listing is not a sale type",
          $ref: "#/components/responses/Error",
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": {
          description: "Listing not found or not published",
          $ref: "#/components/responses/Error",
        },
        "409": {
          description:
            "Buyer already has an active offer on this listing, or buyer owns the listing",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── My Offers (sent) ───────────────────────────────────────────────────────
  "/offers/mine": {
    get: {
      tags: ["Offers"],
      summary: "List my sent offers",
      description:
        "Returns all offers submitted by the authenticated buyer, sorted by createdAt descending. " +
        "Each offer includes a populated listing summary (title, status, listingType).",
      security: bearer,
      responses: {
        "200": {
          description: "Array of offers with populated listing",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Your offers" },
                  data: { type: "array", items: offerSchema },
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

  // ─── Received Offers ────────────────────────────────────────────────────────
  "/offers/received": {
    get: {
      tags: ["Offers"],
      summary: "List received offers on my listings",
      description:
        "Returns all offers received by the authenticated property owner, sorted by createdAt descending. " +
        "Each offer includes a populated listing summary (title, status, listingType).",
      security: bearer,
      responses: {
        "200": {
          description: "Array of offers with populated listing",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Received offers" },
                  data: { type: "array", items: offerSchema },
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

  // ─── Respond to Offer ───────────────────────────────────────────────────────
  "/offers/{id}/respond": {
    patch: {
      tags: ["Offers"],
      summary: "Accept, reject, or counter an offer",
      description:
        "Only the listing owner (or admin) can respond. " +
        "The offer must be in 'submitted' or 'countered' status. " +
        "When action=counter, `counterAmount` is required. " +
        "**Side-effect:** When action=accept, a PurchaseTransaction is automatically created " +
        "from the accepted offer (see Purchase Transactions endpoints). " +
        "Notifies the buyer of the response.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["accept", "reject", "counter"],
            description:
              "accept → status becomes 'accepted' (creates PurchaseTransaction). " +
              "reject → status becomes 'rejected'. " +
              "counter → status becomes 'countered' (requires counterAmount).",
          },
          counterAmount: {
            type: "number",
            exclusiveMinimum: 0,
            description:
              "Required when action=counter. The owner's counter-offer amount.",
          },
          responseNote: {
            type: "string",
            maxLength: 2000,
            description: "Optional note from the listing owner",
          },
        },
      }),
      responses: {
        "200": {
          description: "Offer updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Offer updated" },
                  data: offerSchema,
                },
              },
            },
          },
        },
        "400": {
          description:
            "Validation error (e.g., missing counterAmount when action=counter)",
          $ref: "#/components/responses/Error",
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Offer not found",
          $ref: "#/components/responses/Error",
        },
        "409": {
          description:
            "Offer is in a terminal status (accepted/rejected/cancelled) and cannot be updated",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Cancel Offer ───────────────────────────────────────────────────────────
  "/offers/{id}/cancel": {
    post: {
      tags: ["Offers"],
      summary: "Cancel an offer",
      description:
        "Only the buyer who submitted the offer can cancel it. " +
        "The offer must be in 'submitted' or 'countered' status. " +
        "Terminal offers (accepted, rejected, cancelled) cannot be cancelled.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Offer cancelled",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Offer cancelled" },
                  data: offerSchema,
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": {
          description: "Offer not found or not owned by caller",
          $ref: "#/components/responses/Error",
        },
        "409": {
          description: "Offer is in a terminal status and cannot be cancelled",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
};
