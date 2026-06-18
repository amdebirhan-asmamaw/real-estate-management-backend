// On-chain title & certificate paths.
// Aligned to: listing.routes.ts (on-chain section), listing.service.ts.

import { bearer, envelope, body, idParam } from "../_helpers";

const titleInfoSchema = {
  type: "object",
  properties: {
    tokenId: { type: "string" },
    contractAddress: { type: "string" },
    owner: { type: "string", description: "On-chain wallet address" },
    status: { type: "string", enum: ["none", "active", "disputed", "revoked"] },
    onChainHash: { type: "string" },
    offChainHash: { type: "string" },
    verified: { type: "boolean", description: "true when hashes match" },
  },
};

const certSchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["not_issued", "issued", "suspended", "revoked"],
    },
    certificateId: { type: "string", nullable: true },
    propertyId: { type: "string" },
    ownerWallet: { type: "string", nullable: true },
    verificationDate: { type: "string", format: "date-time", nullable: true },
    documentHash: { type: "string", nullable: true },
    txHash: { type: "string", nullable: true },
    contractAddress: { type: "string", nullable: true },
    tokenId: { type: "string", nullable: true },
    disclaimer: { type: "string" },
  },
};

const actionBody = body({
  type: "object",
  required: ["reason"],
  properties: { reason: { type: "string", maxLength: 2000 } },
});

const chainErr = {
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
  "409": { $ref: "#/components/responses/Error" },
  "503": {
    description: "Blockchain tx failed",
    $ref: "#/components/responses/Error",
  },
};

const listingResp = (desc: string) => ({
  "200": {
    description: desc,
    content: {
      "application/json": { schema: envelope("#/components/schemas/Listing") },
    },
  },
  ...chainErr,
});

export const titlePaths: Record<string, unknown> = {
  "/listings/{id}/mint-title": {
    post: {
      tags: ["Titles"],
      summary: "Mint on-chain digital title (admin)",
      description:
        "Admin-only. Mints an ERC-721 PropertyTitle NFT. Requires verified listing " +
        "with ownershipDocumentHash. Idempotent: refuses if already minted. " +
        "Creates ChainTransaction, notifies property owner.",
      security: bearer,
      parameters: [idParam],
      responses: listingResp("Title minted"),
    },
  },
  "/listings/{id}/title": {
    get: {
      tags: ["Titles"],
      summary: "On-chain ownership verification",
      description:
        "Reads on-chain title and compares hash. Public for published listings.",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Title verification info",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "On-chain title" },
                  data: titleInfoSchema,
                },
              },
            },
          },
        },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/certificate": {
    get: {
      tags: ["Titles"],
      summary: "Get certificate information",
      description:
        "Public. Returns certificate metadata. status=not_issued if no title minted.",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Certificate data",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Certificate view" },
                  data: certSchema,
                },
              },
            },
          },
        },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/certificate/suspend": {
    post: {
      tags: ["Titles"],
      summary: "Suspend certificate (admin)",
      description:
        "Disputes on-chain title, suspending certificate and listing.",
      security: bearer,
      parameters: [idParam],
      requestBody: actionBody,
      responses: listingResp("Certificate suspended"),
    },
  },
  "/listings/{id}/certificate/restore": {
    post: {
      tags: ["Titles"],
      summary: "Restore suspended certificate (admin)",
      description:
        "Clears on-chain dispute, restoring certificate and listing.",
      security: bearer,
      parameters: [idParam],
      requestBody: actionBody,
      responses: listingResp("Certificate restored"),
    },
  },
  "/listings/{id}/title/dispute": {
    post: {
      tags: ["Titles"],
      summary: "Dispute minted title on-chain (admin)",
      description: "Marks title as disputed, sets listing to suspended.",
      security: bearer,
      parameters: [idParam],
      requestBody: actionBody,
      responses: listingResp("Title disputed"),
    },
  },
  "/listings/{id}/title/clear-dispute": {
    post: {
      tags: ["Titles"],
      summary: "Clear title dispute (admin)",
      description: "Clears dispute, restores listing to published.",
      security: bearer,
      parameters: [idParam],
      requestBody: actionBody,
      responses: listingResp("Dispute cleared"),
    },
  },
  "/listings/{id}/title/revoke": {
    post: {
      tags: ["Titles"],
      summary: "Revoke title permanently (admin)",
      description:
        "Permanently revokes on-chain title. Listing archived. Irreversible.",
      security: bearer,
      parameters: [idParam],
      requestBody: actionBody,
      responses: listingResp("Title revoked"),
    },
  },
};
