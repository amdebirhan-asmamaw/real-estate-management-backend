// Offer paths.

import { bearer, body, ok, idParam } from "../_helpers";

export const offerPaths: Record<string, unknown> = {
  "/offers": {
    post: {
      tags: ["Offers"],
      summary: "Submit a purchase offer (tenant)",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId", "amount"],
        properties: {
          listingId: {
            type: "string",
            description: "24-char hex Mongo ObjectId",
          },
          amount: { type: "number", exclusiveMinimum: 0 },
          currency: {
            type: "string",
            minLength: 3,
            maxLength: 3,
            default: "USD",
          },
          message: { type: "string", maxLength: 2000 },
          expiresAt: {
            type: "string",
            format: "date-time",
            description: "Must be in the future",
          },
        },
      }),
      responses: { "201": { description: "Offer created" } },
    },
  },
  "/offers/mine": {
    get: {
      tags: ["Offers"],
      summary: "List sent offers",
      security: bearer,
      responses: ok("Offers"),
    },
  },
  "/offers/received": {
    get: {
      tags: ["Offers"],
      summary: "List received offers",
      security: bearer,
      responses: ok("Offers"),
    },
  },
  "/offers/{id}/respond": {
    patch: {
      tags: ["Offers"],
      summary: "Accept/reject/counter an offer (owner)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["accept", "reject", "counter"] },
          counterAmount: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Required when action=counter",
          },
          responseNote: { type: "string", maxLength: 2000 },
        },
      }),
      responses: ok("Responded"),
    },
  },
  "/offers/{id}/cancel": {
    post: {
      tags: ["Offers"],
      summary: "Cancel an offer (tenant)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Cancelled"),
    },
  },
};
