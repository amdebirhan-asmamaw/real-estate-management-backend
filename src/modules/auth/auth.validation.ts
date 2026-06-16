import Joi from "joi";

const passwordSchema = Joi.string()
  .min(8)
  .pattern(/[A-Z]/, "uppercase")
  .pattern(/[0-9]/, "number");

const walletAddressSchema = Joi.string()
  .pattern(/^0x[a-fA-F0-9]{40}$/)
  .messages({
    "string.pattern.base": "walletAddress must be a valid EVM address",
  });

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
  role: Joi.string().valid("property_owner", "tenant").default("tenant").messages({
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
  newPassword: passwordSchema
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.name": "Password must contain at least one {#name}",
      "any.required": "New password is required",
    }),
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  // Empty string unlinks the wallet. A verified signed-message wallet flow can
  // replace this later without changing the profile contract.
  walletAddress: walletAddressSchema.allow(""),
}).min(1);

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    "string.email": "Invalid email address",
    "any.required": "Email is required",
  }),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().min(32).required().messages({
    "any.required": "Reset token is required",
  }),
  newPassword: passwordSchema
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

export type UpdateProfileInput = {
  name?: string;
  walletAddress?: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export type ResetPasswordInput = {
  token: string;
  newPassword: string;
};
