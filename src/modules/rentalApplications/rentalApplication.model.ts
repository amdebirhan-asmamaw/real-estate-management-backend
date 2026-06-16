import { Schema, model, Document, Types } from "mongoose";

export type RentalApplicationStatus =
  | "submitted"
  | "screening"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "lease_created";

export type AppointmentStatus =
  | "requested"
  | "scheduled"
  | "rescheduled"
  | "cancelled"
  | "completed";

export interface IRentalApplication extends Document {
  listing: Types.ObjectId;
  landlord: Types.ObjectId;
  tenant: Types.ObjectId;
  status: RentalApplicationStatus;
  desiredStartDate?: Date;
  desiredEndDate?: Date;
  occupants?: number;
  monthlyIncome?: number;
  employer?: string;
  message?: string;
  screening: {
    status: "not_started" | "pending" | "passed" | "failed" | "manual_review";
    provider?: string;
    reference?: string;
    score?: number;
    completedAt?: Date;
    notes?: string;
  };
  appointment?: {
    status: AppointmentStatus;
    requestedAt?: Date;
    scheduledFor?: Date;
    locationNote?: string;
    note?: string;
  };
  lease?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const screeningSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["not_started", "pending", "passed", "failed", "manual_review"],
      default: "not_started",
    },
    provider: String,
    reference: String,
    score: Number,
    completedAt: Date,
    notes: String,
  },
  { _id: false },
);

const appointmentSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["requested", "scheduled", "rescheduled", "cancelled", "completed"],
      required: true,
    },
    requestedAt: Date,
    scheduledFor: Date,
    locationNote: String,
    note: String,
  },
  { _id: false },
);

const rentalApplicationSchema = new Schema<IRentalApplication>(
  {
    listing: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    landlord: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenant: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["submitted", "screening", "approved", "rejected", "withdrawn", "lease_created"],
      default: "submitted",
      index: true,
    },
    desiredStartDate: Date,
    desiredEndDate: Date,
    occupants: { type: Number, min: 1 },
    monthlyIncome: { type: Number, min: 0 },
    employer: String,
    message: String,
    screening: { type: screeningSchema, default: () => ({ status: "not_started" }) },
    appointment: appointmentSchema,
    lease: { type: Schema.Types.ObjectId, ref: "Lease" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    reviewNote: String,
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        return ret;
      },
    },
  },
);

rentalApplicationSchema.index(
  { listing: 1, tenant: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $nin: ["withdrawn", "rejected"] } },
  },
);

export const RentalApplication = model<IRentalApplication>(
  "RentalApplication",
  rentalApplicationSchema,
);
