import { Schema, model, Document, Types } from "mongoose";

export const NOTIFICATION_TYPES = [
  "kyc.approved",
  "kyc.rejected",
  "listing.review_update",
  "listing.published",
  "inquiry.received",
  "inquiry.responded",
  "offer.received",
  "offer.responded",
  "lease.status_update",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification extends Document {
  recipient: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    message: { type: String, required: true, maxlength: 1000 },
    metadata: Schema.Types.Mixed,
    readAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

export const Notification = model<INotification>(
  "Notification",
  notificationSchema,
);
