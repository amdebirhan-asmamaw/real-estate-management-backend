// Auth-related schemas: user, tokens, auth result, input DTOs.
// Aligned to: auth.validation.ts, auth.model.ts

export const authSchemas: Record<string, unknown> = {
  Tokens: {
    type: "object",
    properties: {
      accessToken: { type: "string" },
      refreshToken: { type: "string" },
    },
  },
  AuthUser: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      phone: { type: "string", nullable: true },
      profileImage: { type: "string", format: "uri", nullable: true },
      role: {
        type: "string",
        enum: ["super_admin", "admin", "property_owner", "tenant"],
      },
      accountStatus: {
        type: "string",
        enum: ["pending", "active", "suspended", "blocked", "rejected"],
      },
      kycStatus: {
        type: "string",
        enum: [
          "not_started",
          "pending",
          "under_review",
          "verified",
          "rejected",
          "expired",
        ],
      },
      emailVerified: { type: "boolean" },
      walletAddress: { type: "string", nullable: true },
      walletStatus: {
        type: "string",
        enum: ["unlinked", "pending_signature", "linked", "revoked"],
      },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  AuthResult: {
    type: "object",
    properties: {
      user: { $ref: "#/components/schemas/AuthUser" },
      tokens: { $ref: "#/components/schemas/Tokens" },
    },
  },
  RegisterInput: {
    type: "object",
    required: ["name", "email", "password"],
    properties: {
      name: { type: "string", minLength: 2, maxLength: 100 },
      email: { type: "string", format: "email" },
      password: {
        type: "string",
        minLength: 8,
        description: "≥ 8 chars, at least one uppercase letter and one number",
      },
      role: {
        type: "string",
        enum: ["property_owner", "tenant"],
        default: "tenant",
        description: "Self-registration is limited to these roles",
      },
    },
  },
  LoginInput: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", minLength: 1 },
    },
  },
  RefreshInput: {
    type: "object",
    required: ["refreshToken"],
    properties: { refreshToken: { type: "string" } },
  },
  UpdateProfileInput: {
    type: "object",
    minProperties: 1,
    description: "At least one field must be provided.",
    properties: {
      name: { type: "string", minLength: 2, maxLength: 100 },
      phone: { type: "string", maxLength: 20, nullable: true },
      profileImage: { type: "string", format: "uri", nullable: true },
    },
  },
  ChangePasswordInput: {
    type: "object",
    required: ["currentPassword", "newPassword"],
    properties: {
      currentPassword: { type: "string" },
      newPassword: {
        type: "string",
        minLength: 8,
        description: "≥ 8 chars, 1 uppercase, 1 number",
      },
    },
  },
  ForgotPasswordInput: {
    type: "object",
    required: ["email"],
    properties: { email: { type: "string", format: "email" } },
  },
  ResetPasswordInput: {
    type: "object",
    required: ["token", "newPassword"],
    properties: {
      token: { type: "string" },
      newPassword: {
        type: "string",
        minLength: 8,
        description: "≥ 8 chars, at least one uppercase letter and one number",
      },
    },
  },
  WalletChallengeInput: {
    type: "object",
    required: ["walletAddress"],
    properties: {
      walletAddress: {
        type: "string",
        pattern: "^0x[a-fA-F0-9]{40}$",
        description: "EVM address",
      },
    },
  },
  WalletLinkInput: {
    type: "object",
    required: ["walletAddress", "signature"],
    properties: {
      walletAddress: {
        type: "string",
        pattern: "^0x[a-fA-F0-9]{40}$",
      },
      signature: {
        type: "string",
        description: "Signature over the challenge nonce",
      },
    },
  },
};
