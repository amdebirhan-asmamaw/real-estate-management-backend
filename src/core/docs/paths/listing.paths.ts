// Listing CRUD, review state-machine, and admin endpoints.
// Aligned to: listing.routes.ts, listing.validation.ts, listing.service.ts, admin.routes.ts.

import { bearer, envelope, body, idParam } from "../_helpers";

export const listingPaths: Record<string, unknown> = {
  // ─── Create ─────────────────────────────────────────────────────────────────
  "/listings": {
    post: {
      tags: ["Listings"],
      summary: "Create a draft listing",
      description:
        "Roles: property_owner, admin, super_admin. " +
        "Creates a new listing in `draft` status. Required fields: title, listingType, " +
        "category, propertyType, location. Conditional: `price` required for sale, " +
        "`monthlyRent` required for rent.",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/CreateListingInput" }),
      responses: {
        "201": {
          description: "Listing created (draft)",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Listing"),
            },
          },
        },
        "400": {
          description:
            "Validation error (missing required fields, invalid enum)",
          $ref: "#/components/responses/Error",
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Single listing ─────────────────────────────────────────────────────────
  "/listings/{id}": {
    parameters: [idParam],
    get: {
      tags: ["Listings"],
      summary: "Get a listing by ID",
      description:
        "Published listings are public (no auth required). Unpublished listings are visible " +
        "only to the owner or admins. Returns 404 for non-parties to prevent information leakage. " +
        "Tracks a `view` analytics event for published listings.",
      responses: {
        "200": {
          description: "Listing details",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Listing"),
            },
          },
        },
        "404": {
          description: "Listing not found or not visible to the caller",
          $ref: "#/components/responses/Error",
        },
      },
    },
    patch: {
      tags: ["Listings"],
      summary: "Edit a listing",
      description:
        "Owners may edit content only in `draft` or `rejected` status. " +
        "Admins may edit at any time. All fields are optional; at least one must be provided. " +
        "Type-specific and location rules still apply if present.",
      security: bearer,
      requestBody: body(
        { $ref: "#/components/schemas/CreateListingInput" },
        false,
      ),
      responses: {
        "200": {
          description: "Updated listing",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Listing"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description:
            "Listing is not in an editable status (draft/rejected) for owners",
          $ref: "#/components/responses/Error",
        },
      },
    },
    delete: {
      tags: ["Listings"],
      summary: "Delete a listing",
      description: "Permanently removes a listing. Owner or admin may delete.",
      security: bearer,
      responses: {
        "200": {
          description: "Listing deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Listing deleted" },
                  data: { type: "null" },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── State Machine Transition ─────────────────────────────────────────────
  "/listings/{id}/transition": {
    post: {
      tags: ["Listings"],
      summary: "Drive the review state machine",
      description:
        "**Owner actions:** submit (draft/rejected → submitted), archive, mark_rented, " +
        "mark_sold, unmark_rented, unmark_sold.\n" +
        "**Admin actions:** start_review, request_info, approve, reject, publish, suspend, " +
        "unsuspend, archive.\n\n" +
        "**Preconditions:**\n" +
        "- `submit` requires active account + KYC verified.\n" +
        "- `publish` requires verificationStatus=verified, an approved title_deed document, " +
        "and an anchored ownershipDocumentHash.\n" +
        "- `reject` requires `reason` (rejection code). " +
        "`request_info` and `suspend` require `note`.\n\n" +
        "**Side-effects:** Publishes trigger saved-search notifications. " +
        "Rejections with reason `suspicious`/`duplicate` flag via compliance.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
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
            maxLength: 2000,
            description: "Required when action=request_info or suspend",
          },
        },
      }),
      responses: {
        "200": {
          description: "Listing transitioned",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Listing"),
            },
          },
        },
        "400": {
          description:
            "Unknown action or missing required fields (reason/note)",
          $ref: "#/components/responses/Error",
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description:
            "Admin-only action attempted by non-admin, or KYC/account not ready for submit",
          $ref: "#/components/responses/Error",
        },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description:
            "Action not allowed from current status, or publish preconditions unmet",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Bulk Transition ──────────────────────────────────────────────────────
  "/listings/bulk-action": {
    post: {
      tags: ["Listings"],
      summary: "Bulk transition multiple listings",
      description:
        "Apply state-machine actions to up to 50 listings at once. " +
        "Each action is processed sequentially; per-item failures don't abort the batch. " +
        "Returns an array of results with per-item success/error.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["actions"],
        properties: {
          actions: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: {
              type: "object",
              required: ["id", "action"],
              properties: {
                id: { type: "string", description: "Listing ObjectId" },
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
                reason: { type: "string" },
                note: { type: "string", maxLength: 2000 },
              },
            },
          },
        },
      }),
      responses: {
        "200": {
          description: "Bulk action results",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Bulk action results" },
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        ok: { type: "boolean" },
                        error: {
                          type: "string",
                          description: "Present when ok=false",
                        },
                      },
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
  },

  // ─── Duplicate Detection ──────────────────────────────────────────────────
  "/listings/{id}/duplicates": {
    get: {
      tags: ["Admin"],
      summary: "Potential duplicate listings (admin)",
      description:
        "Non-blocking duplicate warning surfaced at review time. Flags listings " +
        "by the same owner or nearby listings with a matching title/postcode.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Array of duplicate candidates",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: {
                    type: "string",
                    example: "Potential duplicates",
                  },
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        status: { type: "string" },
                        reasons: {
                          type: "array",
                          items: {
                            type: "string",
                            enum: ["same_owner", "nearby_similar"],
                          },
                        },
                      },
                    },
                  },
                },
              },
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
