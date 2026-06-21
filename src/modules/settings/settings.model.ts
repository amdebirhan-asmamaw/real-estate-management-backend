import { Schema, model, Document } from "mongoose";

export interface ISystemSettings extends Document {
  // Platform identity
  platformName: string;
  platformEmail: string;
  supportEmail: string;

  // Commission
  commissionRate: number; // percentage, e.g. 2.5 = 2.5%
  commissionType: "percentage" | "flat";
  flatCommissionAmount: number; // used when commissionType === 'flat'
  commissionCurrency: string;

  // Transaction limits
  minTransactionAmount: number;
  maxTransactionAmount: number; // 0 = no limit

  // Feature flags
  escrowEnabled: boolean;
  autoApproveListings: boolean;
  maintenanceMode: boolean;
  allowGuestBrowsing: boolean;

  // Metadata
  updatedBy?: string;
  updatedAt: Date;
  createdAt: Date;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
  {
    // Singleton key — only ever one document
    platformName: { type: String, default: "EstateLedger" },
    platformEmail: { type: String, default: "platform@estateledger.com" },
    supportEmail: { type: String, default: "support@estateledger.com" },

    commissionRate: { type: Number, default: 2.5, min: 0, max: 100 },
    commissionType: {
      type: String,
      enum: ["percentage", "flat"],
      default: "percentage",
    },
    flatCommissionAmount: { type: Number, default: 0, min: 0 },
    commissionCurrency: { type: String, default: "USD" },

    minTransactionAmount: { type: Number, default: 0, min: 0 },
    maxTransactionAmount: { type: Number, default: 0, min: 0 },

    escrowEnabled: { type: Boolean, default: true },
    autoApproveListings: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    allowGuestBrowsing: { type: Boolean, default: true },

    updatedBy: { type: String },
  },
  { timestamps: true },
);

export const SystemSettings = model<ISystemSettings>(
  "SystemSettings",
  SystemSettingsSchema,
);
