import Joi from "joi";

export const purchaseTransactionQuerySchema = Joi.object({
  status: Joi.string().valid(
    "offer_accepted",
    "deposit_pending",
    "deposit_received",
    "closing_review",
    "title_transfer_pending",
    "completed",
    "cancelled",
    "disputed",
  ),
  role: Joi.string().valid("buyer", "seller"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const updatePurchaseTransactionSchema = Joi.object({
  status: Joi.string()
    .valid(
      "deposit_pending",
      "deposit_received",
      "closing_review",
      "title_transfer_pending",
      "completed",
      "cancelled",
      "disputed",
    )
    .required(),
  note: Joi.string().max(2000).allow(""),
  depositAmount: Joi.number().min(0),
  closingChecklist: Joi.object({
    purchaseAgreement: Joi.boolean(),
    inspection: Joi.boolean(),
    financing: Joi.boolean(),
    titleReview: Joi.boolean(),
    settlementStatement: Joi.boolean(),
  }),
});

export type PurchaseTransactionQuery = {
  status?: string;
  role?: "buyer" | "seller";
  page: number;
  limit: number;
};

export type UpdatePurchaseTransactionInput = {
  status:
    | "deposit_pending"
    | "deposit_received"
    | "closing_review"
    | "title_transfer_pending"
    | "completed"
    | "cancelled"
    | "disputed";
  note?: string;
  depositAmount?: number;
  closingChecklist?: Partial<{
    purchaseAgreement: boolean;
    inspection: boolean;
    financing: boolean;
    titleReview: boolean;
    settlementStatement: boolean;
  }>;
};
