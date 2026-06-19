import { Schema, model, Document, Types } from "mongoose";

export const CHAIN_TRANSACTION_OPERATIONS = [
  "title.mint",
  "title.dispute",
  "title.clear_dispute",
  "title.revoke",
  "title.transfer",
  "lease_escrow.open_and_fund",
  "lease_escrow.activate",
  "lease_escrow.cancel",
  "lease_escrow.release_deposit",
  "lease_escrow.refund_deposit",
  "sale_escrow.open_and_fund",
  "sale_escrow.release",
  "sale_escrow.refund",
] as const;

export const CHAIN_TRANSACTION_STATUSES = [
  "submitted",
  "pending",
  "mined",
  "confirmed",
  "reverted",
  "stale",
  "reconciled",
  "failed",
] as const;

export type ChainTransactionOperation =
  (typeof CHAIN_TRANSACTION_OPERATIONS)[number];
export type ChainTransactionStatus =
  (typeof CHAIN_TRANSACTION_STATUSES)[number];
export type ChainTransactionTargetType =
  | "listing"
  | "lease"
  | "purchase_transaction";

export interface IChainTransaction extends Document {
  operation: ChainTransactionOperation;
  status: ChainTransactionStatus;
  targetType: ChainTransactionTargetType;
  targetId: Types.ObjectId;
  contractAddress?: string;
  txHash?: string;
  errorMessage?: string;
  blockNumber?: number;
  confirmedAt?: Date;
  reconciledAt?: Date;
  staleAt?: Date;
  metadata?: Record<string, unknown>;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const chainTransactionSchema = new Schema<IChainTransaction>(
  {
    operation: {
      type: String,
      enum: CHAIN_TRANSACTION_OPERATIONS,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: CHAIN_TRANSACTION_STATUSES,
      default: "pending",
      index: true,
    },
    targetType: {
      type: String,
      enum: ["listing", "lease", "purchase_transaction"],
      required: true,
      index: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    contractAddress: String,
    txHash: { type: String, index: true },
    errorMessage: String,
    blockNumber: Number,
    confirmedAt: Date,
    reconciledAt: Date,
    staleAt: Date,
    metadata: Schema.Types.Mixed,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

chainTransactionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const ChainTransaction = model<IChainTransaction>(
  "ChainTransaction",
  chainTransactionSchema,
);
