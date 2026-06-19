// Compliance paths: cases, screenings, broker licenses, review queues, flag.
// Aligned to: compliance.routes.ts, compliance.validation.ts, compliance.model.ts,
// compliance.service.ts, queues.service.ts.

import { bearer, envelope, body, idParam, page, limit } from "../_helpers";

// Envelope whose data is a paginated { items, total, page, limit } page.
const paginated = (itemsSchema: Record<string, unknown>) => ({
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    message: { type: "string" },
    data: {
      type: "object",
      properties: {
        items: { type: "array", items: itemsSchema },
        total: { type: "integer" },
        page: { type: "integer" },
        limit: { type: "integer" },
      },
    },
  },
});

const jsonResp = (
  desc: string,
  schema: Record<string, unknown>,
  code = "200",
) => ({
  [code]: {
    description: desc,
    content: { "application/json": { schema } },
  },
});

const adminErr = {
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
};

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
        ...jsonResp(
          "Paginated compliance cases",
          paginated({ $ref: "#/components/schemas/ComplianceCase" }),
        ),
        ...adminErr,
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
        ...jsonResp(
          "Updated case",
          envelope("#/components/schemas/ComplianceCase"),
        ),
        ...adminErr,
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
        ...jsonResp(
          "Screening created",
          envelope("#/components/schemas/Screening"),
          "201",
        ),
        ...adminErr,
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
        ...jsonResp(
          "Paginated broker licenses",
          paginated({ $ref: "#/components/schemas/BrokerLicense" }),
        ),
        ...adminErr,
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
        ...jsonResp(
          "Broker license submitted",
          envelope("#/components/schemas/BrokerLicense"),
          "201",
        ),
        ...adminErr,
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
        ...jsonResp(
          "Reviewed broker license",
          envelope("#/components/schemas/BrokerLicense"),
        ),
        ...adminErr,
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Review Queues (B1) ─────────────────────────────────────────────────────────
  "/compliance/queues/kyc": {
    get: {
      tags: ["Compliance"],
      summary: "KYC review queue (admin)",
      description: "Users whose KYC is pending or under review.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        ...jsonResp(
          "Paginated users awaiting KYC review",
          paginated({ $ref: "#/components/schemas/AuthUser" }),
        ),
        ...adminErr,
      },
    },
  },
  "/compliance/queues/property-verification": {
    get: {
      tags: ["Compliance"],
      summary: "Property verification queue (admin)",
      description:
        "Listings with pending ownership documents / verificationStatus = pending.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        ...jsonResp(
          "Paginated listings awaiting verification",
          paginated({ $ref: "#/components/schemas/Listing" }),
        ),
        ...adminErr,
      },
    },
  },
  "/compliance/queues/certificates": {
    get: {
      tags: ["Compliance"],
      summary: "Certificate issuance queue (admin)",
      description:
        "Verified listings that have no minted title yet (mint candidates).",
      security: bearer,
      parameters: [page, limit],
      responses: {
        ...jsonResp(
          "Paginated mint-ready listings",
          paginated({ $ref: "#/components/schemas/Listing" }),
        ),
        ...adminErr,
      },
    },
  },
  "/compliance/queues/disputes": {
    get: {
      tags: ["Compliance"],
      summary: "Disputes queue (admin)",
      description:
        "Union of disputed leases and disputed purchase transactions, each tagged with `kind`.",
      security: bearer,
      parameters: [page, limit],
      responses: {
        ...jsonResp(
          "Paginated disputes (leases + purchases)",
          paginated({
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["lease", "purchase_transaction"],
              },
              id: { type: "string" },
              status: { type: "string" },
              updatedAt: { type: "string", format: "date-time" },
            },
            additionalProperties: true,
            description:
              "Either a Lease or PurchaseTransaction shape, discriminated by `kind`",
          }),
        ),
        ...adminErr,
      },
    },
  },
  "/compliance/queues/suspicious": {
    get: {
      tags: ["Compliance"],
      summary: "Suspicious activity queue (admin)",
      description:
        "Open compliance cases flagged suspicious/duplicate (listing/offer types).",
      security: bearer,
      parameters: [page, limit],
      responses: {
        ...jsonResp(
          "Paginated suspicious compliance cases",
          paginated({ $ref: "#/components/schemas/ComplianceCase" }),
        ),
        ...adminErr,
      },
    },
  },

  // ─── Flag suspicious entity (B2) ───────────────────────────────────────────────
  "/compliance/flag": {
    post: {
      tags: ["Compliance"],
      summary: "Flag a suspicious entity (admin)",
      description:
        "Creates a new compliance case of type matching the targetType with the given severity. " +
        "For a listing target, the listing owner is set as the case subject and notified.",
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
        ...jsonResp(
          "Compliance case created",
          envelope("#/components/schemas/ComplianceCase"),
          "201",
        ),
        ...adminErr,
        "404": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
