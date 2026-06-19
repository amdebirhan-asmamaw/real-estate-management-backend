// Inquiry paths.
// Aligned to: inquiry.routes.ts, inquiry.validation.ts, inquiry.service.ts, inquiry.model.ts.

import { bearer, body, page, limit } from "../_helpers";

const inquirySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    listing: {
      type: "object",
      description: "Populated on mine/received/admin",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        status: { type: "string" },
      },
    },
    listingOwner: { type: "string" },
    inquirer: {
      oneOf: [
        { type: "string" },
        {
          type: "object",
          description: "Populated on admin list",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
          },
        },
      ],
    },
    inquiryType: { type: "string", enum: ["rent", "buy", "general"] },
    message: { type: "string", maxLength: 2000 },
    contactInfo: {
      type: "object",
      properties: {
        phone: { type: "string", maxLength: 20 },
        email: { type: "string", format: "email", maxLength: 254 },
      },
    },
    status: {
      type: "string",
      enum: ["open", "responded", "in_discussion", "closed", "spam"],
    },
    response: { type: "string", maxLength: 2000 },
    respondedAt: { type: "string", format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const inquiryPaths: Record<string, unknown> = {
  // ─── Create ─────────────────────────────────────────────────────────────────
  "/inquiries": {
    post: {
      tags: ["Inquiries"],
      summary: "Send an inquiry about a published listing",
      description:
        "Any authenticated user. The listing must be published (visible). " +
        "Tracks an `inquiry` analytics event and notifies the listing owner.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId", "message"],
        properties: {
          listingId: {
            type: "string",
            pattern: "^[a-f0-9]{24}$",
            description: "24-char ObjectId of a published listing",
          },
          inquiryType: {
            type: "string",
            enum: ["rent", "buy", "general"],
            default: "general",
          },
          message: { type: "string", minLength: 1, maxLength: 2000 },
          contactInfo: {
            type: "object",
            properties: {
              phone: { type: "string", maxLength: 20 },
              email: { type: "string", format: "email", maxLength: 254 },
            },
          },
        },
      }),
      responses: {
        "201": {
          description: "Inquiry sent",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Inquiry sent" },
                  data: inquirySchema,
                },
              },
            },
          },
        },
        "400": {
          description:
            "Validation error (missing message or invalid listingId)",
          $ref: "#/components/responses/Error",
        },
        "401": { $ref: "#/components/responses/Error" },
        "404": {
          description: "Listing not found or not published",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── My Inquiries ───────────────────────────────────────────────────────────
  "/inquiries/mine": {
    get: {
      tags: ["Inquiries"],
      summary: "Inquiries the caller sent",
      description:
        "Returns all inquiries submitted by the authenticated user, sorted by " +
        "createdAt descending. Each inquiry includes populated listing (title, status).",
      security: bearer,
      responses: {
        "200": {
          description: "Array of inquiries with populated listing",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Your inquiries" },
                  data: { type: "array", items: inquirySchema },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Received Inquiries ─────────────────────────────────────────────────────
  "/inquiries/received": {
    get: {
      tags: ["Inquiries"],
      summary: "Inquiries on the caller's listings",
      description:
        "Returns all inquiries received on listings owned by the authenticated user. " +
        "Sorted by createdAt descending. Populated listing (title, status).",
      security: bearer,
      responses: {
        "200": {
          description: "Array of received inquiries",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Received inquiries" },
                  data: { type: "array", items: inquirySchema },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },

  // ─── Respond / Update ───────────────────────────────────────────────────────
  "/inquiries/{id}": {
    patch: {
      tags: ["Inquiries"],
      summary: "Respond to / update an inquiry",
      description:
        "Only the listing owner or admin. At least one field required. " +
        "Setting `response` auto-sets status to `responded` (unless status is also provided). " +
        "Notifies the inquirer when a response or status change occurs.",
      security: bearer,
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: body({
        type: "object",
        minProperties: 1,
        properties: {
          status: {
            type: "string",
            enum: ["open", "responded", "in_discussion", "closed", "spam"],
          },
          response: {
            type: "string",
            maxLength: 2000,
            description: "Owner's reply text. Auto-sets respondedAt timestamp.",
          },
        },
      }),
      responses: {
        "200": {
          description: "Inquiry updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Inquiry updated" },
                  data: inquirySchema,
                },
              },
            },
          },
        },
        "400": {
          description: "No fields provided",
          $ref: "#/components/responses/Error",
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or admin",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Inquiry not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Admin List ─────────────────────────────────────────────────────────────
  "/inquiries/admin": {
    get: {
      tags: ["Inquiries"],
      summary: "List all inquiries (admin)",
      description:
        "Admin-only. Paginated list of all inquiries with optional status and listing " +
        "filters. Populates listing (title, status) and inquirer (name, email).",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["open", "responded", "in_discussion", "closed", "spam"],
          },
        },
        {
          name: "listingId",
          in: "query",
          schema: { type: "string" },
          description: "Filter by listing ObjectId",
        },
        page,
        limit,
      ],
      responses: {
        "200": {
          description: "Paginated inquiries",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Inquiries" },
                  data: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: inquirySchema },
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
        "403": {
          description: "Admin role required",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
};
