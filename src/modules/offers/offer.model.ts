import { Schema, model, Document, Types } from "mongoose";

export type OfferStatus =
  | "submitted"
  | "accepted"
  | "rejected"
  | "countered"
  | "cancelled";

export interface IOffer extends Document {
  listing: Types.ObjectId;
  listingOwner: Types.ObjectId;
  buyer: Types.ObjectId;
  amount: number;
  currency: string;
  message?: string;
  status: OfferStatus;
  counterAmount?: number;
  responseNote?: string;
  expiresAt?: Date;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const offerSchema = new Schema<IOffer>(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    listingOwner: {
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
    message: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ["submitted", "accepted", "rejected", "countered", "cancelled"],
      default: "submitted",
      index: true,
    },
    counterAmount: { type: Number, min: 0 },
    responseNote: { type: String, maxlength: 2000 },
    expiresAt: Date,
    respondedAt: Date,
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

offerSchema.index({ listing: 1, buyer: 1, status: 1 });

export const Offer = model<IOffer>("Offer", offerSchema);
