import { Schema, model, Document, Types } from "mongoose";

export type MaintenanceRecordType =
  | "maintenance"
  | "repair"
  | "utility"
  | "tax"
  | "insurance"
  | "management"
  | "other";

export interface IMaintenanceRecord extends Document {
  listing: Types.ObjectId;
  lease?: Types.ObjectId;
  owner: Types.ObjectId;
  type: MaintenanceRecordType;
  amount: number;
  currency: string;
  incurredAt: Date;
  note?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const maintenanceRecordSchema = new Schema<IMaintenanceRecord>(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    lease: { type: Schema.Types.ObjectId, ref: "Lease", index: true },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "maintenance",
        "repair",
        "utility",
        "tax",
        "insurance",
        "management",
        "other",
      ],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD", uppercase: true },
    incurredAt: { type: Date, required: true, index: true },
    note: { type: String, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);

maintenanceRecordSchema.index({ listing: 1, incurredAt: -1 });

export const MaintenanceRecord = model<IMaintenanceRecord>(
  "MaintenanceRecord",
  maintenanceRecordSchema,
);
