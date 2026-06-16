import Joi from "joi";

export const createRentalApplicationSchema = Joi.object({
  listingId: Joi.string().hex().length(24).required(),
  desiredStartDate: Joi.date().iso().optional(),
  desiredEndDate: Joi.date().iso().greater(Joi.ref("desiredStartDate")).optional(),
  occupants: Joi.number().integer().min(1).max(50).optional(),
  monthlyIncome: Joi.number().min(0).optional(),
  employer: Joi.string().max(200).allow("").optional(),
  message: Joi.string().max(4000).allow("").optional(),
});

export const reviewRentalApplicationSchema = Joi.object({
  status: Joi.string().valid("screening", "approved", "rejected").required(),
  note: Joi.string().max(2000).allow("").optional(),
});

export const screeningSchema = Joi.object({
  status: Joi.string().valid("pending", "passed", "failed", "manual_review").required(),
  provider: Joi.string().max(100).allow("").optional(),
  reference: Joi.string().max(200).allow("").optional(),
  score: Joi.number().min(0).max(1000).optional(),
  notes: Joi.string().max(2000).allow("").optional(),
});

export const appointmentSchema = Joi.object({
  status: Joi.string()
    .valid("requested", "scheduled", "rescheduled", "cancelled", "completed")
    .required(),
  scheduledFor: Joi.date().iso().optional(),
  locationNote: Joi.string().max(500).allow("").optional(),
  note: Joi.string().max(2000).allow("").optional(),
});

export const createLeaseFromApplicationSchema = Joi.object({
  monthlyRent: Joi.number().min(0).required(),
  depositAmount: Joi.number().min(0).required(),
  currency: Joi.string().uppercase().default("USD"),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().greater(Joi.ref("startDate")).required(),
  terms: Joi.string().max(20000).allow("").optional(),
});

export type CreateRentalApplicationInput = {
  listingId: string;
  desiredStartDate?: string;
  desiredEndDate?: string;
  occupants?: number;
  monthlyIncome?: number;
  employer?: string;
  message?: string;
};

export type ReviewRentalApplicationInput = {
  status: "screening" | "approved" | "rejected";
  note?: string;
};

export type ScreeningInput = {
  status: "pending" | "passed" | "failed" | "manual_review";
  provider?: string;
  reference?: string;
  score?: number;
  notes?: string;
};

export type AppointmentInput = {
  status: "requested" | "scheduled" | "rescheduled" | "cancelled" | "completed";
  scheduledFor?: string;
  locationNote?: string;
  note?: string;
};

export type CreateLeaseFromApplicationInput = {
  monthlyRent: number;
  depositAmount: number;
  currency: string;
  startDate: string;
  endDate: string;
  terms?: string;
};
