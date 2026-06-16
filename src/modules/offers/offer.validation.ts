import Joi from "joi";

export const createOfferSchema = Joi.object({
  listingId: Joi.string().hex().length(24).required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).uppercase().default("USD"),
  message: Joi.string().max(2000).allow("").optional(),
  expiresAt: Joi.date().iso().greater("now").optional(),
});

export const respondOfferSchema = Joi.object({
  action: Joi.string().valid("accept", "reject", "counter").required(),
  counterAmount: Joi.number()
    .positive()
    .when("action", { is: "counter", then: Joi.required() }),
  responseNote: Joi.string().max(2000).allow("").optional(),
});

export type CreateOfferInput = {
  listingId: string;
  amount: number;
  currency: string;
  message?: string;
  expiresAt?: string;
};

export type RespondOfferInput = {
  action: "accept" | "reject" | "counter";
  counterAmount?: number;
  responseNote?: string;
};
