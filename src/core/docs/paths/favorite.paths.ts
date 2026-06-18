// Favorite paths.

import { bearer } from "../_helpers";

export const favoritePaths: Record<string, unknown> = {
  "/favorites": {
    get: {
      tags: ["Favorites"],
      summary: "List the caller's saved listings",
      security: bearer,
      responses: { "200": { description: "OK" } },
    },
    post: {
      tags: ["Favorites"],
      summary: "Save a listing",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["listingId"],
              properties: { listingId: { type: "string" } },
            },
          },
        },
      },
      responses: { "201": { description: "Saved" } },
    },
  },
  "/favorites/{listingId}": {
    delete: {
      tags: ["Favorites"],
      summary: "Unsave a listing",
      security: bearer,
      parameters: [
        {
          name: "listingId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: { "200": { description: "Removed" } },
    },
  },
};
