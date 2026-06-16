import { Schema, model, Document, Types } from "mongoose";

export type ComplianceCaseType =
  | "kyc"
  | "ownership_document"
  | "listing"
  | "offer"
  | "lease"
  | "title"
  | "broker_license";
export type ComplianceCaseStatus =
  | "open"
  | "under_review"
  | "resolved"
  | "dismissed";
export type ComplianceSeverity = "low" | "medium" | "high" | "critical";
export type ScreeningProvider = "manual" | "mock";
export type ScreeningStatus = "clear" | "potential_match" | "confirmed_match";
export type BrokerLicenseStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface IComplianceNote {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  body: string;
  createdAt: Date;
}

export interface IComplianceCase extends Document {
  type: ComplianceCaseType;
  status: ComplianceCaseStatus;
  severity: ComplianceSeverity;
  subjectUser?: Types.ObjectId;
  targetType?: string;
  targetId?: Types.ObjectId;
  title: string;
  description?: string;
  assignedTo?: Types.ObjectId;
  resolution?: string;
  metadata?: Record<string, unknown>;
  notes: Types.DocumentArray<IComplianceNote>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRiskScore extends Document {
  subjectType: "user" | "listing" | "offer" | "lease" | "title";
  subjectId: Types.ObjectId;
  score: number;
  level: ComplianceSeverity;
  reasons: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IScreening extends Document {
  subjectUser: Types.ObjectId;
  provider: ScreeningProvider;
  status: ScreeningStatus;
  categories: string[];
  reference?: string;
  rawResult?: Record<string, unknown>;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBrokerLicense extends Document {
  owner: Types.ObjectId;
  licenseNumber: string;
  jurisdiction: string;
  holderName: string;
  expiresAt?: Date;
  documentPublicId?: string;
  documentHash?: string;
  status: BrokerLicenseStatus;
  reviewNote?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const complianceNoteSchema = new Schema<IComplianceNote>(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, maxlength: 4000 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const complianceCaseSchema = new Schema<IComplianceCase>(
  {
    type: {
      type: String,
      enum: [
        "kyc",
        "ownership_document",
        "listing",
        "offer",
        "lease",
        "title",
        "broker_license",
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "under_review", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },
    subjectUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    targetType: { type: String, index: true },
    targetId: { type: Schema.Types.ObjectId, index: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 4000 },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    resolution: { type: String, maxlength: 4000 },
    metadata: Schema.Types.Mixed,
    notes: { type: [complianceNoteSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

const riskScoreSchema = new Schema<IRiskScore>(
  {
    subjectType: {
      type: String,
      enum: ["user", "listing", "offer", "lease", "title"],
      required: true,
      index: true,
    },
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    level: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
      index: true,
    },
    reasons: { type: [String], default: [] },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true, versionKey: false },
);

const screeningSchema = new Schema<IScreening>(
  {
    subjectUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: { type: String, enum: ["manual", "mock"], default: "manual" },
    status: {
      type: String,
      enum: ["clear", "potential_match", "confirmed_match"],
      required: true,
      index: true,
    },
    categories: { type: [String], default: [] },
    reference: String,
    rawResult: Schema.Types.Mixed,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

const brokerLicenseSchema = new Schema<IBrokerLicense>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    licenseNumber: { type: String, required: true, trim: true, index: true },
    jurisdiction: { type: String, required: true, trim: true, index: true },
    holderName: { type: String, required: true, trim: true },
    expiresAt: Date,
    documentPublicId: String,
    documentHash: String,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    reviewNote: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

complianceCaseSchema.index({ status: 1, severity: 1, updatedAt: -1 });
brokerLicenseSchema.index({ owner: 1, jurisdiction: 1, licenseNumber: 1 });

export const ComplianceCase = model<IComplianceCase>(
  "ComplianceCase",
  complianceCaseSchema,
);
export const RiskScore = model<IRiskScore>("RiskScore", riskScoreSchema);
export const Screening = model<IScreening>("Screening", screeningSchema);
export const BrokerLicense = model<IBrokerLicense>(
  "BrokerLicense",
  brokerLicenseSchema,
);
