// Media paths: photos (upload, delete, reorder, cover), ownership documents (upload, list, signed URL, review).
// Aligned with listing.routes.ts, listing.validation.ts, listing.model.ts, listing.service.ts.

import { bearer, body, idParam } from "../_helpers";

// ─── Shared response schemas ────────────────────────────────────────────────────

const photoSchema = {
  type: "object",
  properties: {
    url: { type: "string", description: "Public CDN URL (Cloudinary)" },
    publicId: {
      type: "string",
      description: "Cloudinary public ID — use for delete, reorder, setCover",
    },
    isCover: {
      type: "boolean",
      description: "Whether this is the cover photo",
    },
  },
};

const listingWithPhotosResponse = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    message: { type: "string" },
    data: {
      type: "object",
      description: "Full listing object (photos array updated)",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        photos: { type: "array", items: photoSchema },
      },
    },
  },
};

const documentSummarySchema = {
  type: "object",
  description:
    "Safe summary — publicId is intentionally omitted (server-side only)",
  properties: {
    id: { type: "string", description: "Document sub-document _id" },
    type: {
      type: "string",
      enum: [
        "title_deed",
        "tax_record",
        "utility_bill",
        "ownership_certificate",
        "lease_authority",
        "government_document",
        "other",
      ],
    },
    status: {
      type: "string",
      enum: ["pending", "approved", "rejected"],
    },
    hash: {
      type: "string",
      description: "SHA-256 of the uploaded file (for on-chain anchoring)",
    },
    reviewNote: {
      type: "string",
      description: "Admin's review note (if reviewed)",
    },
    uploadedAt: { type: "string", format: "date-time" },
  },
};

const docIdParam = {
  name: "docId",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Document sub-document ObjectId",
};

// ─── Paths ──────────────────────────────────────────────────────────────────────

