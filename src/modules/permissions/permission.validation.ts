import Joi from "joi";

const permissionKeySchema = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/)
  .messages({
    "string.pattern.base":
      "key must be dot-namespaced (e.g. users.suspend, listings.review)",
  });

export const createPermissionSchema = Joi.object({
  key: permissionKeySchema.required().messages({
    "any.required": "Permission key is required",
  }),
  name: Joi.string().min(2).max(100).required().messages({
    "string.min": "Name must be at least 2 characters",
    "any.required": "Name is required",
  }),
  description: Joi.string().max(500).allow("", null),
});

export const updatePermissionSchema = Joi.object({
  name: Joi.string().min(2).max(100).messages({
    "string.min": "Name must be at least 2 characters",
  }),
  description: Joi.string().max(500).allow("", null),
})
  .min(1)
  .messages({ "object.min": "At least one field must be provided to update" });

export const listPermissionsSchema = Joi.object({
  search: Joi.string().max(100).allow(""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const assignPermissionsSchema = Joi.object({
  permissionIds: Joi.array()
    .items(Joi.string().hex().length(24))
    .min(1)
    .required()
    .messages({
      "array.min": "At least one permission id is required",
      "any.required": "permissionIds is required",
    }),
});

export const revokePermissionsSchema = Joi.object({
  permissionIds: Joi.array()
    .items(Joi.string().hex().length(24))
    .min(1)
    .required()
    .messages({
      "array.min": "At least one permission id is required",
      "any.required": "permissionIds is required",
    }),
});

export type CreatePermissionInput = {
  key: string;
  name: string;
  description?: string;
};

export type UpdatePermissionInput = {
  name?: string;
  description?: string;
};

export type ListPermissionsQuery = {
  search?: string;
  page: number;
  limit: number;
};

export type AssignPermissionsInput = {
  permissionIds: string[];
};

export type RevokePermissionsInput = {
  permissionIds: string[];
};
