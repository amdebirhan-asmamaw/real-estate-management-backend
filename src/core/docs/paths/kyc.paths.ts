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
          description: "Submitted",
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
      },
    },
  },
  "/kyc/documents/{docId}/url": {
    get: {
      tags: ["KYC"],
      summary: "Signed URL for one of your KYC documents",
      security: bearer,
      parameters: [
        {
          name: "docId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: { "200": { description: "Signed URL" } },
    },
  },
};
