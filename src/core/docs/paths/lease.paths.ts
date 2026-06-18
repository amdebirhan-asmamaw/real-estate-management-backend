// Lease paths: full lifecycle including sign, escrow, disputes, tenant roster, and timeline.
// Aligned to: lease.routes.ts, lease.validation.ts, lease.service.ts, lease.model.ts.

import { bearer, envelope, body, idParam } from "../_helpers";

const leaseResp = (desc: string, code = "200") => ({
  [code]: {
    description: desc,
    content: {
      "application/json": { schema: envelope("#/components/schemas/Lease") },
    },
  },
});

const stdErr = {
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "409": { $ref: "#/components/responses/Error" },
};

const chainErr = { ...stdErr, "503": { $ref: "#/components/responses/Error" } };

export const leasePaths: Record<string, unknown> = {
  "/leases": {
    post: {
      tags: ["Leases"],
      summary: "Create a lease draft",
      description:
        "Roles: property_owner, admin, super_admin. Creates a new lease in `draft` status. " +
        "Listing must exist and be of type `rent`. escrowAmount = depositAmount + monthlyRent.",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/CreateLeaseInput" }),
      responses: {
        ...leaseResp("Lease draft created", "201"),
        "400": { $ref: "#/components/responses/Error" },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": {
          description: "Listing or tenant not found",
          $ref: "#/components/responses/Error",
        },
      },
    },
  },
  "/leases/mine": {
    get: {
      tags: ["Leases"],
      summary: "Leases where the caller is landlord or tenant",
      description:
        "Returns all leases where the authenticated user is either landlord or tenant, " +
        "sorted by createdAt descending. Populates listing (title) and tenant/landlord (name, email).",
      security: bearer,
      responses: {
        "200": {
          description: "Array of leases",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string" },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Lease" },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/tenants": {
    get: {
      tags: ["Leases"],
      summary: "Tenant roster for landlord's leases",
      description:
        "Distinct tenants across all leases where the caller is landlord. " +
        "Roles: property_owner, admin, super_admin.",
      security: bearer,
      responses: {
        "200": {
          description: "Tenant list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string" },
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        email: { type: "string" },
                        phone: { type: "string" },
                      },
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
  "/leases/{id}": {
    parameters: [idParam],
    get: {
      tags: ["Leases"],
      summary: "Get a single lease",
      description: "Accessible by landlord, tenant, or admin.",
      security: bearer,
      responses: {
        ...leaseResp("Lease details"),
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/{id}/propose": {
    post: {
      tags: ["Leases"],
      summary: "Advance lease from draft → proposed",
      description:
        "Landlord/admin only. Computes termsHash (SHA-256 of terms string) " +
        "and sets status to `proposed`. Notifies the tenant.",
      security: bearer,
      parameters: [idParam],
      responses: { ...leaseResp("Lease proposed"), ...stdErr },
    },
  },
  "/leases/{id}/sign": {
    post: {
      tags: ["Leases"],
      summary: "Tenant signs the proposed lease",
      description:
        "Tenant or admin. Optional tenantSignature payload. " +
        "Sets signedByTenantAt and moves status to `signed`.",
      security: bearer,
      parameters: [idParam],
      requestBody: body(
        {
          type: "object",
          properties: {
            tenantSignature: { type: "string", maxLength: 1000 },
          },
        },
        false,
      ),
      responses: { ...leaseResp("Lease signed"), ...stdErr },
    },
  },
  "/leases/{id}/fund": {
    post: {
      tags: ["Leases"],
      summary: "Fund the on-chain escrow (admin)",
      description:
        "Transfers deposit + first month rent to the LeaseEscrow contract. " +
        "Both parties must have a linked walletAddress. Creates a ChainTransaction.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...leaseResp("Escrow funded, lease status → funded"),
        ...chainErr,
      },
    },
  },
  "/leases/{id}/activate": {
    post: {
      tags: ["Leases"],
      summary: "Release first month rent and activate (admin)",
      description:
        "Releases the first month's rent to the landlord on-chain and activates the lease. " +
        "Marks listing as `rented`. Creates a ChainTransaction.",
      security: bearer,
      parameters: [idParam],
      responses: { ...leaseResp("Lease activated"), ...chainErr },
    },
  },
  "/leases/{id}/cancel": {
    post: {
      tags: ["Leases"],
      summary: "Cancel lease before activation",
      description:
        "Any party or admin. If escrow is funded, triggers a full refund to tenant. " +
        "Allowed in: draft, proposed, signed, funded.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...leaseResp("Lease cancelled, escrow refunded"),
        ...stdErr,
      },
    },
  },
  "/leases/{id}/complete": {
    post: {
      tags: ["Leases"],
      summary: "Mark lease completed, refund deposit (admin)",
      description:
        "Admin-only. Releases deposit back to tenant on-chain. " +
        "Sets lease to `completed` and listing back to `published`.",
      security: bearer,
      parameters: [idParam],
      responses: {
        ...leaseResp("Lease completed, deposit refunded"),
        ...chainErr,
      },
    },
  },
  "/leases/{id}/terminate": {
    post: {
      tags: ["Leases"],
      summary: "Terminate lease, release deposit to landlord (admin)",
      description:
        "Admin-only. Early termination releases deposit to landlord on-chain. " +
        "Creates a compliance case.",
      security: bearer,
      parameters: [idParam],
      responses: { ...leaseResp("Lease terminated"), ...chainErr },
    },
  },
  "/leases/{id}/dispute": {
    post: {
      tags: ["Leases"],
      summary: "Flag a dispute on an active lease",
      description:
        "Any party or admin. Requires `active` status. " +
        "Records dispute.openedBy and dispute.openedAt.",
      security: bearer,
      parameters: [idParam],
      requestBody: body(
        {
          type: "object",
          properties: {
            reason: { type: "string", maxLength: 2000 },
          },
        },
        false,
      ),
      responses: {
        ...leaseResp("Dispute flagged, status → disputed"),
        ...stdErr,
      },
    },
  },
  "/leases/{id}/dispute/respond": {
    post: {
      tags: ["Leases"],
      summary: "Respond to a dispute",
      description: "The other party or admin can respond to an open dispute.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["response"],
        properties: {
          response: { type: "string", maxLength: 2000 },
        },
      }),
      responses: { ...leaseResp("Dispute response recorded"), ...stdErr },
    },
  },
  "/leases/{id}/dispute/resolve": {
    post: {
      tags: ["Leases"],
      summary: "Resolve a disputed lease (admin)",
      description:
        "`release_deposit` → deposit to landlord; `refund_deposit` → deposit to tenant; " +
        "`cancel` → void the lease. Creates ChainTransaction for on-chain settlement.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["release_deposit", "refund_deposit", "cancel"],
          },
          reason: { type: "string", maxLength: 2000 },
        },
      }),
      responses: { ...leaseResp("Dispute resolved"), ...chainErr },
    },
  },
  "/leases/{id}/escrow": {
    get: {
      tags: ["Leases"],
      summary: "On-chain escrow verification",
      description:
        "Reads escrow state from the blockchain and returns both the DB record " +
        "and on-chain state for comparison.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Escrow info",
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
                      lease: { $ref: "#/components/schemas/Lease" },
                      onChain: {
                        type: "object",
                        nullable: true,
                        description: "null if no escrow has been created yet",
                        properties: {
                          escrowId: { type: "string" },
                          tenant: {
                            type: "string",
                            description: "Wallet address",
                          },
                          landlord: {
                            type: "string",
                            description: "Wallet address",
                          },
                          depositAmount: {
                            type: "string",
                            description: "Base-unit bigint string",
                          },
                          rentAmount: { type: "string" },
                          status: {
                            type: "string",
                            enum: [
                              "funded",
                              "active",
                              "completed",
                              "cancelled",
                              "disputed",
                            ],
                          },
                          token: {
                            type: "string",
                            description: "ERC-20 token address",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
        "503": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/{id}/timeline": {
    get: {
      tags: ["Leases"],
      summary: "Lease and escrow timeline",
      description:
        "Returns an ordered list of lifecycle events with timestamps and status indicators.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Timeline data",
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
                      leaseId: { type: "string" },
                      currentStatus: {
                        type: "string",
                        enum: [
                          "draft",
                          "proposed",
                          "active",
                          "completed",
                          "terminated",
                          "cancelled",
                          "disputed",
                        ],
                      },
                      escrowState: {
                        type: "string",
                        enum: ["none", "funded", "active", "closed"],
                      },
                      events: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: {
                              type: "string",
                              enum: [
                                "created",
                                "proposed",
                                "signed",
                                "escrow_funded",
                                "active",
                                "settled",
                                "disputed",
                              ],
                            },
                            label: { type: "string" },
                            at: {
                              type: "string",
                              format: "date-time",
                              nullable: true,
                            },
                            status: {
                              type: "string",
                              enum: ["completed", "pending", "active"],
                            },
                            metadata: {
                              type: "object",
                              additionalProperties: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "404": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
