// Listing CRUD, workflow, and admin endpoints.
// Aligned to: listing.routes.ts, admin.routes.ts, listing.validation.ts

import { bearer, envelope, body, ok, idParam } from "../_helpers";

export const listingPaths: Record<string, unknown> = {
  "/listings": {
    post: {
      tags: ["Listings"],
      summary: "Create a draft listing",
      security: bearer,
      description: "Roles: property_owner, admin, super_admin.",
      requestBody: body({ $ref: "#/components/schemas/CreateListingInput" }),
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
      description: "Roles: property_owner, admin, super_admin.",
      responses: {
        "200": {
          description: "OK",
          content: { "application/json": { schema: envelope() } },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/dashboard": {
    get: {
      tags: ["Listings"],
      summary: "Owner dashboard stats",
      security: bearer,
      description: "Roles: property_owner, admin, super_admin.",
      responses: {
        "200": {
          description: "Dashboard statistics",
          content: { "application/json": { schema: envelope() } },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/dashboard/yield": {
    get: {
      tags: ["Rental Yield"],
      summary: "Owner aggregated yield dashboard across all listings",
      security: bearer,
      description: "Roles: property_owner, admin, super_admin.",
      responses: {
        "200": {
          description: "Aggregated yield data",
          content: { "application/json": { schema: envelope() } },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/analytics/neighborhood": {
    get: {
      tags: ["Discovery"],
      summary: "Neighborhood-level listing analytics",
      description:
        "Aggregated metrics for listings in a region. Optionally authenticate for richer data.",
      parameters: [
        {
          name: "region",
          in: "query",
          schema: { type: "string", maxLength: 200 },
          description: "Region name filter",
        },
      ],
      responses: {
        "200": {
          description: "Neighborhood analytics",
          content: { "application/json": { schema: envelope() } },
        },
      },
    },
  },
  "/listings/bulk-action": {
    post: {
      tags: ["Listings"],
      summary: "Bulk transition multiple listings",
      description:
        "Apply state machine actions to up to 50 listings at once. " +
        "Roles: property_owner, admin, super_admin.",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/BulkActionInput" }),
      responses: {
        "200": {
          description: "Bulk results",
          content: { "application/json": { schema: envelope() } },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}": {
    parameters: [idParam],
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
      description: "All fields optional; at least one must be provided.",
      security: bearer,
      requestBody: body(
        { $ref: "#/components/schemas/CreateListingInput" },
        false,
      ),
      responses: {
        "200": {
          description: "Updated",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Listing"),
            },
          },
        },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
    delete: {
      tags: ["Listings"],
      summary: "Delete a listing",
      security: bearer,
      responses: ok("Deleted"),
    },
  },
  "/listings/{id}/transition": {
    post: {
      tags: ["Listings"],
      summary: "Drive the review state machine",
      description:
        "Owners: submit, archive. Admins: start_review, request_info, approve, " +
        "reject, publish, suspend, unsuspend, mark_rented, mark_sold, unmark_rented, " +
        "unmark_sold, archive. Publish requires verified ownership.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({ $ref: "#/components/schemas/TransitionInput" }),
      responses: {
        "200": {
          description: "Transitioned",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Listing"),
            },
          },
        },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/duplicates": {
    get: {
      tags: ["Admin"],
      summary: "Potential duplicate listings (admin only)",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Potential duplicates",
          content: { "application/json": { schema: envelope() } },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/analytics": {
    get: {
      tags: ["Listings"],
      summary: "Listing lead & view metrics (owner/admin)",
      description:
        "Aggregated views, inquiries, offers and other lead metrics for a single listing.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Analytics data",
          content: { "application/json": { schema: envelope() } },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
