import Joi from "joi";
import { PUBLIC_REGISTRATION_ROLES } from "./auth.model";

const passwordSchema = Joi.string()
  .min(8)
  .pattern(/[A-Z]/, "uppercase")
  .pattern(/[0-9]/, "number");

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 100 characters",
    "any.required": "Name is required",
  }),
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    "string.email": "Invalid email address",
    "any.required": "Email is required",
  }),
  password: passwordSchema
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.name": "Password must contain at least one {#name}",
      "any.required": "Password is required",
    }),
  // Self-registration is limited to public-facing roles. admin/super_admin
  // are provisioned out-of-band (seed/admin action).
  role: Joi.string()
    .valid(...PUBLIC_REGISTRATION_ROLES)
    .default("tenant")
    .messages({
    "any.only": "role must be one of property_owner, tenant",
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    "string.email": "Invalid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string().min(1).required().messages({
    "any.required": "Password is required",
  }),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "any.required": "Refresh token is required",
  }),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    "any.required": "Current password is required",
  }),
  newPassword: Joi.string()
    .min(8)
    .pattern(/[A-Z]/, "uppercase")
    .pattern(/[0-9]/, "number")
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.name": "Password must contain at least one {#name}",
      "any.required": "New password is required",
    }),
});

export const walletChallengeSchema = Joi.object({
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required()
    .messages({
      "string.pattern.base": "walletAddress must be a valid EVM address",
      "any.required": "walletAddress is required",
    }),
});

export const walletLinkSchema = Joi.object({
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required()
    .messages({
      "string.pattern.base": "walletAddress must be a valid EVM address",
      "any.required": "walletAddress is required",
    }),
  signature: Joi.string().required().messages({
    "any.required": "signature is required",
  }),
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100).messages({
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 100 characters",
  }),
  phone: Joi.string().max(20).allow("", null).messages({
    "string.max": "Phone number cannot exceed 20 characters",
  }),
  profileImage: Joi.string().uri().allow("", null).messages({
    "string.uri": "profileImage must be a valid URL",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided to update",
  });

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    "string.email": "Invalid email address",
    "any.required": "Email is required",
  }),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Reset token is required",
  }),
  newPassword: Joi.string()
    .min(8)
    .pattern(/[A-Z]/, "uppercase")
    .pattern(/[0-9]/, "number")
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.name": "Password must contain at least one {#name}",
      "any.required": "New password is required",
    }),
});

// Inferred input types
export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role?: "property_owner" | "tenant";
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RefreshTokenInput = {
  refreshToken: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type WalletChallengeInput = {
  walletAddress: string;
};

export type WalletLinkInput = {
  walletAddress: string;
  signature: string;
};

export type UpdateProfileInput = {
  name?: string;
  phone?: string;
  profileImage?: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type ResetPasswordInput = {
  token: string;
  newPassword: string;
};
