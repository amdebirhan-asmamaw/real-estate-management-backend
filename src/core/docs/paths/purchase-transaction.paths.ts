// Purchase transaction paths.

import { bearer, body, ok, idParam, page, limit } from "../_helpers";

export const purchaseTransactionPaths: Record<string, unknown> = {
  "/purchase-transactions": {
    get: {
      tags: ["Purchase Transactions"],
      summary: "List purchase transactions",
      security: bearer,
      parameters: [
        {
          name: "status",
          in: "query",
          schema: {
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
        },
        {
          name: "role",
          in: "query",
          schema: { type: "string", enum: ["buyer", "seller"] },
        },
        page,
        limit,
      ],
      responses: ok("Transactions"),
    },
  },
  "/purchase-transactions/{id}": {
    get: {
      tags: ["Purchase Transactions"],
      summary: "Get transaction",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": { description: "Transaction" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/purchase-transactions/{id}/status": {
    patch: {
      tags: ["Purchase Transactions"],
      summary: "Update transaction status (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: [
              "deposit_pending",
              "deposit_received",
              "closing_review",
              "title_transfer_pending",
              "completed",
              "cancelled",
              "disputed",
            ],
          },
          note: { type: "string", maxLength: 2000 },
          depositAmount: { type: "number", minimum: 0 },
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
        },
      }),
      responses: ok("Updated"),
    },
  },
  "/purchase-transactions/{id}/fund": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Fund sale escrow on-chain (admin)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Escrow funded"),
    },
  },
  "/purchase-transactions/{id}/release": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Release sale escrow to seller (admin)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Escrow released"),
    },
  },
  "/purchase-transactions/{id}/refund": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Refund sale escrow to buyer (admin)",
      security: bearer,
      parameters: [idParam],
      responses: ok("Escrow refunded"),
    },
  },
  "/purchase-transactions/{id}/dispute": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Open purchase transaction dispute",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", maxLength: 2000 } },
      }),
      responses: ok("Dispute opened"),
    },
  },
  "/purchase-transactions/{id}/dispute/resolve": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Resolve purchase transaction dispute (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["decision"],
        properties: {
          decision: { type: "string", enum: ["release", "refund"] },
          note: { type: "string", maxLength: 2000 },
        },
      }),
      responses: ok("Dispute resolved"),
    },
  },
};
