import Joi from "joi";
import {
  CHAIN_TRANSACTION_OPERATIONS,
  CHAIN_TRANSACTION_STATUSES,
} from "./chainTransaction.model";

export const chainTransactionQuerySchema = Joi.object({
  status: Joi.string().valid(...CHAIN_TRANSACTION_STATUSES),
  operation: Joi.string().valid(...CHAIN_TRANSACTION_OPERATIONS),
  targetType: Joi.string().valid("listing", "lease"),
  targetId: Joi.string().hex().length(24),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type ChainTransactionQueryInput = {
  status?: string;
  operation?: string;
  targetType?: string;
  targetId?: string;
  page: number;
  limit: number;
};
