// Lease paths: full lifecycle including sign, escrow, disputes, and tenant roster.
// Aligned to: lease.routes.ts, lease.validation.ts

import { bearer, envelope, body, idParam } from "../_helpers";

export const leasePaths: Record<string, unknown> = {
  "/leases": {
    post: {
      tags: ["Leases"],
      summary: "Create a lease draft",
      description: "Roles: property_owner, admin, super_admin.",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/CreateLeaseInput" }),
      responses: {
        "201": {
          description: "Lease draft created",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/mine": {
    get: {
      tags: ["Leases"],
      summary: "Leases where the caller is landlord or tenant",
      description: "Roles: property_owner, tenant, admin, super_admin.",
      security: bearer,
      responses: {
        "200": {
          description: "OK",
          content: { "application/json": { schema: envelope() } },
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
        "Lists all tenants who have active or historical leases with the caller. " +
        "Roles: property_owner, admin, super_admin.",
      security: bearer,
      responses: {
        "200": {
          description: "Tenant list",
          content: { "application/json": { schema: envelope() } },
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
      description: "Accessible by the landlord, the tenant, or an admin.",
      security: bearer,
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
            },
          },
        },
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
      description: "Roles: property_owner, admin, super_admin.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Lease proposed",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/{id}/sign": {
    post: {
      tags: ["Leases"],
      summary: "Tenant signs the proposed lease",
      description:
        "Only the assigned tenant (or admin) may sign. An optional tenantSignature " +
        "string can be provided. Roles: tenant, admin, super_admin.",
      security: bearer,
      parameters: [idParam],
      requestBody: body(
        {
          type: "object",
          properties: {
            tenantSignature: {
              type: "string",
              maxLength: 1000,
              description: "Optional signature payload",
            },
          },
        },
        false,
      ),
      responses: {
        "200": {
          description: "Lease signed",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/{id}/fund": {
    post: {
      tags: ["Leases"],
      summary: "Fund the on-chain escrow (admin)",
      description:
        "Transfers deposit + first month rent into the escrow contract. " +
        "Both parties must have a linked walletAddress.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Escrow funded; lease status → funded",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
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
  "/leases/{id}/activate": {
    post: {
      tags: ["Leases"],
      summary: "Release first month rent and activate lease (admin)",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Lease activated",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
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
  "/leases/{id}/cancel": {
    post: {
      tags: ["Leases"],
      summary: "Cancel lease before activation",
      description:
        "Accessible by either party or an admin. Triggers a full escrow refund if funds are held.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Lease cancelled; escrow refunded",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/{id}/complete": {
    post: {
      tags: ["Leases"],
      summary: "Mark lease completed and refund deposit to tenant (admin)",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Lease completed; deposit refunded to tenant",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
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
  "/leases/{id}/terminate": {
    post: {
      tags: ["Leases"],
      summary: "Terminate lease and release deposit to landlord (admin)",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Lease terminated; deposit released to landlord",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
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
  "/leases/{id}/dispute": {
    post: {
      tags: ["Leases"],
      summary: "Flag a dispute on an active lease",
      description: "Accessible by either party or an admin.",
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
        "200": {
          description: "Dispute flagged",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/{id}/dispute/respond": {
    post: {
      tags: ["Leases"],
      summary: "Respond to a dispute (party/admin)",
      description:
        "The other party or an admin can respond to an open dispute with a text response.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({
        type: "object",
        required: ["response"],
        properties: {
          response: { type: "string", maxLength: 2000 },
        },
      }),
      responses: {
        "200": {
          description: "Response recorded",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "403": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/leases/{id}/dispute/resolve": {
    post: {
      tags: ["Leases"],
      summary: "Resolve a disputed lease (admin)",
      description:
        "`release_deposit` sends deposit to landlord; " +
        "`refund_deposit` returns it to tenant; `cancel` voids the lease.",
      security: bearer,
      parameters: [idParam],
      requestBody: body({ $ref: "#/components/schemas/DisputeResolveInput" }),
      responses: {
        "200": {
          description: "Dispute resolved",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Lease"),
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
  "/leases/{id}/escrow": {
    get: {
      tags: ["Leases"],
      summary: "On-chain escrow verification",
      description:
        "Reads escrow state from the chain and compares it to the DB record.",
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/EscrowInfo"),
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
      security: bearer,
      parameters: [idParam],
      responses: {
        "200": {
          description: "Timeline entries",
          content: { "application/json": { schema: envelope() } },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
