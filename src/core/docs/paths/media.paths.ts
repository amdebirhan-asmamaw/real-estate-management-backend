// Media paths: photos (upload, delete, reorder, cover), ownership documents.
// Aligned to: listing.routes.ts, listing.validation.ts

import { bearer, body, idParam } from "../_helpers";

export const mediaPaths: Record<string, unknown> = {
  "/listings/{id}/photos": {
    parameters: [idParam],
    post: {
      tags: ["Media"],
      summary: "Upload public photos",
      security: bearer,
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                photos: {
                  type: "array",
                  items: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Photos added" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
    delete: {
      tags: ["Media"],
      summary: "Remove a photo by publicId",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["publicId"],
        properties: { publicId: { type: "string" } },
      }),
      responses: {
        "200": { description: "Removed" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/photos/reorder": {
    patch: {
      tags: ["Media"],
      summary: "Reorder listing photos",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["order"],
        properties: {
          order: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
            description: "publicIds in the desired order",
          },
        },
      }),
      responses: {
        "200": { description: "Reordered" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/photos/cover": {
    patch: {
      tags: ["Media"],
      summary: "Set cover photo",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["publicId"],
        properties: { publicId: { type: "string" } },
      }),
      responses: {
        "200": { description: "Cover set" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/documents": {
    parameters: [idParam],
    post: {
      tags: ["Media"],
      summary: "Upload private ownership documents",
      security: bearer,
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                type: { $ref: "#/components/schemas/DocumentUploadType" },
                documents: {
                  type: "array",
                  items: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Documents uploaded" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
    get: {
      tags: ["Media"],
      summary: "List ownership document metadata (owner/admin)",
      security: bearer,
      responses: {
        "200": { description: "OK" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/documents/{docId}/url": {
    get: {
      tags: ["Media"],
      summary: "Signed URL for a private ownership document",
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
  "/listings/{id}/documents/{docId}/review": {
    post: {
      tags: ["Admin"],
      summary: "Approve/reject an ownership document (admin)",
      description: "Approving a title_deed verifies the listing.",
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
      requestBody: body({
        type: "object",
        required: ["decision"],
        properties: {
          decision: { type: "string", enum: ["approve", "reject"] },
          note: { type: "string", maxLength: 2000 },
        },
      }),
      responses: {
        "200": { description: "Reviewed" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
