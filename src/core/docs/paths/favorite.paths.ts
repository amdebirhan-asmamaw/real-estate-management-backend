// Favorite (saved listing) paths.
// Aligned to: favorite.routes.ts, favorite.service.ts, favorite.model.ts.

import { bearer, body } from "../_helpers";

const favoriteSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    user: { type: "string", description: "ObjectId of the user" },
    listing: { type: "string", description: "ObjectId of the listing" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const favoritePaths: Record<string, unknown> = {
  "/favorites": {
    get: {
      tags: ["Favorites"],
      summary: "List saved listings",
      description:
        "Returns all listings favorited by the authenticated user, sorted by createdAt " +
        "descending. Each entry is a populated Listing object (favorites whose listing has " +
        "been deleted are automatically excluded).",
      security: bearer,
      responses: {
        "200": {
          description: "Array of populated listings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Your favorites" },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Listing" },
                    description:
                      "Populated listing objects (not favorite wrappers)",
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
    post: {
      tags: ["Favorites"],
      summary: "Save a listing",
      description:
        "Adds a listing to the caller's favorites. Idempotent — saving the same listing " +
        "twice is a no-op (unique index on user+listing). The listing must be visible to " +
        "the user (published or owned). Tracks a `favorite` analytics event.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId"],
        properties: {
          listingId: {
            type: "string",
            pattern: "^[a-f0-9]{24}$",
            description: "24-char hex ObjectId of the listing to save",
          },
        },
      }),
      responses: {
        "201": {
          description: "Listing saved (or already saved — idempotent)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Listing saved" },
                  data: favoriteSchema,
                },
              },
            },
          },
        },
        "400": {
          description: "Invalid listingId format",
          $ref: "#/components/responses/Error",
        },
        "401": { $ref: "#/components/responses/Error" },
        "404": {
          description: "Listing not found or not visible to the caller",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/favorites/{listingId}": {
    delete: {
      tags: ["Favorites"],
      summary: "Unsave a listing",
      description:
        "Removes a listing from the caller's favorites. Idempotent — removing a non-favorited " +
        "listing is a no-op (no error).",
      security: bearer,
      parameters: [
        {
          name: "listingId",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "ObjectId of the listing to remove from favorites",
        },
      ],
      responses: {
        "200": {
          description: "Listing removed from favorites",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Favorite removed" },
                  data: { type: "null" },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
