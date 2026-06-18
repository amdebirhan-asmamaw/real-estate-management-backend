// Title & certificate paths.
// Aligned to: listing.routes.ts (on-chain title section)

import { bearer, envelope, body, idParam } from "../_helpers";

export const titlePaths: Record<string, unknown> = {
  "/listings/{id}/mint-title": {
    post: {
      tags: ["Titles"],
      summary: "Mint the on-chain digital title (admin, verified listing)",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Minted",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Listing"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
        "503": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/title": {
    get: {
      tags: ["Titles"],
      summary: "On-chain ownership verification",
      parameters: [idParam],
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/TitleInfo"),
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
      summary: "Get certificate information for a listing",
      description:
        "Public; returns the certificate metadata for a minted title.",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Certificate data",
          content: { "application/json": { schema: envelope() } },
        },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/certificate/suspend": {
    post: {
      tags: ["Titles"],
      summary: "Suspend a certificate (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", maxLength: 2000 } },
      }),
      responses: {
        "200": { description: "Certificate suspended" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/certificate/restore": {
    post: {
      tags: ["Titles"],
      summary: "Restore a suspended certificate (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", maxLength: 2000 } },
      }),
      responses: {
        "200": { description: "Certificate restored" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/title/dispute": {
    post: {
      tags: ["Titles"],
      summary: "Dispute a minted title on-chain (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", maxLength: 2000 } },
      }),
      responses: {
        "200": { description: "Title disputed, listing suspended" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
        "503": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/title/clear-dispute": {
    post: {
      tags: ["Titles"],
      summary: "Clear title dispute (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", maxLength: 2000 } },
      }),
      responses: {
        "200": { description: "Dispute cleared, listing restored" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
        "503": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/listings/{id}/title/revoke": {
    post: {
      tags: ["Titles"],
      summary: "Revoke title permanently (admin)",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["reason"],
        properties: { reason: { type: "string", maxLength: 2000 } },
      }),
      responses: {
        "200": { description: "Title revoked, listing archived" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
        "503": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
