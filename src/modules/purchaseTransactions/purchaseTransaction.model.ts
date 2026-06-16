import { Schema, model, Document, Types } from "mongoose";

export type PurchaseTransactionStatus =
  | "offer_accepted"
  | "deposit_pending"
  | "deposit_received"
  | "closing_review"
  | "title_transfer_pending"
  | "completed"
  | "cancelled"
  | "disputed";

export interface IPurchaseTimelineEvent {
  _id: Types.ObjectId;
  status: PurchaseTransactionStatus;
  note?: string;
  actor?: Types.ObjectId;
  createdAt: Date;
}

export interface IPurchaseTransaction extends Document {
  listing: Types.ObjectId;
  offer: Types.ObjectId;
  seller: Types.ObjectId;
  buyer: Types.ObjectId;
  amount: number;
  currency: string;
  status: PurchaseTransactionStatus;
  depositAmount?: number;
  closingChecklist: {
    purchaseAgreement: boolean;
    inspection: boolean;
    financing: boolean;
    titleReview: boolean;
    settlementStatement: boolean;
  };
  timeline: Types.DocumentArray<IPurchaseTimelineEvent>;
  createdAt: Date;
  updatedAt: Date;
}

const timelineEventSchema = new Schema<IPurchaseTimelineEvent>(
  {
    status: {
      type: String,
      enum: [
        "offer_accepted",
        "deposit_pending",
        "deposit_received",
        "closing_review",
        "title_transfer_pending",
        "completed",
        "cancelled",
        "disputed",
      ],
      required: true,
    },
    note: { type: String, maxlength: 2000 },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const purchaseTransactionSchema = new Schema<IPurchaseTransaction>(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    offer: {
      type: Schema.Types.ObjectId,
      ref: "Offer",
      required: true,
      unique: true,
      index: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true },
    status: {
      type: String,
      enum: [
        "offer_accepted",
        "deposit_pending",
        "deposit_received",
        "closing_review",
        "title_transfer_pending",
        "completed",
        "cancelled",
        "disputed",
      ],
      default: "offer_accepted",
      index: true,
    },
    depositAmount: { type: Number, min: 0 },
    closingChecklist: {
      purchaseAgreement: { type: Boolean, default: false },
      inspection: { type: Boolean, default: false },
      financing: { type: Boolean, default: false },
      titleReview: { type: Boolean, default: false },
      settlementStatement: { type: Boolean, default: false },
    },
    timeline: { type: [timelineEventSchema], default: [] },
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

purchaseTransactionSchema.index({ buyer: 1, updatedAt: -1 });
purchaseTransactionSchema.index({ seller: 1, updatedAt: -1 });

export const PurchaseTransaction = model<IPurchaseTransaction>(
  "PurchaseTransaction",
  purchaseTransactionSchema,
);
