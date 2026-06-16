import Joi from "joi";
import { USER_ROLES, type AccountStatus } from "../auth/auth.model";

// ─── Super Admin: Create Admin ──────────────────────────────────────────────────

export const createAdminSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 100 characters",
    "any.required": "Name is required",
  }),
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    "string.email": "Invalid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string()
    .min(8)
    .pattern(/[A-Z]/, "uppercase")
    .pattern(/[0-9]/, "number")
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters",
      "string.pattern.name": "Password must contain at least one {#name}",
      "any.required": "Password is required",
    }),
  phone: Joi.string().max(20).allow("", null).messages({
    "string.max": "Phone number cannot exceed 20 characters",
  }),
});

// ─── List Users ─────────────────────────────────────────────────────────────────

export const listUsersSchema = Joi.object({
  search: Joi.string().max(100).allow(""),
  role: Joi.string().valid(...USER_ROLES).messages({
    "any.only": `role must be one of ${USER_ROLES.join(", ")}`,
  }),
  status: Joi.string()
    .valid("pending", "active", "suspended", "blocked", "rejected")
    .messages({ "any.only": "Invalid account status filter" }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string()
    .valid("createdAt", "-createdAt", "name", "-name", "email", "-email")
    .default("-createdAt"),
});

// ─── List Admins ────────────────────────────────────────────────────────────────

export const listAdminsSchema = Joi.object({
  search: Joi.string().max(100).allow(""),
  status: Joi.string()
    .valid("pending", "active", "suspended", "blocked", "rejected")
    .messages({ "any.only": "Invalid account status filter" }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// ─── Input Types ────────────────────────────────────────────────────────────────

export type CreateAdminInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
};

export type ListUsersQuery = {
  search?: string;
  role?: string;
  status?: AccountStatus;
  page: number;
  limit: number;
  sort: string;
};

export type ListAdminsQuery = {
  search?: string;
  status?: AccountStatus;
  page: number;
  limit: number;
};
