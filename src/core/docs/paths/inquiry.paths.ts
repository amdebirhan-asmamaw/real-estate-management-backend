// Inquiry paths.

import { bearer, envelope, page, limit } from "../_helpers";

export const inquiryPaths: Record<string, unknown> = {
  "/inquiries": {
    post: {
      tags: ["Inquiries"],
      summary: "Send an inquiry about a published listing",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateInquiryInput" },
          },
        },
      },
      responses: {
        "201": {
          description: "Sent",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Inquiry"),
            },
          },
        },
      },
    },
  },
  "/inquiries/mine": {
    get: {
      tags: ["Inquiries"],
      summary: "Inquiries the caller sent",
      security: bearer,
      responses: { "200": { description: "OK" } },
    },
  },
  "/inquiries/received": {
    get: {
      tags: ["Inquiries"],
      summary: "Inquiries on the caller's listings",
      security: bearer,
      responses: { "200": { description: "OK" } },
    },
  },
  "/inquiries/{id}": {
    patch: {
      tags: ["Inquiries"],
      summary: "Respond to / update an inquiry (owner or admin)",
      description: "At least one field must be provided.",
      security: bearer,
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateInquiryInput" },
          },
        },
      },
      responses: {
        "200": {
          description: "Updated",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Inquiry"),
            },
          },
        },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/inquiries/admin": {
    get: {
      tags: ["Inquiries"],
      summary: "List all inquiries (admin)",
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
        { name: "listingId", in: "query", schema: { type: "string" } },
        page,
        limit,
      ],
      responses: {
        "200": { description: "OK" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
