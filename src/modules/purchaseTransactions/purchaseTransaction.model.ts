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

export type PurchaseEscrowState = "none" | "funded" | "released" | "refunded";

export interface IPurchaseEscrow {
  escrowId?: string;
  contractAddress?: string;
  token?: string;
  state: PurchaseEscrowState;
  fundTxHash?: string;
  settleTxHash?: string;
  buyerWallet?: string;
  sellerWallet?: string;
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
  escrow: IPurchaseEscrow;
  termsHash?: string;
  closingChecklist: {
    purchaseAgreement: boolean;
    inspection: boolean;
    financing: boolean;
    titleReview: boolean;
    settlementStatement: boolean;
  };
  dispute?: {
    openedBy?: Types.ObjectId;
    openedAt?: Date;
    reason?: string;
    note?: string;
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

const purchaseEscrowSchema = new Schema<IPurchaseEscrow>(
  {
    escrowId: { type: String },
    contractAddress: { type: String },
    token: { type: String },
    state: {
      type: String,
      enum: ["none", "funded", "released", "refunded"],
      default: "none",
    },
    fundTxHash: { type: String },
    settleTxHash: { type: String },
    buyerWallet: { type: String },
    sellerWallet: { type: String },
  },
  { _id: false },
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
    escrow: { type: purchaseEscrowSchema, default: () => ({ state: "none" }) },
    termsHash: { type: String },
    dispute: {
      openedBy: { type: Schema.Types.ObjectId, ref: "User" },
      openedAt: { type: Date },
      reason: { type: String, maxlength: 2000 },
      note: { type: String, maxlength: 2000 },
    },
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
