import { Schema, model, Document, Types } from "mongoose";

export type InquiryStatus = "open" | "responded" | "closed";

export interface IInquiry extends Document {
  listing: Types.ObjectId;
  listingOwner: Types.ObjectId; // denormalized from the listing for fast lookups
  inquirer: Types.ObjectId;
  message: string;
  status: InquiryStatus;
  response?: string;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inquirySchema = new Schema<IInquiry>(
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
    inquirer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    message: { type: String, required: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["open", "responded", "closed"],
      default: "open",
    },
    response: { type: String, maxlength: 2000 },
    respondedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

export const Inquiry = model<IInquiry>("Inquiry", inquirySchema);
