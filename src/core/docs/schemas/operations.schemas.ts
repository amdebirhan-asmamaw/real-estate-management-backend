// Response payload schemas for the operational modules: purchase transactions,
// compliance, chain transactions, and rental yield.
// Aligned to: purchaseTransaction.model.ts, compliance.model.ts,
// chainTransaction.model.ts, maintenanceRecord.model.ts, rentalYield.service.ts.

export const operationsSchemas: Record<string, unknown> = {
  // ─── Purchase Transactions ──────────────────────────────────────────────────
  PurchaseEscrow: {
    type: "object",
    properties: {
      escrowId: { type: "string", nullable: true },
      contractAddress: { type: "string", nullable: true },
      token: {
        type: "string",
        nullable: true,
        description: "ERC-20 token address",
      },
      state: {
        type: "string",
        enum: ["none", "funded", "released", "refunded"],
      },
      fundTxHash: { type: "string", nullable: true },
      settleTxHash: { type: "string", nullable: true },
      buyerWallet: { type: "string", nullable: true },
      sellerWallet: { type: "string", nullable: true },
    },
  },
  PurchaseTimelineEvent: {
    type: "object",
    properties: {
      status: { type: "string" },
      note: { type: "string", nullable: true },
      actor: { type: "string", nullable: true, description: "User ObjectId" },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  PurchaseTransaction: {
    type: "object",
    properties: {
      id: { type: "string" },
      listing: {
        type: "string",
        description: "Listing ObjectId (or populated summary)",
      },
      offer: { type: "string", description: "Offer ObjectId" },
      seller: { type: "string", description: "Seller (owner) ObjectId" },
      buyer: { type: "string", description: "Buyer ObjectId" },
      amount: { type: "number", description: "Sale price" },
      currency: { type: "string" },
      status: {
        type: "string",
        enum: [
          "offer_accepted",
          "deposit_pending",
          "deposit_received",
          "closing_review",
          "title_transfer_pending",
          "completed",
          "cancelled",
          "disputed",
        ],
      },
      depositAmount: { type: "number", nullable: true },
      escrow: { $ref: "#/components/schemas/PurchaseEscrow" },
      termsHash: { type: "string", nullable: true },
      titleTransferTxHash: {
        type: "string",
        nullable: true,
        description:
          "Tx hash of the on-chain title transfer to the buyer on completion",
      },
      closingChecklist: {
        type: "object",
        properties: {
          purchaseAgreement: { type: "boolean" },
          inspection: { type: "boolean" },
          financing: { type: "boolean" },
          titleReview: { type: "boolean" },
          settlementStatement: { type: "boolean" },
        },
      },
      dispute: {
        type: "object",
        nullable: true,
        properties: {
          openedBy: { type: "string", nullable: true },
          openedAt: { type: "string", format: "date-time", nullable: true },
          reason: { type: "string", nullable: true },
          note: { type: "string", nullable: true },
        },
      },
      timeline: {
        type: "array",
        items: { $ref: "#/components/schemas/PurchaseTimelineEvent" },
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },

  // ─── Compliance ─────────────────────────────────────────────────────────────
  ComplianceNote: {
    type: "object",
    properties: {
      id: { type: "string" },
      author: { type: "string", description: "Admin User ObjectId" },
      body: { type: "string", maxLength: 4000 },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  ComplianceCase: {
    type: "object",
    properties: {
      id: { type: "string" },
      type: {
        type: "string",
        enum: [
          "kyc",
          "ownership_document",
          "listing",
          "offer",
          "lease",
          "title",
          "broker_license",
        ],
      },
      status: {
        type: "string",
        enum: ["open", "under_review", "resolved", "dismissed"],
      },
      severity: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
      },
      subjectUser: {
        type: "string",
        nullable: true,
        description: "User ObjectId",
      },
      targetType: { type: "string", nullable: true },
      targetId: { type: "string", nullable: true },
      title: { type: "string", maxLength: 200 },
      description: { type: "string", nullable: true, maxLength: 4000 },
      assignedTo: {
        type: "string",
        nullable: true,
        description: "Admin User ObjectId",
      },
      resolution: { type: "string", nullable: true, maxLength: 4000 },
      metadata: { type: "object", additionalProperties: true, nullable: true },
      notes: {
        type: "array",
        items: { $ref: "#/components/schemas/ComplianceNote" },
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  Screening: {
    type: "object",
    properties: {
      id: { type: "string" },
      subjectUser: { type: "string", description: "Screened user ObjectId" },
      provider: { type: "string", enum: ["manual", "mock"] },
      status: {
        type: "string",
        enum: ["clear", "potential_match", "confirmed_match"],
      },
      categories: { type: "array", items: { type: "string" } },
      reference: { type: "string", nullable: true },
      rawResult: { type: "object", additionalProperties: true, nullable: true },
      reviewedBy: { type: "string", nullable: true },
      reviewedAt: { type: "string", format: "date-time", nullable: true },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  BrokerLicense: {
    type: "object",
    properties: {
      id: { type: "string" },
      owner: { type: "string", description: "Owner (property_owner) ObjectId" },
      licenseNumber: { type: "string" },
      jurisdiction: { type: "string" },
      holderName: { type: "string" },
      expiresAt: { type: "string", format: "date-time", nullable: true },
      documentPublicId: { type: "string", nullable: true },
      documentHash: { type: "string", nullable: true },
      status: {
        type: "string",
        enum: ["pending", "approved", "rejected", "expired"],
      },
      reviewNote: { type: "string", nullable: true },
      reviewedBy: { type: "string", nullable: true },
      reviewedAt: { type: "string", format: "date-time", nullable: true },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  RiskScore: {
    type: "object",
    properties: {
      id: { type: "string" },
      subjectType: {
        type: "string",
        enum: ["user", "listing", "offer", "lease", "title"],
      },
      subjectId: { type: "string" },
      score: { type: "number", minimum: 0, maximum: 100 },
      level: { type: "string", enum: ["low", "medium", "high", "critical"] },
      reasons: { type: "array", items: { type: "string" } },
      metadata: { type: "object", additionalProperties: true, nullable: true },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },

  // ─── Chain Transactions ─────────────────────────────────────────────────────
  ChainTransaction: {
    type: "object",
    properties: {
      id: { type: "string" },
      operation: {
        type: "string",
        enum: [
          "title.mint",
          "title.dispute",
          "title.clear_dispute",
          "title.revoke",
          "title.transfer",
          "lease_escrow.open_and_fund",
          "lease_escrow.activate",
          "lease_escrow.cancel",
          "lease_escrow.release_deposit",
          "lease_escrow.refund_deposit",
          "sale_escrow.open_and_fund",
          "sale_escrow.release",
          "sale_escrow.refund",
        ],
      },
      status: {
        type: "string",
        enum: [
          "submitted",
          "pending",
          "mined",
          "confirmed",
          "reverted",
          "stale",
          "reconciled",
          "failed",
        ],
      },
      targetType: {
        type: "string",
        enum: ["listing", "lease", "purchase_transaction"],
      },
      targetId: { type: "string" },
      contractAddress: { type: "string", nullable: true },
      txHash: { type: "string", nullable: true },
      errorMessage: { type: "string", nullable: true },
      blockNumber: { type: "integer", nullable: true },
      confirmedAt: { type: "string", format: "date-time", nullable: true },
      reconciledAt: { type: "string", format: "date-time", nullable: true },
      staleAt: { type: "string", format: "date-time", nullable: true },
      metadata: { type: "object", additionalProperties: true, nullable: true },
      createdBy: { type: "string", description: "Actor User ObjectId" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },

  // ─── Audit ──────────────────────────────────────────────────────────────────
  AuditLog: {
    type: "object",
    properties: {
      id: { type: "string" },
      actor: { type: "string", description: "Acting User ObjectId" },
      actorRole: { type: "string" },
      action: {
        type: "string",
        description:
          "Action name from the audit actions enum (e.g. lease.activated)",
      },
      targetType: {
        type: "string",
        enum: [
          "listing",
          "user",
          "lease",
          "admin",
          "compliance",
          "purchase_transaction",
          "rental_application",
        ],
      },
      targetId: { type: "string" },
      metadata: { type: "object", additionalProperties: true, nullable: true },
      createdAt: { type: "string", format: "date-time" },
    },
  },

  // ─── Rental Yield ───────────────────────────────────────────────────────────
  MaintenanceRecord: {
    type: "object",
    properties: {
      id: { type: "string" },
      listing: { type: "string", description: "Listing ObjectId" },
      lease: {
        type: "string",
        nullable: true,
        description: "Optional lease ObjectId",
      },
      owner: { type: "string", description: "Owner ObjectId" },
      type: {
        type: "string",
        enum: [
          "maintenance",
          "repair",
          "utility",
          "tax",
          "insurance",
          "management",
          "other",
        ],
      },
      amount: { type: "number", minimum: 0 },
      currency: { type: "string" },
      incurredAt: { type: "string", format: "date-time" },
      note: { type: "string", nullable: true },
      createdBy: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  YieldSummary: {
    type: "object",
    description: "Trailing-12-month rental yield summary for a listing.",
    properties: {
      listingId: { type: "string" },
      currency: { type: "string" },
      period: {
        type: "object",
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
        },
      },
      grossRent: {
        type: "number",
        description: "Pro-rated rent over the period",
      },
      maintenanceCost: { type: "number" },
      netIncome: { type: "number", description: "grossRent - maintenanceCost" },
      occupiedDays: { type: "integer" },
      occupancyRate: { type: "number", minimum: 0, maximum: 1 },
      annualizedYield: {
        type: "number",
        nullable: true,
        description: "netIncome / listing.price * 100; null if no sale price",
      },
      escrowHistory: {
        type: "array",
        items: {
          type: "object",
          properties: {
            leaseId: { type: "string" },
            status: { type: "string" },
            escrowState: { type: "string" },
            fundTxHash: { type: "string", nullable: true },
            settleTxHash: { type: "string", nullable: true },
          },
        },
      },
    },
  },
};
