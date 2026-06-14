import Joi from "joi";

export const kycUploadSchema = Joi.object({
  type: Joi.string()
    .valid("national_id", "passport", "drivers_license", "other")
    .default("other"),
});

export const kycReviewSchema = Joi.object({
  decision: Joi.string().valid("approve", "reject").required(),
  note: Joi.string().max(2000),
});

export const accountStatusSchema = Joi.object({
  accountStatus: Joi.string()
    .valid("pending", "active", "suspended", "blocked", "rejected")
    .required(),
});

export type KycReviewInput = { decision: "approve" | "reject"; note?: string };
export type AccountStatusInput = {
  accountStatus: "pending" | "active" | "suspended" | "blocked" | "rejected";
};
