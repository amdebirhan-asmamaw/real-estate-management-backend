// Auth paths: register, login, refresh, profile, password reset, sessions, wallet.
// Aligned to: auth.routes.ts, auth.validation.ts

import { bearer, envelope, body, ok } from "../_helpers";

export const authPaths: Record<string, unknown> = {
  "/auth/register": {
    post: {
      tags: ["Auth"],
      summary: "Register a new account",
      description:
        "Tenants become active immediately; property owners start `pending` and must pass KYC.",
      requestBody: body({ $ref: "#/components/schemas/RegisterInput" }),
      responses: {
        "201": {
          description: "Created",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/AuthResult"),
            },
          },
        },
        "409": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
        "429": { description: "Too many requests (rate limited)" },
      },
    },
  },
  "/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Log in with email and password",
      requestBody: body({ $ref: "#/components/schemas/LoginInput" }),
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/AuthResult"),
            },
          },
        },
        "401": { description: "Invalid credentials" },
        "403": { description: "Account suspended / blocked / rejected" },
        "423": {
          description:
            "Account temporarily locked after too many failed attempts",
        },
        "429": { description: "Too many requests (rate limited)" },
      },
    },
  },
  "/auth/refresh-token": {
    post: {
      tags: ["Auth"],
      summary: "Exchange a refresh token for new tokens",
      requestBody: body({ $ref: "#/components/schemas/RefreshInput" }),
      responses: {
        "200": {
          description: "New token pair",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/Tokens"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "429": { description: "Too many requests (rate limited)" },
      },
    },
  },
  "/auth/me": {
    get: {
      tags: ["Auth"],
      summary: "Current user's profile",
      security: bearer,
      responses: {
        "200": {
          description: "OK",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/AuthUser"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
    patch: {
      tags: ["Auth"],
      summary: "Update current user's profile (alias for PATCH /auth/profile)",
      description:
        "At least one of name, phone, or profileImage must be provided.",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/UpdateProfileInput" }),
      responses: {
        "200": {
          description: "Updated",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/AuthUser"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/auth/profile": {
    patch: {
      tags: ["Auth"],
      summary: "Update current user's profile",
      description:
        "Identical to PATCH /auth/me. At least one of name, phone, or profileImage must be provided.",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/UpdateProfileInput" }),
      responses: {
        "200": {
          description: "Profile updated",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/AuthUser"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/auth/forgot-password": {
    post: {
      tags: ["Auth"],
      summary: "Request password reset email",
      description: "Always returns 200 so account existence is not exposed.",
      requestBody: body({ $ref: "#/components/schemas/ForgotPasswordInput" }),
      responses: {
        "200": {
          description: "Reset instructions queued if the account exists",
        },
        "422": { $ref: "#/components/responses/Error" },
        "429": { description: "Too many requests (rate limited)" },
      },
    },
  },
  "/auth/reset-password": {
    post: {
      tags: ["Auth"],
      summary: "Reset password with emailed token",
      description: "Consumes the reset token and revokes all active sessions.",
      requestBody: body({ $ref: "#/components/schemas/ResetPasswordInput" }),
      responses: {
        "200": { description: "Password reset; sign in again" },
        "400": { $ref: "#/components/responses/Error" },
        "401": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
        "429": { description: "Too many requests (rate limited)" },
      },
    },
  },
  "/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Revoke a single refresh-token session",
      requestBody: body({ $ref: "#/components/schemas/RefreshInput" }),
      responses: ok("Logged out"),
    },
  },
  "/auth/logout-all": {
    post: {
      tags: ["Auth"],
      summary: "Revoke all of the caller's sessions",
      security: bearer,
      responses: {
        "200": { description: "All sessions revoked" },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/auth/sessions": {
    get: {
      tags: ["Auth"],
      summary: "List the caller's active sessions",
      security: bearer,
      responses: {
        "200": {
          description: "Active sessions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string" },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Session" },
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
  "/auth/change-password": {
    post: {
      tags: ["Auth"],
      summary: "Change password (revokes all sessions)",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/ChangePasswordInput" }),
      responses: {
        "200": { description: "Password changed; sign in again" },
        "401": { $ref: "#/components/responses/Error" },
        "422": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/auth/wallet/challenge": {
    post: {
      tags: ["Auth"],
      summary: "Request nonce for wallet linking",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/WalletChallengeInput" }),
      responses: {
        "200": {
          description: "Challenge nonce to sign",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/WalletChallengeResult"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "409": {
          description: "Wallet already linked to another account",
        },
      },
    },
  },
  "/auth/wallet/link": {
    post: {
      tags: ["Auth"],
      summary: "Link wallet with signed challenge",
      security: bearer,
      requestBody: body({ $ref: "#/components/schemas/WalletLinkInput" }),
      responses: {
        "200": {
          description: "Wallet linked",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/AuthUser"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
        "409": { $ref: "#/components/responses/Error" },
      },
    },
  },
  "/auth/wallet": {
    delete: {
      tags: ["Auth"],
      summary: "Unlink wallet",
      security: bearer,
      responses: {
        "200": {
          description: "Wallet unlinked",
          content: {
            "application/json": {
              schema: envelope("#/components/schemas/AuthUser"),
            },
          },
        },
        "401": { $ref: "#/components/responses/Error" },
      },
    },
  },
};
