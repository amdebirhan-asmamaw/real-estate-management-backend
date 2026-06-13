import Joi from "joi";

export const createInquirySchema = Joi.object({
  listingId: Joi.string().hex().length(24).required(),
  message: Joi.string().min(1).max(2000).required(),
});

export const updateInquirySchema = Joi.object({
  status: Joi.string().valid("open", "responded", "closed"),
  response: Joi.string().max(2000),
}).min(1);

export type CreateInquiryInput = { listingId: string; message: string };
export type UpdateInquiryInput = {
  status?: "open" | "responded" | "closed";
  response?: string;
};
