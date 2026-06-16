import { Schema, model, Document, Types } from "mongoose";

export type LeaseStatus =
  | "draft"
  | "proposed"
  | "active"
  | "completed"
  | "terminated"
  | "cancelled"
  | "disputed";

export type EscrowState = "none" | "funded" | "active" | "closed";

export interface ILeaseEscrow {
  escrowId?: string;
  contractAddress?: string;
  token?: string;
  state: EscrowState;
  fundTxHash?: string;
  activateTxHash?: string;
  settleTxHash?: string;
  landlordWallet?: string;
  tenantWallet?: string;
}

export interface ILease extends Document {
  listing: Types.ObjectId;
  landlord: Types.ObjectId;
  tenant: Types.ObjectId;
  currency: string;
  monthlyRent: number;
  depositAmount: number;
  escrowAmount: number;
  startDate: Date;
  endDate: Date;
  terms?: string;
  termsHash?: string;
  status: LeaseStatus;
  escrow: ILeaseEscrow;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const escrowSchema = new Schema<ILeaseEscrow>(
  {
    escrowId: String,
    contractAddress: String,
    token: String,
    state: {
      type: String,
      enum: ["none", "funded", "active", "closed"],
      default: "none",
    },
    fundTxHash: String,
    activateTxHash: String,
    settleTxHash: String,
    landlordWallet: String,
    tenantWallet: String,
  },
  { _id: false },
);

const leaseSchema = new Schema<ILease>(
  {
    listing: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    landlord: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenant: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    currency: { type: String, default: "USD", uppercase: true },
    monthlyRent: { type: Number, required: true, min: 0 },
    depositAmount: { type: Number, required: true, min: 0 },
    escrowAmount: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    terms: String,
    termsHash: String,
    status: {
      type: String,
      enum: [
        "draft",
        "proposed",
        "active",
        "completed",
        "terminated",
        "cancelled",
        "disputed",
      ],
      default: "draft",
      index: true,
    },
    escrow: { type: escrowSchema, default: () => ({ state: "none" }) },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
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

export const Lease = model<ILease>("Lease", leaseSchema);
