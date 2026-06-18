import Joi from "joi";
import { AUDIT_ACTIONS, AuditTargetType } from "./audit.model";

export const auditQuerySchema = Joi.object({
  targetId: Joi.string().hex().length(24),
  action: Joi.string().valid(...AUDIT_ACTIONS),
  actor: Joi.string().hex().length(24),
  targetType: Joi.string().valid(
    "listing",
    "user",
    "lease",
    "admin",
    "compliance",
    "purchase_transaction",
    "rental_application",
  ),
  from: Joi.date().iso(),
  to: Joi.date().iso().min(Joi.ref("from")),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type AuditQuery = {
  targetId?: string;
  action?: string;
  actor?: string;
  targetType?: AuditTargetType;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
};
