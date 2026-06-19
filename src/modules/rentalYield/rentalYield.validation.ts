import Joi from "joi";

export const maintenanceRecordSchema = Joi.object({
  leaseId: Joi.string().hex().length(24).optional(),
  type: Joi.string()
    .valid(
      "maintenance",
      "repair",
      "utility",
      "tax",
      "insurance",
      "management",
      "other",
    )
    .required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().length(3).uppercase().default("USD"),
  incurredAt: Joi.date().iso().required(),
  note: Joi.string().max(2000).allow("").optional(),
});

export const maintenanceRecordQuerySchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  type: Joi.string().valid(
    "maintenance",
    "repair",
    "utility",
    "tax",
    "insurance",
    "management",
    "other",
  ),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export type MaintenanceRecordInput = {
  leaseId?: string;
  type:
    | "maintenance"
    | "repair"
    | "utility"
    | "tax"
    | "insurance"
    | "management"
    | "other";
  amount: number;
  currency: string;
  incurredAt: string;
  note?: string;
};

export type MaintenanceRecordQuery = {
  from?: Date;
  to?: Date;
  type?: string;
  page: number;
  limit: number;
};
