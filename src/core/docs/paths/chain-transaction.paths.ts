// Chain transaction paths — aligned to chainTransaction.routes.ts,
// chainTransaction.validation.ts, chainTransaction.model.ts.

import { bearer, envelope, body, idParam, page, limit } from "../_helpers";

const ctResp = (desc: string) => ({
  "200": {
    description: desc,
    content: {
      "application/json": {
        schema: envelope("#/components/schemas/ChainTransaction"),
      },
    },
  },
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
});

export const chainTransactionPaths: Record<string, unknown> = {
  "/chain-transactions": {
    get: {
      tags: ["Chain Transactions"],
      summary: "List chain transactions (admin)",
      description:
        "Admin-only. Paginated, filterable blockchain transaction ledger used for " +
        "reconciliation and audit of all on-chain operations (title + escrow).",
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
              "title.transfer",
              "title.dispute",
              "title.clear_dispute",
              "title.revoke",
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
        },
        {
          name: "targetType",
          in: "query",
          schema: {
            type: "string",
            enum: ["listing", "lease", "purchase_transaction"],
          },
        },
        {
          name: "targetId",
          in: "query",
          schema: { type: "string", description: "24-char hex Mongo ObjectId" },
        },
        page,
        limit,
      ],
      responses: {
        "200": {
          description: "Paginated chain transactions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Chain transactions" },
                  data: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/ChainTransaction",
                        },
                      },
                      total: { type: "integer" },
                      page: { type: "integer" },
                      limit: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/chain-transactions/{id}/reconcile": {
    post: {
      tags: ["Chain Transactions"],
      summary: "Reconcile a transaction (admin)",
      description:
        "Re-reads the receipt from chain and updates status to confirmed/reverted/stale. " +
        "Body is optional.",
      security: bearer,
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
      responses: ctResp("Reconciled chain transaction"),
    },
  },
  "/chain-transactions/{id}/mark-stale": {
    post: {
      tags: ["Chain Transactions"],
      summary: "Mark transaction stale (admin)",
      description:
        "Manually flags a stuck transaction as stale (exceeded the reconciliation window).",
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
      responses: ctResp("Chain transaction marked stale"),
    },
  },
};
