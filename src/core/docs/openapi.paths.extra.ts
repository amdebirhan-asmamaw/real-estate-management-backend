// Additional OpenAPI path definitions for endpoints not yet documented in openapi.ts.
// Merged at runtime via Object.assign in openapi.ts.

const bearer = [{ bearerAuth: [] }];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const page = { name: "page", in: "query", schema: { type: "integer", default: 1 } };
const limit = { name: "limit", in: "query", schema: { type: "integer", default: 20 } };
const body = (schema: Record<string, unknown>) => ({
  required: true,
  content: { "application/json": { schema } },
});

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
      requestBody: body({ type: "object", required: ["token", "newPassword"], properties: { token: { type: "string" }, newPassword: { type: "string" } } }),
      responses: { "200": { description: "Password reset" }, "401": { $ref: "#/components/responses/Error" } },
    },
  },
  "/auth/profile": {
    patch: {
      tags: ["Auth"], summary: "Update caller's profile", security: bearer,
      requestBody: body({ type: "object", properties: { name: { type: "string" }, phone: { type: "string" } } }),
      responses: { "200": { description: "Profile updated" } },
    },
  },
  "/auth/wallet/challenge": {
    post: {
      tags: ["Auth"], summary: "Request nonce for wallet linking", security: bearer,
      requestBody: body({ type: "object", required: ["walletAddress"], properties: { walletAddress: { type: "string" } } }),
      responses: { "200": { description: "Challenge nonce" } },
    },
  },
  "/auth/wallet/link": {
    post: {
      tags: ["Auth"], summary: "Link wallet with signed challenge", security: bearer,
      requestBody: body({ type: "object", required: ["walletAddress", "signature"], properties: { walletAddress: { type: "string" }, signature: { type: "string" } } }),
      responses: { "200": { description: "Wallet linked" }, "409": { $ref: "#/components/responses/Error" } },
    },
  },
  "/auth/wallet": {
    delete: { tags: ["Auth"], summary: "Unlink wallet", security: bearer, responses: { "200": { description: "Wallet unlinked" } } },
  },

  // ─── Listing extras ────────────────────────────────────────────────────────
  "/listings/dashboard": {
    get: { tags: ["Listings"], summary: "Owner dashboard stats", security: bearer, responses: { "200": { description: "Dashboard stats" } } },
  },
  "/listings/{id}/photos/reorder": {
    patch: {
      tags: ["Media"], summary: "Reorder listing photos", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["order"], properties: { order: { type: "array", items: { type: "string" } } } }),
      responses: { "200": { description: "Reordered" } },
    },
  },
  "/listings/{id}/photos/cover": {
    patch: {
      tags: ["Media"], summary: "Set cover photo", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["publicId"], properties: { publicId: { type: "string" } } }),
      responses: { "200": { description: "Cover set" } },
    },
  },

  // ─── Title dispute / revoke ────────────────────────────────────────────────
  "/listings/{id}/title/dispute": {
    post: {
      tags: ["Titles"], summary: "Dispute a minted title on-chain (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["reason"], properties: { reason: { type: "string" } } }),
      responses: { "200": { description: "Title disputed, listing suspended" } },
    },
  },
  "/listings/{id}/title/clear-dispute": {
    post: {
      tags: ["Titles"], summary: "Clear title dispute (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["reason"], properties: { reason: { type: "string" } } }),
      responses: { "200": { description: "Dispute cleared, listing restored" } },
    },
  },
  "/listings/{id}/title/revoke": {
    post: {
      tags: ["Titles"], summary: "Revoke title permanently (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["reason"], properties: { reason: { type: "string" } } }),
      responses: { "200": { description: "Title revoked, listing archived" } },
    },
  },

  // ─── Admin extras ──────────────────────────────────────────────────────────
  "/admin/listings/stats": {
    get: { tags: ["Admin"], summary: "Listing stats for admin dashboard", security: bearer, responses: { "200": { description: "Stats" } } },
  },
  "/admin/users": {
    get: {
      tags: ["Admin"], summary: "List all users", security: bearer,
      parameters: [{ name: "role", in: "query", schema: { type: "string" } }, { name: "accountStatus", in: "query", schema: { type: "string" } }, page, limit],
      responses: { "200": { description: "User list" } },
    },
  },
  "/admin/users/{id}": {
    get: { tags: ["Admin"], summary: "Get user detail", security: bearer, parameters: [idParam], responses: { "200": { description: "User" }, "404": { $ref: "#/components/responses/Error" } } },
  },
  "/admin/users/{id}/suspend": {
    post: { tags: ["Admin"], summary: "Suspend user", security: bearer, parameters: [idParam], responses: { "200": { description: "Suspended" } } },
  },
  "/admin/users/{id}/reactivate": {
    post: { tags: ["Admin"], summary: "Reactivate user", security: bearer, parameters: [idParam], responses: { "200": { description: "Reactivated" } } },
  },
  "/admin/users/{id}/block": {
    post: { tags: ["Admin"], summary: "Block user permanently", security: bearer, parameters: [idParam], responses: { "200": { description: "Blocked" } } },
  },
  "/admin/admins": {
    get: { tags: ["Admin"], summary: "List admins (super_admin)", security: bearer, parameters: [page, limit], responses: { "200": { description: "Admin list" } } },
    post: {
      tags: ["Admin"], summary: "Create admin (super_admin)", security: bearer,
      requestBody: body({ type: "object", required: ["name", "email", "password"], properties: { name: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string" } } }),
      responses: { "201": { description: "Created" }, "409": { $ref: "#/components/responses/Error" } },
    },
  },
  "/admin/admins/{id}/suspend": {
    post: { tags: ["Admin"], summary: "Suspend admin (super_admin)", security: bearer, parameters: [idParam], responses: { "200": { description: "Suspended" } } },
  },
  "/admin/admins/{id}/reactivate": {
    post: { tags: ["Admin"], summary: "Reactivate admin (super_admin)", security: bearer, parameters: [idParam], responses: { "200": { description: "Reactivated" } } },
  },

  // ─── Notifications ─────────────────────────────────────────────────────────
  "/notifications": {
    get: {
      tags: ["Notifications"], summary: "List caller's notifications", security: bearer,
      parameters: [{ name: "unreadOnly", in: "query", schema: { type: "boolean" } }, page, limit],
      responses: { "200": { description: "Notifications" } },
    },
  },
  "/notifications/read-all": {
    post: { tags: ["Notifications"], summary: "Mark all as read", security: bearer, responses: { "200": { description: "Done" } } },
  },
  "/notifications/{id}/read": {
    post: { tags: ["Notifications"], summary: "Mark one as read", security: bearer, parameters: [idParam], responses: { "200": { description: "Done" } } },
  },

  // ─── Saved Searches ────────────────────────────────────────────────────────
  "/saved-searches": {
    get: { tags: ["Saved Searches"], summary: "List saved searches", security: bearer, responses: { "200": { description: "Saved searches" } } },
    post: {
      tags: ["Saved Searches"], summary: "Create a saved search", security: bearer,
      requestBody: body({ type: "object", required: ["name", "query"], properties: { name: { type: "string" }, query: { type: "object" }, alertEnabled: { type: "boolean" } } }),
      responses: { "201": { description: "Created" } },
    },
  },
  "/saved-searches/{id}": {
    parameters: [idParam],
    patch: {
      tags: ["Saved Searches"], summary: "Update saved search", security: bearer,
      requestBody: body({ type: "object", properties: { name: { type: "string" }, query: { type: "object" }, alertEnabled: { type: "boolean" } } }),
      responses: { "200": { description: "Updated" } },
    },
    delete: { tags: ["Saved Searches"], summary: "Delete saved search", security: bearer, responses: { "200": { description: "Deleted" } } },
  },

  // ─── Offers ────────────────────────────────────────────────────────────────
  "/offers": {
    post: {
      tags: ["Offers"], summary: "Submit a purchase offer (tenant)", security: bearer,
      requestBody: body({ type: "object", required: ["listingId", "amount"], properties: { listingId: { type: "string" }, amount: { type: "number" }, currency: { type: "string" }, message: { type: "string" }, expiresAt: { type: "string", format: "date-time" } } }),
      responses: { "201": { description: "Offer created" } },
    },
  },
  "/offers/mine": {
    get: { tags: ["Offers"], summary: "List sent offers", security: bearer, responses: { "200": { description: "Offers" } } },
  },
  "/offers/received": {
    get: { tags: ["Offers"], summary: "List received offers", security: bearer, responses: { "200": { description: "Offers" } } },
  },
  "/offers/{id}/respond": {
    patch: {
      tags: ["Offers"], summary: "Accept/reject/counter an offer (owner)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["action"], properties: { action: { type: "string", enum: ["accept", "reject", "counter"] }, counterAmount: { type: "number" }, responseNote: { type: "string" } } }),
      responses: { "200": { description: "Responded" } },
    },
  },
  "/offers/{id}/cancel": {
    post: { tags: ["Offers"], summary: "Cancel an offer (tenant)", security: bearer, parameters: [idParam], responses: { "200": { description: "Cancelled" } } },
  },

  // ─── Chain Transactions ────────────────────────────────────────────────────
  "/chain-transactions": {
    get: {
      tags: ["Chain Transactions"], summary: "List chain transactions (admin)", security: bearer,
      parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["pending", "mined", "failed", "stale"] } }, { name: "operation", in: "query", schema: { type: "string" } }, page, limit],
      responses: { "200": { description: "Chain transactions" } },
    },
  },
  "/chain-transactions/{id}/reconcile": {
    post: {
      tags: ["Chain Transactions"], summary: "Reconcile a transaction (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["txHash"], properties: { txHash: { type: "string" }, note: { type: "string" } } }),
      responses: { "200": { description: "Reconciled" } },
    },
  },
  "/chain-transactions/{id}/mark-stale": {
    post: {
      tags: ["Chain Transactions"], summary: "Mark transaction stale (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["reason"], properties: { reason: { type: "string" } } }),
      responses: { "200": { description: "Marked stale" } },
    },
  },

  // ─── Compliance ────────────────────────────────────────────────────────────
  "/compliance/cases": {
    get: {
      tags: ["Compliance"], summary: "List compliance cases (admin)", security: bearer,
      parameters: [{ name: "status", in: "query", schema: { type: "string" } }, page, limit],
      responses: { "200": { description: "Cases" } },
    },
  },
  "/compliance/cases/{id}": {
    patch: {
      tags: ["Compliance"], summary: "Update a case (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", properties: { status: { type: "string" }, note: { type: "string" } } }),
      responses: { "200": { description: "Updated" } },
    },
  },
  "/compliance/screenings": {
    post: {
      tags: ["Compliance"], summary: "Create screening (admin)", security: bearer,
      requestBody: body({ type: "object", required: ["userId", "type"], properties: { userId: { type: "string" }, type: { type: "string" }, notes: { type: "string" } } }),
      responses: { "201": { description: "Created" } },
    },
  },
  "/compliance/broker-licenses": {
    get: {
      tags: ["Compliance"], summary: "List broker licenses (admin)", security: bearer,
      parameters: [{ name: "status", in: "query", schema: { type: "string" } }, page, limit],
      responses: { "200": { description: "Licenses" } },
    },
    post: {
      tags: ["Compliance"], summary: "Submit broker license (owner)", security: bearer,
      requestBody: body({ type: "object", required: ["licenseNumber", "issuingAuthority", "expiresAt"], properties: { licenseNumber: { type: "string" }, issuingAuthority: { type: "string" }, expiresAt: { type: "string", format: "date" } } }),
      responses: { "201": { description: "Submitted" } },
    },
  },
  "/compliance/broker-licenses/{id}/review": {
    post: {
      tags: ["Compliance"], summary: "Review broker license (admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["approve", "reject"] }, note: { type: "string" } } }),
      responses: { "200": { description: "Reviewed" } },
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
      responses: { "200": { description: "Transactions" } },
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
          note: { type: "string" }, depositAmount: { type: "number" },
          closingChecklist: { type: "object", properties: { purchaseAgreement: { type: "boolean" }, inspection: { type: "boolean" }, financing: { type: "boolean" }, titleReview: { type: "boolean" }, settlementStatement: { type: "boolean" } } },
        },
      }),
      responses: { "200": { description: "Updated" } },
    },
  },

  // ─── Rental Applications ───────────────────────────────────────────────────
  "/rental-applications": {
    post: {
      tags: ["Rental Applications"], summary: "Submit rental application (tenant)", security: bearer,
      requestBody: body({ type: "object", required: ["listingId"], properties: { listingId: { type: "string" }, desiredStartDate: { type: "string", format: "date" }, desiredEndDate: { type: "string", format: "date" }, occupants: { type: "integer" }, monthlyIncome: { type: "number" }, employer: { type: "string" }, message: { type: "string" } } }),
      responses: { "201": { description: "Submitted" } },
    },
  },
  "/rental-applications/mine": {
    get: { tags: ["Rental Applications"], summary: "List caller's applications", security: bearer, responses: { "200": { description: "Applications" } } },
  },
  "/rental-applications/{id}": {
    get: { tags: ["Rental Applications"], summary: "Get application", security: bearer, parameters: [idParam], responses: { "200": { description: "Application" }, "404": { $ref: "#/components/responses/Error" } } },
  },
  "/rental-applications/{id}/withdraw": {
    post: { tags: ["Rental Applications"], summary: "Withdraw application (tenant)", security: bearer, parameters: [idParam], responses: { "200": { description: "Withdrawn" } } },
  },
  "/rental-applications/{id}/review": {
    patch: {
      tags: ["Rental Applications"], summary: "Review application (owner/admin)", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["screening", "approved", "rejected"] }, note: { type: "string" } } }),
      responses: { "200": { description: "Reviewed" } },
    },
  },
  "/rental-applications/{id}/screening": {
    patch: {
      tags: ["Rental Applications"], summary: "Update screening results", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["pending", "passed", "failed", "manual_review"] }, provider: { type: "string" }, reference: { type: "string" }, score: { type: "number" }, notes: { type: "string" } } }),
      responses: { "200": { description: "Updated" } },
    },
  },
  "/rental-applications/{id}/appointment": {
    patch: {
      tags: ["Rental Applications"], summary: "Update viewing appointment", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["requested", "scheduled", "rescheduled", "cancelled", "completed"] }, scheduledFor: { type: "string", format: "date-time" }, locationNote: { type: "string" }, note: { type: "string" } } }),
      responses: { "200": { description: "Updated" } },
    },
  },
  "/rental-applications/{id}/lease": {
    post: {
      tags: ["Rental Applications"], summary: "Create lease from approved application", security: bearer,
      parameters: [idParam],
      requestBody: body({ type: "object", required: ["monthlyRent", "depositAmount", "startDate", "endDate"], properties: { monthlyRent: { type: "number" }, depositAmount: { type: "number" }, currency: { type: "string" }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" }, terms: { type: "string" } } }),
      responses: { "201": { description: "Lease created" } },
    },
  },
};
