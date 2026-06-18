// Rental yield paths: maintenance records and yield dashboard.
// Aligned to: rentalYield.validation.ts, listing.routes.ts

import { bearer, body, envelope, idParam, page } from "../_helpers";

export const rentalYieldPaths: Record<string, unknown> = {
  "/listings/{id}/maintenance-records": {
    get: {
      tags: ["Rental Yield"],
      summary: "List listing maintenance records",
      security: bearer,
      parameters: [
        idParam,
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "ISO 8601 start date filter",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "ISO 8601 end date filter",
        },
        {
          name: "type",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "maintenance",
              "repair",
              "utility",
              "tax",
              "insurance",
              "management",
              "other",
            ],
          },
        },
        page,
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 50, minimum: 1, maximum: 100 },
        },
      ],
      responses: {
        "200": {
          description: "Paginated maintenance records",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Maintenance records" },
                  data: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/MaintenanceRecord",
                        },
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
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
    post: {
      tags: ["Rental Yield"],
      summary: "Create listing maintenance record",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["type", "amount", "incurredAt"],
        properties: {
          leaseId: {
            type: "string",
            description:
              "24-char hex Mongo ObjectId (optional link to a lease)",
          },
          type: {
            type: "string",
            enum: [
              "maintenance",
              "repair",
              "utility",
              "tax",
              "insurance",
              "management",
              "other",
            ],
          },
          amount: { type: "number", minimum: 0 },
          currency: {
            type: "string",
            minLength: 3,
            maxLength: 3,
            default: "USD",
          },
          incurredAt: {
            type: "string",
            format: "date-time",
            description: "When the expense was incurred (required)",
          },
          note: { type: "string", maxLength: 2000 },
        },
      }),
      responses: {
        "201": {
          description: "Maintenance record created",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/MaintenanceRecord"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/yield": {
    get: {
      tags: ["Rental Yield"],
      summary: "Owner rental yield summary for a single listing",
      description:
        "Calculates total income from leases vs. expenses from maintenance records " +
        "to produce a yield percentage and breakdown.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Yield summary",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/YieldSummary"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
