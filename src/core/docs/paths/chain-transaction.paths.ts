// Chain transaction paths.

import { bearer, body, ok, idParam, page, limit } from "../_helpers";

export const chainTransactionPaths: Record<string, unknown> = {
  "/chain-transactions": {
    get: {
      tags: ["Chain Transactions"],
      summary: "List chain transactions (admin)",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          schema: {
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
        },
        {
          name: "operation",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "title.mint",
              "lease_escrow.open_and_fund",
              "lease_escrow.activate",
              "lease_escrow.cancel",
              "lease_escrow.release_deposit",
              "lease_escrow.refund_deposit",
            ],
          },
        },
        {
          name: "targetType",
          in: "query",
          schema: { type: "string", enum: ["listing", "lease"] },
        },
        {
          name: "targetId",
          in: "query",
          schema: { type: "string", description: "24-char hex Mongo ObjectId" },
        },
        page,
        limit,
      ],
      responses: ok("Chain transactions"),
    },
  },
  "/chain-transactions/{id}/reconcile": {
    post: {
      tags: ["Chain Transactions"],
      summary: "Reconcile a transaction (admin)",
      security: bearer,
      description:
        "Re-reads the receipt from chain and updates status. Body is optional.",
      parameters: [idParam],
      requestBody: body(
        {
          type: "object",
          properties: {
            confirmations: {
              type: "integer",
              minimum: 1,
              maximum: 128,
              default: 1,
              description: "Confirmations required to treat as confirmed",
            },
          },
        },
        false,
      ),
      responses: ok("Reconciled"),
    },
  },
  "/chain-transactions/{id}/mark-stale": {
    post: {
      tags: ["Chain Transactions"],
      summary: "Mark transaction stale (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body(
        {
          type: "object",
          properties: {
            reason: {
              type: "string",
              maxLength: 1000,
              default: "Transaction exceeded reconciliation window",
            },
          },
        },
        false,
      ),
      responses: ok("Marked stale"),
    },
  },
};
