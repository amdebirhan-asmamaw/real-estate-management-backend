// Purchase transaction paths — aligned to purchaseTransaction.routes.ts,
// purchaseTransaction.validation.ts, purchaseTransaction.model.ts.

import { bearer, envelope, body, idParam, page, limit } from "../_helpers";

const ptResp = (desc: string, code = "200") => ({
  [code]: {
    description: desc,
    content: {
      "application/json": {
        schema: envelope("#/components/schemas/PurchaseTransaction"),
      },
    },
  },
});

export const purchaseTransactionPaths: Record<string, unknown> = {
  "/purchase-transactions": {
    get: {
      tags: ["Purchase Transactions"],
      summary: "List purchase transactions",
      description:
        "Buyer/seller see their own; admins see all (optionally filtered by role). " +
        "Paginated. Listing and offer are populated with summary fields.",
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
          description: "Admin-only narrowing to caller-as-buyer or seller",
        },
        page,
        limit,
      ],
      responses: {
        "200": {
          description: "Paginated purchase transactions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          $ref: "#/components/schemas/PurchaseTransaction",
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
  "/purchase-transactions/{id}": {
    get: {
      tags: ["Purchase Transactions"],
      summary: "Get a purchase transaction",
      description: "Accessible by buyer, seller, or admin.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...ptResp("Purchase transaction"),
        "401": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/purchase-transactions/{id}/status": {
    patch: {
      tags: ["Purchase Transactions"],
      summary: "Update transaction status (admin)",
      description:
        "Admin-only manual status/closing-checklist update. Cannot set `completed` " +
        "unless the escrow has been released, and cannot manually jump into escrow-implying " +
        "states (deposit_received, closing_review, title_transfer_pending) — use the escrow " +
        "endpoints for those.",
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
      responses: {
        ...ptResp("Transaction updated"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description:
            "Illegal manual transition (e.g. completed without released escrow)",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/purchase-transactions/{id}/fund": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Fund sale escrow on-chain (admin)",
      description:
        "Pulls the sale amount into the SaleEscrow contract. Gates: buyer + seller KYC " +
        "verified, both wallets linked, and the listing verified. Status → deposit_received. " +
        "Creates a ChainTransaction.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...ptResp("Escrow funded"),
        "401": { $ref: "#/components/responses/Error" },
        "403": {
          description: "KYC/wallet/verified-listing gate failed, or not admin",
          $ref: "#/components/responses/Error",
        },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description: "Escrow already funded",
          $ref: "#/components/responses/Error",
        },
        "503": {
          description: "Blockchain tx failed",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/purchase-transactions/{id}/release": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Release sale escrow to seller (admin)",
      description:
        "Releases funds to the seller AND transfers the PropertyTitle NFT to the buyer " +
        "(requires a minted title + buyer wallet). Status → completed; listing → sold. " +
        "Creates ChainTransactions for the release and the title transfer.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...ptResp("Escrow released, title transferred, transaction completed"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description:
            "Escrow not funded, or listing has no minted title / buyer has no wallet",
          $ref: "#/components/responses/Error",
        },
        "503": {
          description: "Blockchain tx failed",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/purchase-transactions/{id}/refund": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Refund sale escrow to buyer (admin)",
      description:
        "Refunds the escrow to the buyer and cancels the transaction. Creates a ChainTransaction.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...ptResp("Escrow refunded, transaction cancelled"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description: "Escrow not funded",
          $ref: "#/components/responses/Error",
        },
        "503": {
          description: "Blockchain tx failed",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/purchase-transactions/{id}/dispute": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Open a dispute",
      description:
        "Buyer, seller, or admin may open a dispute (not on completed/cancelled).",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", maxLength: 2000 } },
      }),
      responses: {
        ...ptResp("Dispute opened, status → disputed"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description: "Already disputed or in a terminal state",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/purchase-transactions/{id}/dispute/resolve": {
    post: {
      tags: ["Purchase Transactions"],
      summary: "Resolve a dispute (admin)",
      description:
        "`release` → funds to seller (or, if no escrow funded, returns to closing_review); " +
        "`refund` → funds to buyer / cancelled. Settles on-chain when escrow is funded.",
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
      responses: {
        ...ptResp("Dispute resolved"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "409": {
          description: "Not in disputed status",
          $ref: "#/components/responses/Error",
        },
        "503": {
          description: "Blockchain tx failed",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
};
