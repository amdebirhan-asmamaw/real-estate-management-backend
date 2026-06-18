// Admin paths: user management, listing review, KYC admin, admin management, audit logs.
// Aligned to: admin.routes.ts, kyc.admin.routes.ts, admin.routes.ts(listings), audit.routes.ts

import { bearer, body, ok, idParam, page, limit } from "../_helpers";

export const adminPaths: Record<string, unknown> = {
  // ─── Listing review queue (admin.routes.ts for listings) ─────────────────────
  "/admin/listings": {
    get: {
      tags: ["Admin"],
      summary: "Review queue (filter by status, verification, property type)",
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
              "rented",
              "sold",
              "archived",
            ],
          },
        },
        {
          name: "verificationStatus",
          in: "query",
          schema: {
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
        },
        {
          name: "propertyType",
          in: "query",
          schema: { $ref: "#/components/schemas/PropertyType" },
        },
        page,
        limit,
      ],
      responses: {
        "200": { description: "Paginated listings" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/listings/stats": {
    get: {
      tags: ["Admin"],
      summary: "Listing stats for admin dashboard",
      security: bearer,
      responses: {
        "200": { description: "Stats" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── User management (admin.routes.ts) ────────────────────────────────────────
  "/admin/users": {
    get: {
      tags: ["Admin"],
      summary: "List all users",
      security: bearer,
      parameters: [
        {
          name: "search",
          in: "query",
          schema: { type: "string", maxLength: 100 },
          description: "Matches name or email",
        },
        {
          name: "role",
          in: "query",
          schema: {
            type: "string",
            enum: ["super_admin", "admin", "property_owner", "tenant"],
          },
        },
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["pending", "active", "suspended", "blocked", "rejected"],
          },
        },
        {
          name: "kycStatus",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "not_started",
              "pending",
              "under_review",
              "verified",
              "rejected",
              "expired",
            ],
          },
        },
        {
          name: "walletStatus",
          in: "query",
          schema: {
            type: "string",
            enum: ["unlinked", "pending_signature", "linked", "revoked"],
          },
        },
        {
          name: "sort",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "createdAt",
              "-createdAt",
              "name",
              "-name",
              "email",
              "-email",
            ],
            default: "-createdAt",
          },
        },
        page,
        limit,
      ],
      responses: {
        "200": { description: "User list" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/users/{id}": {
    get: {
      tags: ["Admin"],
      summary: "Get user detail",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": { description: "User" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/users/{id}/status": {
    patch: {
      tags: ["Admin"],
      summary: "Set a user's account status",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["accountStatus"],
        properties: {
          accountStatus: {
            type: "string",
            enum: ["pending", "active", "suspended", "blocked", "rejected"],
          },
        },
      }),
      responses: {
        "200": { description: "Updated" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/users/{id}/suspend": {
    post: {
      tags: ["Admin"],
      summary: "Suspend user",
      security: bearer,
      parameters: [idParam],
      responses: ok("Suspended"),
    },
  },
  "/admin/users/{id}/reactivate": {
    post: {
      tags: ["Admin"],
      summary: "Reactivate user",
      security: bearer,
      parameters: [idParam],
      responses: ok("Reactivated"),
    },
  },
  "/admin/users/{id}/block": {
    post: {
      tags: ["Admin"],
      summary: "Block user permanently",
      security: bearer,
      parameters: [idParam],
      responses: ok("Blocked"),
    },
  },
  "/admin/users/{id}/restore": {
    post: {
      tags: ["Admin"],
      summary: "Restore a blocked/rejected user (super_admin only)",
      description:
        "Re-activates a user whose account was previously blocked or rejected.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": { description: "User restored" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/users/{id}/wallet/revoke": {
    post: {
      tags: ["Admin"],
      summary: "Revoke user wallet (admin)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Wallet revoked"),
    },
  },

  // ─── KYC admin (kyc.admin.routes.ts) ──────────────────────────────────────────
  "/admin/users/{id}/kyc": {
    get: {
      tags: ["Admin"],
      summary: "A user's KYC status and documents",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": { description: "KYC summary" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/users/{id}/kyc/start-review": {
    post: {
      tags: ["Admin"],
      summary: "Start KYC review (sets status to under_review)",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": { description: "Review started" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/users/{id}/kyc/review": {
    post: {
      tags: ["Admin"],
      summary: "Approve/reject a user's KYC",
      description: "Approval verifies the user and activates the account.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["decision"],
        properties: {
          decision: { type: "string", enum: ["approve", "reject"] },
          note: { type: "string" },
        },
      }),
      responses: {
        "200": { description: "Reviewed" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
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
      responses: {
        "200": { description: "Signed URL" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Super Admin: admin management (admin.routes.ts) ──────────────────────────
  "/admin/admins": {
    get: {
      tags: ["Admin"],
      summary: "List admins (super_admin only)",
      security: bearer,
      parameters: [
        {
          name: "search",
          in: "query",
          schema: { type: "string", maxLength: 100 },
        },
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["pending", "active", "suspended", "blocked", "rejected"],
          },
        },
        page,
        limit,
      ],
      responses: {
        "200": { description: "Admin list" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
    post: {
      tags: ["Admin"],
      summary: "Create admin (super_admin only)",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100 },
          email: { type: "string", format: "email" },
          password: {
            type: "string",
            minLength: 8,
            description: "≥ 8 chars, 1 uppercase, 1 number",
          },
          phone: { type: "string", maxLength: 20, nullable: true },
        },
      }),
      responses: {
        "201": { description: "Created" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/admin/admins/{id}/suspend": {
    post: {
      tags: ["Admin"],
      summary: "Suspend admin (super_admin only)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Suspended"),
    },
  },
  "/admin/admins/{id}/reactivate": {
    post: {
      tags: ["Admin"],
      summary: "Reactivate admin (super_admin only)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Reactivated"),
    },
  },

  // ─── Super Admin: Compliance override (admin.routes.ts) ───────────────────────
  "/admin/compliance/cases/{id}/override": {
    post: {
      tags: ["Admin"],
      summary: "Override a compliance case decision (super_admin only)",
      description:
        "Force-close a compliance case with a mandatory reason. " +
        "Available only to super_admin.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["status", "reason"],
        properties: {
          status: {
            type: "string",
            enum: ["resolved", "dismissed"],
          },
          reason: {
            type: "string",
            minLength: 10,
            maxLength: 2000,
          },
        },
      }),
      responses: {
        "200": { description: "Case overridden" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Audit logs (audit.routes.ts) ─────────────────────────────────────────────
  "/audit-logs": {
    get: {
      tags: ["Admin"],
      summary: "Query the lifecycle audit trail",
      security: bearer,
      parameters: [
        {
          name: "targetId",
          in: "query",
          schema: { type: "string" },
          description: "24-char hex Mongo ObjectId",
        },
        {
          name: "action",
          in: "query",
          schema: { type: "string" },
          description: "Action name from the audit actions enum",
        },
        {
          name: "actor",
          in: "query",
          schema: { type: "string" },
          description: "24-char hex Mongo ObjectId of the actor",
        },
        {
          name: "targetType",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "listing",
              "user",
              "lease",
              "admin",
              "compliance",
              "purchase_transaction",
              "rental_application",
            ],
          },
        },
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "ISO 8601 date",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Must be ≥ from",
        },
        page,
        limit,
      ],
      responses: {
        "200": { description: "Paginated audit logs" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
