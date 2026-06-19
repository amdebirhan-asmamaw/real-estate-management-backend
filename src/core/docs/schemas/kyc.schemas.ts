// KYC-related schemas.

export const kycSchemas: Record<string, unknown> = {
  KycSummary: {
    type: "object",
    properties: {
      kycStatus: {
        type: "string",
        enum: [
          "not_started",
          "pending",
          "under_review",
          "verified",
          "rejected",
          "expired",
        ],
      },
      accountStatus: { type: "string" },
      reviewNote: { type: "string", nullable: true },
      verifiedAt: { type: "string", format: "date-time", nullable: true },
      expiresAt: { type: "string", format: "date-time", nullable: true },
      documents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: {
              type: "string",
              enum: ["national_id", "passport", "drivers_license", "other"],
            },
            status: {
              type: "string",
              enum: ["pending", "approved", "rejected"],
            },
            hash: { type: "string" },
            uploadedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
};
