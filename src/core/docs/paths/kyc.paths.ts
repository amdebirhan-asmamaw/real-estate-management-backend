// KYC paths: document submission, status, signed URLs.

import { bearer, envelope } from "../_helpers";

export const kycPaths: Record<string, unknown> = {
  "/kyc/documents": {
    post: {
      tags: ["KYC"],
      summary: "Submit private KYC documents",
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
                  enum: ["national_id", "passport", "drivers_license", "other"],
                },
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
        "201": {
          description: "Submitted (status set to pending or resubmitted)",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/KycSummary"),
            },
          },
        },
        "400": { description: "No files uploaded" },
        "401": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/kyc/me": {
    get: {
      tags: ["KYC"],
      summary: "Own KYC status and documents",
      security: bearer,
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/KycSummary"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/kyc/documents/{docId}/url": {
    get: {
      tags: ["KYC"],
      summary: "Signed URL for one of your KYC documents",
      description:
        "Returns a short-lived signed Cloudinary URL for the caller's own private KYC document.",
      security: bearer,
      parameters: [
        {
          name: "docId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": {
          description: "Signed URL",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: { url: { type: "string", format: "uri" } },
                  },
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
