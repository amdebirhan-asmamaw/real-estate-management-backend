// Rental application paths.
// Aligned to: rentalApplication.routes.ts, rentalApplication.validation.ts, rentalApplication.model.ts.

import { bearer, body, idParam } from "../_helpers";

const appSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    listing: { type: "string", description: "Listing ObjectId" },
    landlord: { type: "string" },
    tenant: { type: "string" },
    status: {
      type: "string",
      enum: [
        "submitted",
        "screening",
        "approved",
        "rejected",
        "withdrawn",
        "lease_created",
      ],
    },
    desiredStartDate: { type: "string", format: "date" },
    desiredEndDate: { type: "string", format: "date" },
    occupants: { type: "integer", minimum: 1 },
    monthlyIncome: { type: "number" },
    employer: { type: "string" },
    message: { type: "string" },
    screening: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["not_started", "pending", "passed", "failed", "manual_review"],
        },
        provider: { type: "string" },
        reference: { type: "string" },
        score: { type: "number", minimum: 0, maximum: 1000 },
        completedAt: { type: "string", format: "date-time" },
        notes: { type: "string" },
      },
    },
    appointment: {
      type: "object",
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
        requestedAt: { type: "string", format: "date-time" },
        scheduledFor: { type: "string", format: "date-time" },
        locationNote: { type: "string" },
        note: { type: "string" },
      },
    },
    lease: {
      type: "string",
      description: "Lease ObjectId (set after lease_created)",
    },
    reviewedBy: { type: "string" },
    reviewedAt: { type: "string", format: "date-time" },
    reviewNote: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const appResp = (desc: string, code = "200") => ({
  [code]: {
    description: desc,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
            data: appSchema,
          },
        },
      },
    },
  },
});

export const rentalApplicationPaths: Record<string, unknown> = {
  "/rental-applications": {
    post: {
      tags: ["Rental Applications"],
      summary: "Submit rental application (tenant)",
      description:
        "Tenant-only. Listing must be published and of type 'rent'. " +
        "One active application per tenant per listing (unique partial index). " +
        "Notifies the landlord and tracks a rental_application analytics event.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId"],
        properties: {
          listingId: { type: "string", pattern: "^[a-f0-9]{24}$" },
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
      responses: {
        ...appResp("Application submitted", "201"),
        "400": { $ref: "#/components/responses/Error" },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Tenant role required",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing not found or not rentable",
          $ref: "#/components/responses/Error",
        },
        "409": {
          description: "Active application already exists",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/rental-applications/mine": {
    get: {
      tags: ["Rental Applications"],
      summary: "List caller's applications",
      description:
        "Returns applications where the caller is tenant or landlord, sorted descending.",
      security: bearer,
      responses: {
        "200": {
          description: "Array of applications",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string" },
                  data: { type: "array", items: appSchema },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/rental-applications/{id}": {
    get: {
      tags: ["Rental Applications"],
      summary: "Get application",
      description: "Accessible by tenant, landlord, or admin.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...appResp("Application details"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/rental-applications/{id}/withdraw": {
    post: {
      tags: ["Rental Applications"],
      summary: "Withdraw application (tenant)",
      description:
        "Only the tenant can withdraw. Must be in submitted or screening status.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...appResp("Application withdrawn"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description: "Not in withdrawable status",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/rental-applications/{id}/review": {
    patch: {
      tags: ["Rental Applications"],
      summary: "Review application (owner/admin)",
      description:
        "Landlord or admin advances the application status. " +
        "Sets reviewedBy, reviewedAt, reviewNote.",
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
      responses: {
        ...appResp("Application reviewed"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/rental-applications/{id}/screening": {
    patch: {
      tags: ["Rental Applications"],
      summary: "Update screening results (owner/admin)",
      description: "Records external screening provider results.",
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
      responses: {
        ...appResp("Screening updated"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/rental-applications/{id}/appointment": {
    patch: {
      tags: ["Rental Applications"],
      summary: "Update viewing appointment",
      description: "Accessible by any party (tenant, owner, admin).",
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
      responses: {
        ...appResp("Appointment updated"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/rental-applications/{id}/lease": {
    post: {
      tags: ["Rental Applications"],
      summary: "Create lease from approved application (owner/admin)",
      description:
        "Creates a draft lease from an approved application. Sets application " +
        "status to lease_created and links the lease ObjectId.",
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
      responses: {
        "201": {
          description: "Lease created from application",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Lease created" },
                  data: { $ref: "#/components/schemas/Lease" },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description: "Application not in approved status",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
};