export const mediaPaths: Record<string, unknown> = {
  // ─── Photos: Upload & Delete ────────────────────────────────────────────────
  "/listings/{id}/photos": {
    parameters: [idParam],
    post: {
      tags: ["Media"],
      summary: "Upload public photos",
      description:
        "Upload one or more images for a listing's public gallery. " +
        "Files are uploaded to Cloudinary as public assets. " +
        "Only the listing owner or admin can upload. " +
        "Accepts `multipart/form-data` with a `photos` field containing image files.",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                photos: {
                  type: "array",
                  items: { type: "string", format: "binary" },
                  description: "Image files (JPEG, PNG, WebP)",
                },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Photos added to listing",
          content: {
            "application/json": { schema: listingWithPhotosResponse },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
    delete: {
      tags: ["Media"],
      summary: "Remove a photo by publicId",
      description:
        "Removes a specific photo from the listing gallery by its Cloudinary `publicId`. " +
        "The server first removes the DB reference, then destroys the remote asset. " +
        "Only the listing owner or admin can remove photos.",
      security: bearer,
      requestBody: body({
        type: "object",
        required: ["publicId"],
        properties: {
          publicId: {
            type: "string",
            description: "Cloudinary publicId of the photo to remove",
          },
        },
      }),
      responses: {
        "200": {
          description: "Photo removed",
          content: {
            "application/json": { schema: listingWithPhotosResponse },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing not found or photo not found on this listing",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Photos: Reorder ────────────────────────────────────────────────────────
  "/listings/{id}/photos/reorder": {
    patch: {
      tags: ["Media"],
      summary: "Reorder listing photos",
      description:
        "Sets the display order of photos. Provide an array of `publicId` strings " +
        "in the desired order. All existing publicIds must be included.",
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
            description: "publicIds in the desired display order",
          },
        },
      }),
      responses: {
        "200": {
          description: "Photos reordered",
          content: {
            "application/json": { schema: listingWithPhotosResponse },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Photos: Set Cover ──────────────────────────────────────────────────────
  "/listings/{id}/photos/cover": {
    patch: {
      tags: ["Media"],
      summary: "Set cover photo",
      description:
        "Designates one photo as the listing's cover image. " +
        "The previous cover (if any) has its `isCover` flag cleared. " +
        "The specified `publicId` must exist in the listing's photos array.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["publicId"],
        properties: {
          publicId: {
            type: "string",
            description: "publicId of the photo to set as cover",
          },
        },
      }),
      responses: {
        "200": {
          description: "Cover photo set",
          content: {
            "application/json": { schema: listingWithPhotosResponse },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing not found or publicId not in photos",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Documents: Upload & List ───────────────────────────────────────────────
  "/listings/{id}/documents": {
    parameters: [idParam],
    post: {
      tags: ["Media"],
      summary: "Upload private ownership documents",
      description:
        "Upload one or more ownership documents for verification. " +
        "Files are uploaded to Cloudinary as **authenticated** (private) assets — " +
        "they can only be accessed via signed URLs. " +
        "Each file is SHA-256 hashed for future on-chain anchoring. " +
        "After upload, listing `verificationStatus` is set to `pending` and " +
        "all admins are notified that a review is requested. " +
        "**Note:** Identity documents (ID/passport) belong to KYC, not here.",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "title_deed",
                    "tax_record",
                    "utility_bill",
                    "ownership_certificate",
                    "lease_authority",
                    "government_document",
                    "other",
                  ],
                  default: "other",
                  description: "Document type for all files in this batch",
                },
                documents: {
                  type: "array",
                  items: { type: "string", format: "binary" },
                  description: "Document files (PDF, images)",
                },
              },
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Documents uploaded",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Documents uploaded" },
                  data: {
                    type: "object",
                    properties: {
                      listingId: { type: "string" },
                      documents: {
                        type: "array",
                        items: documentSummarySchema,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
    get: {
      tags: ["Media"],
      summary: "List ownership document metadata",
      description:
        "Returns metadata for all ownership documents on this listing. " +
        "The Cloudinary `publicId` is intentionally omitted from the response — " +
        "use the `/url` endpoint to get a time-limited signed URL. " +
        "Only the listing owner or admin can access.",
      security: bearer,
      responses: {
        "200": {
          description: "Array of document summaries",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Documents" },
                  data: { type: "array", items: documentSummarySchema },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Documents: Signed URL ──────────────────────────────────────────────────
  "/listings/{id}/documents/{docId}/url": {
    get: {
      tags: ["Media"],
      summary: "Get signed URL for a private ownership document",
      description:
        "Returns a time-limited signed URL to view/download a private ownership document. " +
        "The URL is generated server-side from the Cloudinary `publicId` (never exposed to client). " +
        "Only the listing owner or admin can access.",
      security: bearer,
      parameters: [idParam, docIdParam],
      responses: {
        "200": {
          description: "Signed URL",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Signed URL" },
                  data: {
                    type: "object",
                    properties: {
                      url: {
                        type: "string",
                        format: "uri",
                        description:
                          "Time-limited signed URL for direct download/view",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Not the listing owner or insufficient role",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing or document not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },

  // ─── Documents: Admin Review ────────────────────────────────────────────────
  "/listings/{id}/documents/{docId}/review": {
    post: {
      tags: ["Admin"],
      summary: "Approve or reject an ownership document",
      description:
        "Admin-only. Reviews a pending ownership document. " +
        "**Side-effects on approve:**" +
        "\n- If the document is a `title_deed`, the listing is marked `verified`, " +
        "`verifiedBy` and `verifiedAt` are set, and the document's SHA-256 hash " +
        "is stored as `ownershipDocumentHash` (prepared for on-chain anchoring). " +
        "\n- **Side-effects on reject:** listing `verificationStatus` is set to `rejected`. " +
        "\nThe listing owner is notified of the review decision.",
      security: bearer,
      parameters: [idParam, docIdParam],
      requestBody: body({
        type: "object",
        required: ["decision"],
        properties: {
          decision: {
            type: "string",
            enum: ["approve", "reject"],
            description:
              "approve → doc status=approved (title_deed → listing verified). " +
              "reject → doc status=rejected, listing verificationStatus=rejected.",
          },
          note: {
            type: "string",
            maxLength: 2000,
            description: "Optional review note visible to the listing owner",
          },
        },
      }),
      responses: {
        "200": {
          description: "Document reviewed",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Document reviewed" },
                  data: {
                    type: "object",
                    description:
                      "Full listing object (verificationStatus updated)",
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "Only an administrator can review documents",
          $ref: "#/components/responses/Error",
        },
        "404": {
          description: "Listing or document not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
};
