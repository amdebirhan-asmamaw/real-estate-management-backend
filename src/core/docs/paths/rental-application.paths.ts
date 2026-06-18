// Rental application paths.

import { bearer, body, ok, idParam } from "../_helpers";

export const rentalApplicationPaths: Record<string, unknown> = {
  "/rental-applications": {
    post: {
      tags: ["Rental Applications"],
      summary: "Submit rental application (tenant)",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId"],
        properties: {
          listingId: {
            type: "string",
            description: "24-char hex Mongo ObjectId",
          },
          desiredStartDate: { type: "string", format: "date" },
          desiredEndDate: {
            type: "string",
            format: "date",
            description: "Must be after desiredStartDate",
          },
          occupants: { type: "integer", minimum: 1, maximum: 50 },
          monthlyIncome: { type: "number", minimum: 0 },
          employer: { type: "string", maxLength: 200 },
          message: { type: "string", maxLength: 4000 },
        },
      }),
      responses: { "201": { description: "Submitted" } },
    },
  },
  "/rental-applications/mine": {
    get: {
      tags: ["Rental Applications"],
      summary: "List caller's applications",
      security: bearer,
      responses: ok("Applications"),
    },
  },
  "/rental-applications/{id}": {
    get: {
      tags: ["Rental Applications"],
      summary: "Get application",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": { description: "Application" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/rental-applications/{id}/withdraw": {
    post: {
      tags: ["Rental Applications"],
      summary: "Withdraw application (tenant)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Withdrawn"),
    },
  },
  "/rental-applications/{id}/review": {
    patch: {
      tags: ["Rental Applications"],
      summary: "Review application (owner/admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["screening", "approved", "rejected"],
          },
          note: { type: "string", maxLength: 2000 },
        },
      }),
      responses: ok("Reviewed"),
    },
  },
  "/rental-applications/{id}/screening": {
    patch: {
      tags: ["Rental Applications"],
      summary: "Update screening results",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["pending", "passed", "failed", "manual_review"],
          },
          provider: { type: "string", maxLength: 100 },
          reference: { type: "string", maxLength: 200 },
          score: { type: "number", minimum: 0, maximum: 1000 },
          notes: { type: "string", maxLength: 2000 },
        },
      }),
      responses: ok("Updated"),
    },
  },
  "/rental-applications/{id}/appointment": {
    patch: {
      tags: ["Rental Applications"],
      summary: "Update viewing appointment",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: [
              "requested",
              "scheduled",
              "rescheduled",
              "cancelled",
              "completed",
            ],
          },
          scheduledFor: { type: "string", format: "date-time" },
          locationNote: { type: "string", maxLength: 500 },
          note: { type: "string", maxLength: 2000 },
        },
      }),
      responses: ok("Updated"),
    },
  },
  "/rental-applications/{id}/lease": {
    post: {
      tags: ["Rental Applications"],
      summary: "Create lease from approved application",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["monthlyRent", "depositAmount", "startDate", "endDate"],
        properties: {
          monthlyRent: { type: "number", minimum: 0 },
          depositAmount: { type: "number", minimum: 0 },
          currency: { type: "string", default: "USD" },
          startDate: { type: "string", format: "date" },
          endDate: {
            type: "string",
            format: "date",
            description: "Must be after startDate",
          },
          terms: { type: "string", maxLength: 20000 },
        },
      }),
      responses: { "201": { description: "Lease created" } },
    },
  },
};
