import Joi from "joi";

export const signLeaseSchema = Joi.object({
  tenantSignature: Joi.string().max(1000).allow("").optional(),
});

export const createLeaseSchema = Joi.object({
  listingId: Joi.string().hex().length(24).required(),
  tenantId: Joi.string().hex().length(24).required(),
  monthlyRent: Joi.number().min(0).required(),
  depositAmount: Joi.number().min(0).required(),
  currency: Joi.string().uppercase().default("USD"),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().greater(Joi.ref("startDate")).required(),
  terms: Joi.string().max(20000).allow("").optional(),
});

export const disputeResolveSchema = Joi.object({
  decision: Joi.string()
    .valid("release_deposit", "refund_deposit", "cancel")
    .required(),
  note: Joi.string().max(2000).allow("").optional(),
});

export const disputeOpenSchema = Joi.object({
  reason: Joi.string().max(2000).allow("").optional(),
});

export const disputeRespondSchema = Joi.object({
  response: Joi.string().max(2000).required(),
});

export type CreateLeaseInput = {
  listingId: string;
  tenantId: string;
  monthlyRent: number;
  depositAmount: number;
  currency: string;
  startDate: string;
  endDate: string;
  terms?: string;
};

export type DisputeResolveInput = {
  decision: "release_deposit" | "refund_deposit" | "cancel";
  note?: string;
};

export type SignLeaseInput = {
  tenantSignature?: string;
};

export type DisputeOpenInput = {
  reason?: string;
};

export type DisputeRespondInput = {
  response: string;
};
