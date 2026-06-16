import Joi from "joi";

export const complianceCaseQuerySchema = Joi.object({
  status: Joi.string().valid("open", "under_review", "resolved", "dismissed"),
  severity: Joi.string().valid("low", "medium", "high", "critical"),
  type: Joi.string().valid(
    "kyc",
    "ownership_document",
    "listing",
    "offer",
    "lease",
    "title",
    "broker_license",
  ),
  subjectUser: Joi.string().hex().length(24),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const updateComplianceCaseSchema = Joi.object({
  status: Joi.string().valid("open", "under_review", "resolved", "dismissed"),
  severity: Joi.string().valid("low", "medium", "high", "critical"),
  assignedTo: Joi.string().hex().length(24).allow(null),
  resolution: Joi.string().max(4000).allow(""),
  note: Joi.string().max(4000).allow(""),
}).min(1);

export const createScreeningSchema = Joi.object({
  subjectUser: Joi.string().hex().length(24).required(),
  provider: Joi.string().valid("manual", "mock").default("manual"),
  status: Joi.string().valid("clear", "potential_match", "confirmed_match").required(),
  categories: Joi.array().items(Joi.string().max(120)).default([]),
  reference: Joi.string().max(200).allow(""),
  rawResult: Joi.object().unknown(true),
});

export const brokerLicenseSchema = Joi.object({
  licenseNumber: Joi.string().max(120).required(),
  jurisdiction: Joi.string().max(120).required(),
  holderName: Joi.string().max(160).required(),
  expiresAt: Joi.date().iso().optional(),
  documentPublicId: Joi.string().max(500).allow(""),
  documentHash: Joi.string().hex().min(32).max(128).allow(""),
});

export const reviewBrokerLicenseSchema = Joi.object({
  decision: Joi.string().valid("approve", "reject", "expire").required(),
  note: Joi.string().max(2000).allow(""),
});

export const brokerLicenseQuerySchema = Joi.object({
  owner: Joi.string().hex().length(24),
  status: Joi.string().valid("pending", "approved", "rejected", "expired"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export type ComplianceCaseQuery = {
  status?: string;
  severity?: string;
  type?: string;
  subjectUser?: string;
  page: number;
  limit: number;
};

export type UpdateComplianceCaseInput = {
  status?: "open" | "under_review" | "resolved" | "dismissed";
  severity?: "low" | "medium" | "high" | "critical";
  assignedTo?: string | null;
  resolution?: string;
  note?: string;
};

export type CreateScreeningInput = {
  subjectUser: string;
  provider: "manual" | "mock";
  status: "clear" | "potential_match" | "confirmed_match";
  categories: string[];
  reference?: string;
  rawResult?: Record<string, unknown>;
};

export type BrokerLicenseInput = {
  licenseNumber: string;
  jurisdiction: string;
  holderName: string;
  expiresAt?: string;
  documentPublicId?: string;
  documentHash?: string;
};

export type ReviewBrokerLicenseInput = {
  decision: "approve" | "reject" | "expire";
  note?: string;
};
