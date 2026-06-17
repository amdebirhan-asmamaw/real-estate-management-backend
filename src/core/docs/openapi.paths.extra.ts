// Additional OpenAPI path definitions for endpoints not yet documented in openapi.ts.
// Merged at runtime via Object.assign in openapi.ts.
//
// Request bodies and query params below mirror the Joi validators in each module's
// *.validation.ts — keep them in sync when the validators change.

const bearer = [{ bearerAuth: [] }];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const page = { name: "page", in: "query", schema: { type: "integer", default: 1, minimum: 1 } };
const limit = {
  name: "limit",
  in: "query",
  schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
};
const body = (schema: Record<string, unknown>, required = true) => ({
  required,
  content: { "application/json": { schema } },
});
const ok = (description: string) => ({ "200": { description } });

export const extraPaths: Record<string, unknown> = {
  // ─── Auth ──────────────────────────────────────────────────────────────────
  "/auth/forgot-password": {
    post: {
      tags: ["Auth"], summary: "Request a password reset email",
      requestBody: body({ type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } }),
      responses: { "200": { description: "Reset link sent (if account exists)" } },
    },
  },
  "/auth/reset-password": {
    post: {
      tags: ["Auth"], summary: "Reset password with token",
      requestBody: body({
        type: "object",
        required: ["token", "newPassword"],
        properties: {
          token: { type: "string" },
          newPassword: { type: "string", minLength: 8, description: "≥ 8 chars, 1 uppercase, 1 number" },
        },
      }),
      responses: { "200": { description: "Password reset" }, "401": { $ref: "#/components/responses/Error" } },
    },
  },
  "/auth/profile": {
    patch: {
      tags: ["Auth"], summary: "Update caller's profile", security: bearer,
      description: "At least one field must be provided.",
      requestBody: body({
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100 },
          phone: { type: "string", maxLength: 20, nullable: true },
          profileImage: { type: "string", format: "uri", nullable: true },
        },
      }),
      responses: {
        "200": { description: "Profile updated", content: { "application/json": { schema: { $ref: "#/components/schemas/AuthUser" } } } },
        "401": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/auth/wallet/challenge": {
    post: {
      tags: ["Auth"], summary: "Request nonce for wallet linking", security: bearer,
      requestBody: body({
        type: "object",
        required: ["walletAddress"],
        properties: { walletAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$", description: "EVM address" } },
      }),
      responses: { "200": { description: "Challenge nonce to sign" } },
    },
  },
  "/auth/wallet/link": {
    post: {
      tags: ["Auth"], summary: "Link wallet with signed challenge", security: bearer,
      requestBody: body({
        type: "object",
        required: ["walletAddress", "signature"],
        properties: {
          walletAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          signature: { type: "string", description: "Signature over the challenge nonce" },
        },
      }),
      responses: { "200": { description: "Wallet linked" }, "409": { $ref: "#/components/responses/Error" } },
    },
  },
  "/auth/wallet": {
    delete: { tags: ["Auth"], summary: "Unlink wallet", security: bearer, responses: ok("Wallet unlinked") },
  },

  // ─── Listing extras ────────────────────────────────────────────────────────
  "/listings/dashboard": {
    get: { tags: ["Listings"], summary: "Owner dashboard stats", security: bearer, responses: ok("Dashboard stats") },
  },
  "/listings/{id}/photos/reorder": {
    patch: {
      tags: ["Media"], summary: "Reorder listing photos", security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["order"],
        properties: { order: { type: "array", minItems: 1, items: { type: "string" }, description: "publicIds in the desired order" } },
      }),
      responses: ok("Reordered"),
    },
  },
  "/listings/{id}/photos/cover": {
    patch: {
      tags: ["Media"], summary: "Set cover photo", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["publicId"], properties: { publicId: { type: "string" } } }),
      responses: ok("Cover set"),
    },
  },

  // ─── Title dispute / revoke ────────────────────────────────────────────────
  // All three accept the same body: a required free-text reason (max 2000 chars).
  "/listings/{id}/title/dispute": {
    post: {
      tags: ["Titles"], summary: "Dispute a minted title on-chain (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 2000 } } }),
      responses: { "200": { description: "Title disputed, listing suspended" }, "409": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } },
    },
  },
  "/listings/{id}/title/clear-dispute": {
    post: {
      tags: ["Titles"], summary: "Clear title dispute (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 2000 } } }),
      responses: { "200": { description: "Dispute cleared, listing restored" }, "409": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } },
    },
  },
  "/listings/{id}/title/revoke": {
    post: {
      tags: ["Titles"], summary: "Revoke title permanently (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 2000 } } }),
      responses: { "200": { description: "Title revoked, listing archived" }, "409": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } },
    },
  },

  // ─── Admin extras ──────────────────────────────────────────────────────────
  "/admin/listings/stats": {
    get: { tags: ["Admin"], summary: "Listing stats for admin dashboard", security: bearer, responses: ok("Stats") },
  },
  "/admin/users": {
    get: {
      tags: ["Admin"], summary: "List all users", security: bearer,
      parameters: [
        { name: "search", in: "query", schema: { type: "string", maxLength: 100 }, description: "Matches name or email" },
        { name: "role", in: "query", schema: { type: "string", enum: ["super_admin", "admin", "property_owner", "tenant"] } },
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "active", "suspended", "blocked", "rejected"] } },
        { name: "kycStatus", in: "query", schema: { type: "string", enum: ["not_started", "pending", "under_review", "verified", "rejected", "expired"] } },
        { name: "walletStatus", in: "query", schema: { type: "string", enum: ["unlinked", "pending_signature", "linked", "revoked"] } },
        { name: "sort", in: "query", schema: { type: "string", enum: ["createdAt", "-createdAt", "name", "-name", "email", "-email"], default: "-createdAt" } },
        page, limit,
      ],
      responses: ok("User list"),
    },
  },
  "/admin/users/{id}": {
    get: { tags: ["Admin"], summary: "Get user detail", security: bearer, parameters: [idParam], responses: { "200": { description: "User" }, "404": { $ref: "#/components/responses/Error" } } },
  },
  "/admin/users/{id}/suspend": {
    post: { tags: ["Admin"], summary: "Suspend user", security: bearer, parameters: [idParam], responses: ok("Suspended") },
  },
  "/admin/users/{id}/reactivate": {
    post: { tags: ["Admin"], summary: "Reactivate user", security: bearer, parameters: [idParam], responses: ok("Reactivated") },
  },
  "/admin/users/{id}/block": {
    post: { tags: ["Admin"], summary: "Block user permanently", security: bearer, parameters: [idParam], responses: ok("Blocked") },
  },
  "/admin/users/{id}/wallet/revoke": {
    post: { tags: ["Admin"], summary: "Revoke user wallet (admin)", security: bearer, parameters: [idParam], responses: ok("Wallet revoked") },
  },
  "/admin/admins": {
    get: {
      tags: ["Admin"], summary: "List admins (super_admin)", security: bearer,
      parameters: [
        { name: "search", in: "query", schema: { type: "string", maxLength: 100 } },
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "active", "suspended", "blocked", "rejected"] } },
        page, limit,
      ],
      responses: ok("Admin list"),
    },
    post: {
      tags: ["Admin"], summary: "Create admin (super_admin)", security: bearer,
      requestBody: body({
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, description: "≥ 8 chars, 1 uppercase, 1 number" },
          phone: { type: "string", maxLength: 20, nullable: true },
        },
      }),
      responses: { "201": { description: "Created" }, "409": { $ref: "#/components/responses/Error" } },
    },
  },
  "/admin/admins/{id}/suspend": {
    post: { tags: ["Admin"], summary: "Suspend admin (super_admin)", security: bearer, parameters: [idParam], responses: ok("Suspended") },
  },
  "/admin/admins/{id}/reactivate": {
    post: { tags: ["Admin"], summary: "Reactivate admin (super_admin)", security: bearer, parameters: [idParam], responses: ok("Reactivated") },
  },

  // ─── Notifications ─────────────────────────────────────────────────────────
  "/notifications": {
    get: {
      tags: ["Notifications"], summary: "List caller's notifications", security: bearer,
      parameters: [{ name: "unreadOnly", in: "query", schema: { type: "boolean", default: false } }, page, limit],
      responses: ok("Notifications"),
    },
  },
  "/notifications/read-all": {
    post: { tags: ["Notifications"], summary: "Mark all as read", security: bearer, responses: ok("Done") },
  },
  "/notifications/{id}/read": {
    post: { tags: ["Notifications"], summary: "Mark one as read", security: bearer, parameters: [idParam], responses: ok("Done") },
  },

  // ─── Saved Searches ────────────────────────────────────────────────────────
  "/saved-searches": {
    get: { tags: ["Saved Searches"], summary: "List saved searches", security: bearer, responses: ok("Saved searches") },
    post: {
      tags: ["Saved Searches"], summary: "Create a saved search", security: bearer,
      requestBody: body({
        type: "object",
        required: ["name", "query"],
        properties: {
          name: { type: "string", maxLength: 120 },
          query: { $ref: "#/components/schemas/SavedSearchQuery" },
          alertEnabled: { type: "boolean", default: false },
        },
      }),
      responses: { "201": { description: "Created" } },
    },
  },
  "/saved-searches/{id}": {
    parameters: [idParam],
    patch: {
      tags: ["Saved Searches"], summary: "Update saved search", security: bearer,
      description: "At least one field must be provided.",
      requestBody: body({
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string", maxLength: 120 },
          query: { $ref: "#/components/schemas/SavedSearchQuery" },
          alertEnabled: { type: "boolean" },
        },
      }),
      responses: ok("Updated"),
    },
    delete: { tags: ["Saved Searches"], summary: "Delete saved search", security: bearer, responses: ok("Deleted") },
  },

  // ─── Offers ────────────────────────────────────────────────────────────────
  "/offers": {
    post: {
      tags: ["Offers"], summary: "Submit a purchase offer (tenant)", security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId", "amount"],
        properties: {
          listingId: { type: "string", description: "24-char hex Mongo ObjectId" },
          amount: { type: "number", exclusiveMinimum: 0 },
          currency: { type: "string", minLength: 3, maxLength: 3, default: "USD" },
          message: { type: "string", maxLength: 2000 },
          expiresAt: { type: "string", format: "date-time", description: "Must be in the future" },
        },
      }),
      responses: { "201": { description: "Offer created" } },
    },
  },
  "/offers/mine": {
    get: { tags: ["Offers"], summary: "List sent offers", security: bearer, responses: ok("Offers") },
  },
  "/offers/received": {
    get: { tags: ["Offers"], summary: "List received offers", security: bearer, responses: ok("Offers") },
  },
  "/offers/{id}/respond": {
    patch: {
      tags: ["Offers"], summary: "Accept/reject/counter an offer (owner)", security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["accept", "reject", "counter"] },
          counterAmount: { type: "number", exclusiveMinimum: 0, description: "Required when action=counter" },
          responseNote: { type: "string", maxLength: 2000 },
        },
      }),
      responses: ok("Responded"),
    },
  },
  "/offers/{id}/cancel": {
    post: { tags: ["Offers"], summary: "Cancel an offer (tenant)", security: bearer, parameters: [idParam], responses: ok("Cancelled") },
  },

  // ─── Chain Transactions ────────────────────────────────────────────────────
  "/chain-transactions": {
    get: {
      tags: ["Chain Transactions"], summary: "List chain transactions (admin)", security: bearer,
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["submitted", "pending", "mined", "confirmed", "reverted", "stale", "reconciled", "failed"] } },
        { name: "operation", in: "query", schema: { type: "string", enum: ["title.mint", "lease_escrow.open_and_fund", "lease_escrow.activate", "lease_escrow.cancel", "lease_escrow.release_deposit", "lease_escrow.refund_deposit"] } },
        { name: "targetType", in: "query", schema: { type: "string", enum: ["listing", "lease"] } },
        { name: "targetId", in: "query", schema: { type: "string", description: "24-char hex Mongo ObjectId" } },
        page, limit,
      ],
      responses: ok("Chain transactions"),
    },
  },
  "/chain-transactions/{id}/reconcile": {
    post: {
      tags: ["Chain Transactions"], summary: "Reconcile a transaction (admin)", security: bearer,
      description: "Re-reads the receipt from chain and updates status. Body is optional.",
      parameters: [idParam],
      requestBody: body({
        type: "object",
        properties: {
          confirmations: { type: "integer", minimum: 1, maximum: 128, default: 1, description: "Confirmations required to treat as confirmed" },
        },
      }, false),
      responses: ok("Reconciled"),
    },
  },
  "/chain-transactions/{id}/mark-stale": {
    post: {
      tags: ["Chain Transactions"], summary: "Mark transaction stale (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        properties: { reason: { type: "string", maxLength: 1000, default: "Transaction exceeded reconciliation window" } },
      }, false),
      responses: ok("Marked stale"),
    },
  },

  // ─── Compliance ────────────────────────────────────────────────────────────
  "/compliance/cases": {
    get: {
      tags: ["Compliance"], summary: "List compliance cases (admin)", security: bearer,
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["open", "under_review", "resolved", "dismissed"] } },
        { name: "severity", in: "query", schema: { type: "string", enum: ["low", "medium", "high", "critical"] } },
        { name: "type", in: "query", schema: { type: "string", enum: ["kyc", "ownership_document", "listing", "offer", "lease", "title", "broker_license"] } },
        { name: "subjectUser", in: "query", schema: { type: "string", description: "24-char hex Mongo ObjectId" } },
        page, limit,
      ],
      responses: ok("Cases"),
    },
  },
  "/compliance/cases/{id}": {
    patch: {
      tags: ["Compliance"], summary: "Update a case (admin)", security: bearer,
      description: "At least one field must be provided.",
      parameters: [idParam],
      requestBody: body({
        type: "object",
        minProperties: 1,
        properties: {
          status: { type: "string", enum: ["open", "under_review", "resolved", "dismissed"] },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          assignedTo: { type: "string", nullable: true, description: "24-char hex Mongo ObjectId of an admin, or null to unassign" },
          resolution: { type: "string", maxLength: 4000 },
          note: { type: "string", maxLength: 4000 },
        },
      }),
      responses: ok("Updated"),
    },
  },
  "/compliance/screenings": {
    post: {
      tags: ["Compliance"], summary: "Create screening (admin)", security: bearer,
      requestBody: body({
        type: "object",
        required: ["subjectUser", "status"],
        properties: {
          subjectUser: { type: "string", description: "24-char hex Mongo ObjectId of the screened user" },
          provider: { type: "string", enum: ["manual", "mock"], default: "manual" },
          status: { type: "string", enum: ["clear", "potential_match", "confirmed_match"] },
          categories: { type: "array", items: { type: "string", maxLength: 120 }, default: [] },
          reference: { type: "string", maxLength: 200 },
          rawResult: { type: "object", additionalProperties: true, description: "Provider's raw response payload" },
        },
      }),
      responses: { "201": { description: "Created" } },
    },
  },
  "/compliance/broker-licenses": {
    get: {
      tags: ["Compliance"], summary: "List broker licenses (admin)", security: bearer,
      parameters: [
        { name: "owner", in: "query", schema: { type: "string", description: "24-char hex Mongo ObjectId" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected", "expired"] } },
        page, limit,
      ],
      responses: ok("Licenses"),
    },
    post: {
      tags: ["Compliance"], summary: "Submit broker license (owner)", security: bearer,
      requestBody: body({
        type: "object",
        required: ["licenseNumber", "jurisdiction", "holderName"],
        properties: {
          licenseNumber: { type: "string", maxLength: 120 },
          jurisdiction: { type: "string", maxLength: 120 },
          holderName: { type: "string", maxLength: 160 },
          expiresAt: { type: "string", format: "date-time" },
          documentPublicId: { type: "string", maxLength: 500 },
          documentHash: { type: "string", description: "Hex, 32–128 chars" },
        },
      }),
      responses: { "201": { description: "Submitted" } },
    },
  },
  "/compliance/broker-licenses/{id}/review": {
    post: {
      tags: ["Compliance"], summary: "Review broker license (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["decision"],
        properties: { decision: { type: "string", enum: ["approve", "reject", "expire"] }, note: { type: "string", maxLength: 2000 } },
      }),
      responses: ok("Reviewed"),
    },
  },

  // ─── Purchase Transactions ─────────────────────────────────────────────────
  "/purchase-transactions": {
    get: {
      tags: ["Purchase Transactions"], summary: "List purchase transactions", security: bearer,
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["offer_accepted", "deposit_pending", "deposit_received", "closing_review", "title_transfer_pending", "completed", "cancelled", "disputed"] } },
        { name: "role", in: "query", schema: { type: "string", enum: ["buyer", "seller"] } },
        page, limit,
      ],
      responses: ok("Transactions"),
    },
  },
  "/purchase-transactions/{id}": {
    get: { tags: ["Purchase Transactions"], summary: "Get transaction", security: bearer, parameters: [idParam], responses: { "200": { description: "Transaction" }, "404": { $ref: "#/components/responses/Error" } } },
  },
  "/purchase-transactions/{id}/status": {
    patch: {
      tags: ["Purchase Transactions"], summary: "Update transaction status (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object", required: ["status"],
        properties: {
          status: { type: "string", enum: ["deposit_pending", "deposit_received", "closing_review", "title_transfer_pending", "completed", "cancelled", "disputed"] },
          note: { type: "string", maxLength: 2000 }, depositAmount: { type: "number", minimum: 0 },
          closingChecklist: { type: "object", properties: { purchaseAgreement: { type: "boolean" }, inspection: { type: "boolean" }, financing: { type: "boolean" }, titleReview: { type: "boolean" }, settlementStatement: { type: "boolean" } } },
        },
      }),
      responses: ok("Updated"),
    },
  },

  // ─── Rental Applications ───────────────────────────────────────────────────
  "/rental-applications": {
    post: {
      tags: ["Rental Applications"], summary: "Submit rental application (tenant)", security: bearer,
      requestBody: body({
        type: "object",
        required: ["listingId"],
        properties: {
          listingId: { type: "string", description: "24-char hex Mongo ObjectId" },
          desiredStartDate: { type: "string", format: "date" },
          desiredEndDate: { type: "string", format: "date", description: "Must be after desiredStartDate" },
          occupants: { type: "integer", minimum: 1, maximum: 50 },
          monthlyIncome: { type: "number", minimum: 0 },
          employer: { type: "string", maxLength: 200 },
          message: { type: "string", maxLength: 4000 },
        },
      }),
      responses: { "201": { description: "Submitted" } },
    },
  },
  "/rental-applications/mine": {
    get: { tags: ["Rental Applications"], summary: "List caller's applications", security: bearer, responses: ok("Applications") },
  },
  "/rental-applications/{id}": {
    get: { tags: ["Rental Applications"], summary: "Get application", security: bearer, parameters: [idParam], responses: { "200": { description: "Application" }, "404": { $ref: "#/components/responses/Error" } } },
  },
  "/rental-applications/{id}/withdraw": {
    post: { tags: ["Rental Applications"], summary: "Withdraw application (tenant)", security: bearer, parameters: [idParam], responses: ok("Withdrawn") },
  },
  "/rental-applications/{id}/review": {
    patch: {
      tags: ["Rental Applications"], summary: "Review application (owner/admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["screening", "approved", "rejected"] }, note: { type: "string", maxLength: 2000 } } }),
      responses: ok("Reviewed"),
    },
  },
  "/rental-applications/{id}/screening": {
    patch: {
      tags: ["Rental Applications"], summary: "Update screening results", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["pending", "passed", "failed", "manual_review"] }, provider: { type: "string", maxLength: 100 }, reference: { type: "string", maxLength: 200 }, score: { type: "number", minimum: 0, maximum: 1000 }, notes: { type: "string", maxLength: 2000 } } }),
      responses: ok("Updated"),
    },
  },
  "/rental-applications/{id}/appointment": {
    patch: {
      tags: ["Rental Applications"], summary: "Update viewing appointment", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["requested", "scheduled", "rescheduled", "cancelled", "completed"] }, scheduledFor: { type: "string", format: "date-time" }, locationNote: { type: "string", maxLength: 500 }, note: { type: "string", maxLength: 2000 } } }),
      responses: ok("Updated"),
    },
  },
  "/rental-applications/{id}/lease": {
    post: {
      tags: ["Rental Applications"], summary: "Create lease from approved application", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["monthlyRent", "depositAmount", "startDate", "endDate"], properties: { monthlyRent: { type: "number", minimum: 0 }, depositAmount: { type: "number", minimum: 0 }, currency: { type: "string", default: "USD" }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date", description: "Must be after startDate" }, terms: { type: "string", maxLength: 20000 } } }),
      responses: { "201": { description: "Lease created" } },
    },
  },
};
