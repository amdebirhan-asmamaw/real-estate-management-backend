// Compliance paths: cases, screenings, broker licenses, review queues, flag.
// Aligned to: compliance.routes.ts, compliance.validation.ts

import { bearer, body, idParam, page, limit } from "../_helpers";

export const compliancePaths: Record<string, unknown> = {
  // ─── Cases ──────────────────────────────────────────────────────────────────────
  "/compliance/cases": {
    get: {
      tags: ["Compliance"],
      summary: "List compliance cases (admin)",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["open", "under_review", "resolved", "dismissed"],
          },
        },
        {
          name: "severity",
          in: "query",
          schema: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
        },
        {
          name: "type",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "kyc",
              "ownership_document",
              "listing",
              "offer",
              "lease",
              "title",
              "broker_license",
            ],
          },
        },
        {
          name: "subjectUser",
          in: "query",
          schema: { type: "string" },
          description: "24-char hex Mongo ObjectId",
        },
        page,
        limit,
      ],
      responses: {
        "200": { description: "Paginated cases" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/compliance/cases/{id}": {
    patch: {
      tags: ["Compliance"],
      summary: "Update a case (admin)",
      security: bearer,
      description: "At least one field must be provided.",
      parameters: [idParam],
      requestBody: body({
        type: "object",
        minProperties: 1,
        properties: {
          status: {
            type: "string",
            enum: ["open", "under_review", "resolved", "dismissed"],
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          assignedTo: {
            type: "string",
            nullable: true,
            description:
              "24-char hex Mongo ObjectId of an admin, or null to unassign",
          },
          resolution: { type: "string", maxLength: 4000 },
          note: { type: "string", maxLength: 4000 },
        },
      }),
      responses: {
        "200": { description: "Updated" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Screenings ─────────────────────────────────────────────────────────────────
  "/compliance/screenings": {
    post: {
      tags: ["Compliance"],
      summary: "Create screening (admin)",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["subjectUser", "status"],
        properties: {
          subjectUser: {
            type: "string",
            description: "24-char hex Mongo ObjectId of the screened user",
          },
          provider: {
            type: "string",
            enum: ["manual", "mock"],
            default: "manual",
          },
          status: {
            type: "string",
            enum: ["clear", "potential_match", "confirmed_match"],
          },
          categories: {
            type: "array",
            items: { type: "string", maxLength: 120 },
            default: [],
          },
          reference: { type: "string", maxLength: 200 },
          rawResult: {
            type: "object",
            additionalProperties: true,
            description: "Provider's raw response payload",
          },
        },
      }),
      responses: {
        "201": { description: "Created" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Broker licenses ────────────────────────────────────────────────────────────
  "/compliance/broker-licenses": {
    get: {
      tags: ["Compliance"],
      summary: "List broker licenses (admin)",
      security: bearer,
      parameters: [
        {
          name: "owner",
          in: "query",
          schema: { type: "string" },
          description: "24-char hex Mongo ObjectId",
        },
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["pending", "approved", "rejected", "expired"],
          },
        },
        page,
        limit,
      ],
      responses: {
        "200": { description: "Licenses" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
    post: {
      tags: ["Compliance"],
      summary: "Submit broker license (property_owner)",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["licenseNumber", "jurisdiction", "holderName"],
        properties: {
          licenseNumber: { type: "string", maxLength: 120 },
          jurisdiction: { type: "string", maxLength: 120 },
          holderName: { type: "string", maxLength: 160 },
          expiresAt: { type: "string", format: "date-time" },
          documentPublicId: { type: "string", maxLength: 500 },
          documentHash: {
            type: "string",
            description: "Hex string, 32–128 chars",
          },
        },
      }),
      responses: {
        "201": { description: "Submitted" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/compliance/broker-licenses/{id}/review": {
    post: {
      tags: ["Compliance"],
      summary: "Review broker license (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["decision"],
        properties: {
          decision: {
            type: "string",
            enum: ["approve", "reject", "expire"],
          },
          note: { type: "string", maxLength: 2000 },
        },
      }),
      responses: {
        "200": { description: "Reviewed" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Review Queues (B1) ─────────────────────────────────────────────────────────
  "/compliance/queues/kyc": {
    get: {
      tags: ["Compliance"],
      summary: "KYC review queue (admin)",
      description: "Users whose KYC is pending review.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        "200": { description: "Paginated queue" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/compliance/queues/property-verification": {
    get: {
      tags: ["Compliance"],
      summary: "Property verification queue (admin)",
      description: "Listings with ownership documents pending review.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        "200": { description: "Paginated queue" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/compliance/queues/certificates": {
    get: {
      tags: ["Compliance"],
      summary: "Certificate queue (admin)",
      description: "Listings with pending or disputed on-chain certificates.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        "200": { description: "Paginated queue" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/compliance/queues/disputes": {
    get: {
      tags: ["Compliance"],
      summary: "Disputes queue (admin)",
      description: "Active lease and purchase disputes awaiting resolution.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        "200": { description: "Paginated queue" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/compliance/queues/suspicious": {
    get: {
      tags: ["Compliance"],
      summary: "Suspicious activity queue (admin)",
      description: "Compliance cases flagged as suspicious.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        "200": { description: "Paginated queue" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Flag suspicious entity (B2) ───────────────────────────────────────────────
  "/compliance/flag": {
    post: {
      tags: ["Compliance"],
      summary: "Flag a suspicious entity (admin)",
      description:
        "Creates a new compliance case of type matching the targetType with the given severity.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["targetType", "targetId", "severity", "title"],
        properties: {
          targetType: {
            type: "string",
            enum: ["listing", "offer", "lease", "user"],
          },
          targetId: {
            type: "string",
            description: "24-char hex Mongo ObjectId",
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          title: { type: "string", maxLength: 200 },
          description: { type: "string", maxLength: 4000 },
        },
      }),
      responses: {
        "201": { description: "Case created" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
