// Saved search paths.

import { bearer, body, ok, idParam } from "../_helpers";

export const savedSearchPaths: Record<string, unknown> = {
  "/saved-searches": {
    get: {
      tags: ["Saved Searches"],
      summary: "List saved searches",
      security: bearer,
      responses: ok("Saved searches"),
    },
    post: {
      tags: ["Saved Searches"],
      summary: "Create a saved search",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["name", "query"],
        properties: {
          name: { type: "string", maxLength: 120 },
          query: { $ref: "#/components/schemas/SavedSearchQuery" },
          alertEnabled: { type: "boolean", default: false },
        },
      }),
      responses: { "201": { description: "Created" } },
    },
  },
  "/saved-searches/{id}": {
    parameters: [idParam],
    patch: {
      tags: ["Saved Searches"],
      summary: "Update saved search",
      security: bearer,
      description: "At least one field must be provided.",
      requestBody: body({
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string", maxLength: 120 },
          query: { $ref: "#/components/schemas/SavedSearchQuery" },
          alertEnabled: { type: "boolean" },
        },
      }),
      responses: ok("Updated"),
    },
    delete: {
      tags: ["Saved Searches"],
      summary: "Delete saved search",
      security: bearer,
      responses: ok("Deleted"),
    },
  },
};
