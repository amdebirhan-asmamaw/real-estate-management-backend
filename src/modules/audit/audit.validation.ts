import Joi from "joi";
import { AUDIT_ACTIONS } from "./audit.model";

export const auditQuerySchema = Joi.object({
  targetId: Joi.string().hex().length(24),
  action: Joi.string().valid(...AUDIT_ACTIONS),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type AuditQuery = {
  targetId?: string;
  action?: string;
  page: number;
  limit: number;
};
