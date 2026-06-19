// Lease-related schemas: Lease, CreateLeaseInput, DisputeResolveInput, EscrowInfo.

export const leaseSchemas: Record<string, unknown> = {
  Lease: {
    type: "object",
    properties: {
      id: { type: "string" },
      listing: { type: "string" },
      landlord: { type: "string" },
      tenant: { type: "string" },
      status: {
        type: "string",
        enum: [
          "draft",
          "proposed",
          "funded",
          "active",
          "completed",
          "terminated",
          "cancelled",
          "disputed",
        ],
      },
      monthlyRent: { type: "number" },
      depositAmount: { type: "number" },
      currency: { type: "string", example: "USDC" },
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
      terms: { type: "string" },
      escrowTxHash: { type: "string", nullable: true },
      disputeNote: { type: "string", nullable: true },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  CreateLeaseInput: {
    type: "object",
    required: [
      "listingId",
      "tenantId",
      "monthlyRent",
      "depositAmount",
      "startDate",
      "endDate",
    ],
    properties: {
      listingId: {
        type: "string",
        description: "24-char hex Mongo ObjectId of the listing",
      },
      tenantId: {
        type: "string",
        description: "24-char hex Mongo ObjectId of the tenant user",
      },
      monthlyRent: { type: "number", minimum: 0 },
      depositAmount: { type: "number", minimum: 0 },
      currency: {
        type: "string",
        default: "USD",
        description: "Uppercased; defaults to USD when omitted",
      },
      startDate: { type: "string", format: "date" },
      endDate: {
        type: "string",
        format: "date",
        description: "Must be after startDate",
      },
      terms: { type: "string", maxLength: 20000 },
    },
  },
  DisputeResolveInput: {
    type: "object",
    required: ["decision"],
    properties: {
      decision: {
        type: "string",
        enum: ["release_deposit", "refund_deposit", "cancel"],
      },
      note: { type: "string" },
    },
  },
  EscrowInfo: {
    type: "object",
    properties: {
      leaseId: { type: "string" },
      contractAddress: { type: "string" },
      balance: {
        type: "string",
        description: "On-chain token balance (wei string)",
      },
      status: { type: "string", description: "On-chain escrow state" },
      verified: {
        type: "boolean",
        description: "true when on-chain state matches DB record",
      },
    },
  },
};
