// Saved search paths.
// Aligned to: savedSearch.routes.ts, savedSearch.validation.ts, savedSearch.model.ts.

import { bearer, body, idParam } from "../_helpers";

const savedSearchSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    user: { type: "string" },
    name: { type: "string", maxLength: 120 },
    query: {
      type: "object",
      description:
        "Discovery filter object — same shape as GET /listings query params " +
        "(listingType, category, propertyType, minPrice, maxPrice, etc.)",
    },
    alertEnabled: {
      type: "boolean",
      description:
        "When true, new listings matching this search trigger a saved_search.match notification",
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const savedSearchPaths: Record<string, unknown> = {
  "/saved-searches": {
    get: {
      tags: ["Saved Searches"],
      summary: "List saved searches",
      description:
        "Returns all saved searches for the authenticated user, sorted by updatedAt descending.",
      security: bearer,
      responses: {
        "200": {
          description: "Array of saved searches",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Your saved searches" },
                  data: { type: "array", items: savedSearchSchema },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
    post: {
      tags: ["Saved Searches"],
      summary: "Create a saved search",
      description:
        "Saves a discovery query for re-use. Enable alertEnabled to receive " +
        "notifications when new listings match.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["name", "query"],
        properties: {
          name: { type: "string", maxLength: 120 },
          query: {
            type: "object",
            description:
              "Discovery filter params (listingType, minPrice, etc.)",
          },
          alertEnabled: { type: "boolean", default: false },
        },
      }),
      responses: {
        "201": {
          description: "Saved search created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Search saved" },
                  data: savedSearchSchema,
                },
              },
            },
          },
        },
        "400": { $ref: "#/components/responses/Error" },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/saved-searches/{id}": {
    parameters: [idParam],
    patch: {
      tags: ["Saved Searches"],
      summary: "Update saved search",
      description:
        "At least one field must be provided. Only the owner can update.",
      security: bearer,
      requestBody: body({
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string", maxLength: 120 },
          query: { type: "object" },
          alertEnabled: { type: "boolean" },
        },
      }),
      responses: {
        "200": {
          description: "Saved search updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Search updated" },
                  data: savedSearchSchema,
                },
              },
            },
          },
        },
        "400": { $ref: "#/components/responses/Error" },
        "401": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
    delete: {
      tags: ["Saved Searches"],
      summary: "Delete saved search",
      security: bearer,
      responses: {
        "200": {
          description: "Saved search deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Search deleted" },
                  data: { type: "null" },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
