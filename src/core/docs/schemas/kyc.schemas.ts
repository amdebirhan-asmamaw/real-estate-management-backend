// KYC-related schemas.

export const kycSchemas: Record<string, unknown> = {
  KycSummary: {
    type: "object",
    properties: {
      kycStatus: {
        type: "string",
        enum: ["not_started", "pending", "verified", "rejected"],
      },
      accountStatus: { type: "string" },
      reviewNote: { type: "string" },
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
