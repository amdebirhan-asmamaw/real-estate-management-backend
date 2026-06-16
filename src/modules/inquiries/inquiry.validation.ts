import Joi from "joi";

export const createInquirySchema = Joi.object({
  listingId: Joi.string().hex().length(24).required(),
  inquiryType: Joi.string().valid("rent", "buy", "general").default("general"),
  message: Joi.string().min(1).max(2000).required(),
});

export const updateInquirySchema = Joi.object({
  status: Joi.string().valid("open", "responded", "in_discussion", "closed", "spam"),
  response: Joi.string().max(2000),
}).min(1);

export const adminListInquiriesSchema = Joi.object({
  status: Joi.string().valid("open", "responded", "in_discussion", "closed", "spam"),
  listingId: Joi.string().hex().length(24),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type CreateInquiryInput = { listingId: string; inquiryType?: string; message: string };
export type UpdateInquiryInput = {
  status?: "open" | "responded" | "in_discussion" | "closed" | "spam";
  response?: string;
};
export type AdminListInquiriesQuery = {
  status?: string;
  listingId?: string;
  page: number;
  limit: number;
};
